const {
	time,
	loadFixture,
	helpers,
} = require("@nomicfoundation/hardhat-network-helpers");
// const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

const {
	deployContractsFixture,
	deployBorrowFixture,
	deployFlashLoanFixture,
	deployFlashLoanBorrowedFixture,
	deployFlashLoanUNIPriceDropFixture,
	deployFlashLoanLiquadateFixture,
	NEW_COLLATERAL_FACTOR,
	DECIMAL,
	USDC_DECIMAL,
	DEFAULT_BLOCKNUMBER,
	NEW_UNITOKEN_PRICE,
	USDC_BORROW_AMOUNT,
	ORIGINAL_USER2_USDC_AMOUNT,
} = require("./setup");

const { LogLevel, Logger } = require("@ethersproject/logger");
Logger.setLogLevel(LogLevel.ERROR);

describe("Mint/Redeem", async function () {
	it("should be able to mint cCat with catToken and redeem back", async function () {
		const { catToken, cCat, owner, user1 } = await loadFixture(
			deployContractsFixture
		);
		expect(await ethers.provider.getBlockNumber()).to.eq(
			DEFAULT_BLOCKNUMBER + 11
		);
		// 在 CatToken.sol 本來就有寫先給 owner 100 catTokens
		expect(await catToken.balanceOf(owner.address)).to.eq(100n * DECIMAL);
		// 確認 user1 有 1000 catToken
		expect(await catToken.balanceOf(user1.address)).to.eq(1000n * DECIMAL);

		// catToken approve cCat use
		await catToken
			.connect(user1)
			.approve(cCat.address, ethers.utils.parseUnits("100", 18));
		// user use 100 catToken to mint 100 cCat
		await expect(
			cCat.connect(user1).mint(ethers.utils.parseUnits("100", 18))
		).to.changeTokenBalances(
			cCat,
			[user1.address],
			[ethers.utils.parseUnits("100", 18)]
		);

		// user has 1000 - 100 = 900 catTokens left
		expect(await catToken.balanceOf(user1.address)).to.eq(900n * DECIMAL);
		// user has 100 cToken
		expect(await cCat.balanceOf(user1.address)).to.eq(100n * DECIMAL);

		// user use 100 cErc20 to redeem 100 erc20
		await expect(
			cCat.connect(user1).redeem(ethers.utils.parseUnits("100", 18))
		).to.changeTokenBalances(
			cCat,
			[user1.address],
			[ethers.utils.parseUnits("-100", 18)]
		);

		// user has 900 + 100 = 1000 GCDTokens
		expect(await catToken.balanceOf(user1.address)).to.eq(1000n * DECIMAL);
		// user has 0 cToken
		expect(await cCat.balanceOf(user1.address)).to.eq(0n * DECIMAL);
	});
});

