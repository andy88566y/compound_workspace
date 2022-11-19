// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;
import "./flashloan/interfaces/ILendingPoolAddressesProvider.sol";
import "./flashloan/interfaces/ILendingPool.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CErc20} from "../compound/CErc20.sol";
// uniswap related
import {TransferHelper} from "@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol";
import {ISwapRouter} from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import "hardhat/console.sol";

// https://docs.aave.com/developers/guides/flash-loans#execution-flow

interface IFlashLoanReceiver {
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool);

    function ADDRESSES_PROVIDER() external view returns (address);

    function LENDING_POOL() external view returns (address);
}

contract GCDFlashloan is IFlashLoanReceiver {
    event FlashLoanSuccess(uint256 n1, uint256 n2);

    address public immutable override ADDRESSES_PROVIDER;
    address public immutable override LENDING_POOL;

    // pool fee set to 0.3%.
    uint24 public constant poolFee = 3000;

    // UNISwap，用來把 UNI 換回 USDC 算到底賺多少
    ISwapRouter public immutable swapRouter;

    address public admin;

    constructor(
        address provider,
        address lendingPool,
        ISwapRouter _swapRouter // 直接當成參數都進來省 local variable 用量
    ) {
        ADDRESSES_PROVIDER = provider;
        LENDING_POOL = lendingPool;
        swapRouter = _swapRouter;
        admin = msg.sender;
    }

    // 別把錢留在合約中
    function withdraw(IERC20 asset, uint256 amount) external {
        require(msg.sender == admin, "Only admin can withdraw");

        asset.transfer(admin, amount);
    }

    // flashLoan 借到錢後會執行這個 function
    // 用借到的錢做我想做的事情
    // 做完事情後記得 approve 要還錢的 token
    // flashLoan 後續才能成功轉錢回去，完成閃電貸
    // 在這個例子中，我們的目標是把從 flashLoan 那邊借來的錢
    // (幣種為 assets[0], 數量在 amounts[0] 中)
    // 應該為借 足夠額度的 USDC
    // 拿去 Compound 那邊清算 user1
    // 清算完後，還 flashLoan USDC + 手續費(premiums[0])
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address _initiator,
        bytes calldata params
    ) external virtual override returns (bool) {
        // console.log("inside executeOperation, assets[0]:");
        // console.log(assets[0]);
        // console.log("inside executeOperation, amounts[0]:");
        // console.log(amounts[0]);
        // console.log("inside executeOperation, premiums[0]:");
        // console.log(premiums[0]);
        // 把 params 解析出來方便使用
        // 這個 params 是自己定義好的，就是在這邊使用
        // flashLoan 就是把整包丟過來
        (
            address borrower, // user1
            address liquidateAddress, // user2
            address rewardAddress, // 清算得到的 cToken addr
            address rewardErc20Address // cToken underlying ERC20 addr
        ) = abi.decode(params, (address, address, address, address));
        uint256 redeemTokensAmount;
        ISwapRouter.ExactInputSingleParams memory uniSwapparams;
        uint256 rewardBalances;

        // should be USDC address
        IERC20(assets[0]).approve(liquidateAddress, amounts[0]);

        // 在這邊執行 user2 對 user1 清算
        CErc20(liquidateAddress).liquidateBorrow(
            borrower,
            amounts[0],
            CErc20(rewardAddress)
        );

        {
            // 清算得到的獎勵會在此合約中
            redeemTokensAmount = IERC20(rewardAddress).balanceOf(address(this));

            // 把清算得到的 cToken(cUNI) 轉換回 ERC20(UNI)
            CErc20(rewardAddress).redeem(redeemTokensAmount);

            // 清算得到的 UNI
            rewardBalances = IERC20(rewardErc20Address).balanceOf(
                address(this)
            );

            // Approve UNISwap router 讓他可以幫我們把 UNI swap 回 USDC
            TransferHelper.safeApprove(
                rewardErc20Address,
                address(swapRouter),
                rewardBalances
            );
        }

        {
            // amountOutMinimum 在這邊先設定為 0 方便實驗
            // 實際上這表示 swap 最少要收到的目標 tokenOut 數目，表示可接受的滑價
            // 在 production 上，這個數字的設計會牽涉到別人容不容易三明治攻擊
            // sqrtPriceLimitx96 不是很懂
            // 準備 params
            uniSwapparams = ISwapRouter.ExactInputSingleParams({
                tokenIn: rewardErc20Address, // UNI
                tokenOut: assets[0], // USDC
                fee: poolFee, // swap 手續費
                recipient: address(this), // 先拿回此合約
                deadline: block.timestamp,
                amountIn: rewardBalances, // 清算得到的 UNI amount
                amountOutMinimum: 0, // 最小得到 USDC 數目，滑價相關
                sqrtPriceLimitX96: 0
            });
            // 真正執行 UniSwap，結果就是清算後得到的 USDC 數目
            uint256 amountOut = swapRouter.exactInputSingle(uniSwapparams);

            // amounts[0] 當初和 flashLoan 借款數量
            // premiums[0] 額外費用，手續費
            uint256 amountOwing = amounts[0] + premiums[0];
            // 要有賺錢我們才還 flashLoan 錢，不然這個 transaction 就不成立
            if (amountOut > amountOwing) {
                // Approve the LendingPool contract allowance to *pull* the owed amount
                IERC20(assets[0]).approve(address(LENDING_POOL), amountOwing);
                emit FlashLoanSuccess(amountOut, amountOwing);
            }
        }

        return true;
    }
}