// 讓 user1 borrow/repay
// 延續上題，部署另一份 CErc20 合約
// 在 Oracle 中設定一顆 token A 的價格為 $1，一顆 token B 的價格為 $100
// Token B 的 collateral factor 為 50%
// User1 使用 1 顆 token B 來 mint cToken
// User1 使用 token B 作為抵押品來借出 50 顆 token A
describe("Borrow / repayBorrow", async function () {
	it("should User1 使用 dragonToken 作為抵押品來借出 50 顆 catTokens", async function () {
		const { catToken, dragonToken, cCat, cDragon, owner, user1 } =
			await loadFixture(deployBorrowFixture);
		expect(await ethers.provider.getBlockNumber()).to.eq(
			DEFAULT_BLOCKNUMBER + 35
		);
		// 確認 cCat 池子大小 & 流動性
		expect(await cCat.balanceOf(owner.address)).to.eq(100n * DECIMAL);
		expect(await cCat.getCash()).to.eq(100n * DECIMAL);

		// user1 有 1 顆 cDragon
		expect(await cDragon.balanceOf(user1.address)).to.eq(1n * DECIMAL);
		// user1 借出 50 CatToken
		await cCat.connect(user1).borrow(50n * DECIMAL);
		expect(await catToken.balanceOf(user1.address)).to.eq(50n * DECIMAL);
	});

	// 調整 token A 的 collateral factor，讓 user1 被 user2 清算
	describe("when collateral factor of catToken changes", async function () {
		it("user2 can liquidated user1", async function () {
			const { catToken, cCat, cDragon, user1, user2 } = await loadFixture(
				deployBorrowFixture
			);
			expect(await ethers.provider.getBlockNumber()).to.eq(
				DEFAULT_BLOCKNUMBER + 35
			);

			// 確認 user1 有 1 顆 cDragon
			expect(await cDragon.balanceOf(user1.address)).to.eq(1n * DECIMAL);
			// user1 借了 50 CatToken
			await cCat.connect(user1).borrow(50n * DECIMAL);
			// 重設抵押率，從 50% --> 30%
			await comptroller._setCollateralFactor(
				cDragon.address,
				NEW_COLLATERAL_FACTOR
			);

			// user2 準備幫 user1 還 CatToken
			await catToken.mint(user2.address, ethers.utils.parseUnits("100", 18));
			await catToken.connect(user2).approve(cCat.address, 25n * DECIMAL);

			// user2 幫 user1 還一半 CatToken
			await cCat
				.connect(user2)
				.liquidateBorrow(user1.address, 25n * DECIMAL, cDragon.address);

			// user2 原本有 100 CatToken 幫 user1 還 25 CatToken 後，應該只剩 75 CatToken
			const user2CatTokenBalance = await catToken.balanceOf(user2.address);
			expect(user2CatTokenBalance).to.equal(ethers.utils.parseUnits("75", 18));

			// user2 代還 25 catToken 款後
			// 25 catToken 等於 0.25 dragonToken
			// 0.25 * 1.1 = 0.275
			// user2 會取得 0.275 個 cDragon

			// 預設的平台抽成定義在 CTokenInterface 中
			// uint public constant protocolSeizeShareMantissa = 2.8e16; //2.8%
			// 所以 user2 真正會拿到的是： 0.275 * (1-2.8%) = 0.2673
			const user2cDragonBalance = await cDragon.balanceOf(user2.address);
			expect(user2cDragonBalance).to.equal(
				ethers.utils.parseUnits("0.2673", 18)
			);
		});
	});

	// 調整 oracle 中的 token B 的價格，讓 user1 被 user2 清算
	describe("when price of dragonToken changes", async function () {
		it("user2 can liquidated user1", async function () {
			const { catToken, priceOracle, cCat, cDragon, user1, user2 } =
				await loadFixture(deployBorrowFixture);
			expect(await ethers.provider.getBlockNumber()).to.eq(
				DEFAULT_BLOCKNUMBER + 35
			);
			// 確認 user1 有 1 顆 cDragon
			expect(await cDragon.balanceOf(user1.address)).to.eq(1n * DECIMAL);
			// user1 借了 50 CatToken
			await cCat.connect(user1).borrow(50n * DECIMAL);
			// 重設 dragon price ， 從 $100 --> $50
			await priceOracle.setUnderlyingPrice(cDragon.address, 50n * DECIMAL);

			// user2 準備幫 user1 還 CatToken
			await catToken.mint(user2.address, ethers.utils.parseUnits("100", 18));
			await catToken.connect(user2).approve(cCat.address, 25n * DECIMAL);

			// user2 幫 user1 還一半 CatToken
			await cCat
				.connect(user2)
				.liquidateBorrow(user1.address, 25n * DECIMAL, cDragon.address);

			// user2 原本有 100 CatToken 幫 user1 還 25 CatToken 後，應該只剩 75 CatToken
			const user2CatTokenBalance = await catToken.balanceOf(user2.address);
			expect(user2CatTokenBalance).to.equal(ethers.utils.parseUnits("75", 18));

			// user2 代還 25 catToken 款後
			// 現在的 price: 1 catToken		 = $  1
			//              1 dragonToken	= $ 50
			//              1 catToken      = 0.02 dragonToken
			// 25 catToken 等於 0.5 dragonToken
			// 0.5 * 1.1 = 0.55
			// user2 會取得 0.55 個 cDragon

			// 預設的平台抽成定義在 CTokenInterface 中
			// uint public constant protocolSeizeShareMantissa = 2.8e16; //2.8%
			// 所以 user2 真正會拿到的是： 0.55 * (1-2.8%) = 0.5346
			const user2cDragonBalance = await cDragon.balanceOf(user2.address);
			expect(user2cDragonBalance).to.equal(
				ethers.utils.parseUnits("0.5346", 18)
			);
		});
	});
});

describe("FlashLoan", async function () {
	it("should give owner and user1 right amount of USDC and UNI", async function () {
		const { owner, user1, usdc, uni } = await loadFixture(
			deployFlashLoanFixture
		);
		expect(await usdc.balanceOf(owner.address)).to.eq(10000n * USDC_DECIMAL);
		expect(await usdc.balanceOf(owner.address)).to.eq(
			ethers.utils.parseUnits("10000", 6)
		);
		expect(await uni.balanceOf(owner.address)).to.eq(10000n * DECIMAL);
		expect(await uni.balanceOf(owner.address)).to.eq(
			ethers.utils.parseUnits("10000", 18)
		);
	});

	it("cUSDC/cUNI 的 decimals 皆為 18, 初始 exchangeRate 為 1:1", async function () {
		const { cUSDC, cUNI } = await loadFixture(deployFlashLoanFixture);
		expect(await cUSDC.decimals()).to.eq(18);
		expect(await cUNI.decimals()).to.eq(18);
		expect(await cUSDC.exchangeRateStored()).to.eq(USDC_DECIMAL);
		expect(await cUNI.exchangeRateStored()).to.eq(DECIMAL);
	});

	it("Close factor 設定為 50%", async function () {
		const { comptroller } = await loadFixture(deployFlashLoanFixture);
		expect(await comptroller.closeFactorMantissa()).to.eq(
			ethers.utils.parseUnits("0.5", 18)
		);
	});

	it("Liquidation incentive 設為 10% (1.1 * 1e18)", async function () {
		const { comptroller } = await loadFixture(deployFlashLoanFixture);
		expect(await comptroller.liquidationIncentiveMantissa()).to.eq(
			ethers.utils.parseUnits("1.1", 18)
		);
	});

	it("USDC price is $1 by oracle", async function () {
		const { priceOracle, cUSDC } = await loadFixture(deployFlashLoanFixture);
		expect(await priceOracle.getUnderlyingPrice(cUSDC.address)).to.eq(
			1n * DECIMAL * 10n ** 12n
		);
	});

	it("UNI price is $10 by oracle", async function () {
		const { priceOracle, cUNI } = await loadFixture(deployFlashLoanFixture);
		expect(await priceOracle.getUnderlyingPrice(cUNI.address)).to.eq(
			10n * DECIMAL
		);
	});

	it("user1 can mint 1000 cUNI", async function () {
		const { user1, cUNI } = await loadFixture(deployFlashLoanFixture);
		expect(await cUNI.balanceOf(user1.address)).to.eq(1000n * DECIMAL);
	});

	it("user1 can borrow 5000 USDC using 1000 cUNI as collateral", async function () {
		const { usdc, user1, cUSDC } = await loadFixture(
			deployFlashLoanBorrowedFixture
		);

		expect(await usdc.balanceOf(cUSDC.address)).to.eq(USDC_BORROW_AMOUNT);
		expect(
			cUSDC.connect(user1).borrow(USDC_BORROW_AMOUNT)
		).to.changeTokenBalances(
			usdc,
			[cUSDC, user1],
			[-USDC_BORROW_AMOUNT, USDC_BORROW_AMOUNT]
		);
	});

	it("將 UNI 價格改為 $6.2, user1 has Shortfall", async function () {
		// 原本是用 1,000 UNI($10/UNI) 借出了 5,000 USDC ($1/USDC)
		// 總抵押價值為 $ 10,000, 總借出價值為 $ 5,000
		// collateral factor 為 50%
		// 結果 UNI 價格掉落到 $6.2，總抵押價值剩下 6,200
		// 最多只能借 6,200 * 50% = 3,100
		// shortfall 會是 $1900
		//
		// 以上的價值都是 USD 計價
		const { comptroller, user1, cUNI, priceOracle } = await loadFixture(
			deployFlashLoanUNIPriceDropFixture
		);

		expect(await priceOracle.getUnderlyingPrice(cUNI.address)).to.eq(
			NEW_UNITOKEN_PRICE
		);

		const result = await comptroller.getAccountLiquidity(user1.address);
		// result[0] 是 error number
		// result[1] 是 liquidity
		// result[2] 是 shortfall
		const shortfall = result[2];

		expect(shortfall).to.gt(0);
		expect(shortfall).to.eq(1900n * DECIMAL);
	});

	it("user2 can liquadte user1, get right amount of UNI", async function () {
		const { uni, user2 } = await loadFixture(deployFlashLoanLiquadateFixture);
		const result = await uni.balanceOf(user2.address);

		expect(result).to.eq(163829032258064516129n);
	});

	it("將 UNI 價格改為 $6.2, user2 use AAVE 的 Flash loan 來清算 User1", async function () {
		const { owner, user1, user2 } = await loadFixture(
			deployFlashLoanLiquadateUsingContractFixture
		);
		// 清算 50% 後是不是大約可以賺 121 USD
	});
});
