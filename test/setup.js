const { ethers } = require("hardhat");
const { int } = require("hardhat/internal/core/params/argumentTypes");
const { DEFAULT_FLAGS } = require("typechain");
require("dotenv").config();
const BigNumber = require("bignumber.js");
const URL = process.env.URL;
const OLD_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
const NEW_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.3", 18);
const DECIMAL = 10n ** 18n;
const USDC_DECIMAL = 10n ** 6n;
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const UNI_ADDRESS = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
const USDC_FAUCET_ADDRESS = "0xf977814e90da44bfa03b6295a0616a897441acec";
const UNI_FAUCET_ADDRESS = "0x47173b170c64d16393a52e6c480b3ad8c302ba1e";
const NEW_UNITOKEN_PRICE = (62n * DECIMAL) / 10n;
const USDC_BORROW_AMOUNT = 5000n * USDC_DECIMAL;
const CLOSE_FACTOR = ethers.utils.parseUnits("0.5", 18);
// Price For USDC DECIMAL
const USDCTOKEN_PRICE = 1n * DECIMAL * 10n ** 12n;
const UNITOKEN_PRICE = 10n * DECIMAL;
const ORIGINAL_USER2_USDC_AMOUNT = 10000n * USDC_DECIMAL;

async function deployContractsFixture() {
	hardhatReset();
	// deploy contracts
	catToken = await deployToken("CatToken");
	dragonToken = await deployToken("DragonToken");
	comptroller = await deployComptroller();
	interestRateModel = await deployInterestRateModel();
	cCat = await deployCToken(catToken, comptroller, interestRateModel);
	cDragon = await deployCToken(dragonToken, comptroller, interestRateModel);
	comptroller._supportMarket(cCat.address);
	comptroller._supportMarket(cDragon.address);
	const [owner, user1, user2] = await ethers.getSigners();
	await catToken.mint(user1.address, ethers.utils.parseUnits("1000", 18));

	return {
		catToken,
		dragonToken,
		comptroller,
		interestRateModel,
		cCat,
		cDragon,
		owner,
		user1,
		user2,
	};
}

async function deployBorrowFixture() {
	const [owner, user1, user2] = await ethers.getSigners();
	// deploy contracts
	catToken = await deployToken("CatToken");
	dragonToken = await deployToken("DragonToken");
	comptroller = await deployComptroller();
	interestRateModel = await deployInterestRateModel();
	cCat = await deployCToken(catToken, comptroller, interestRateModel);
	cDragon = await deployCToken(dragonToken, comptroller, interestRateModel);

	priceOracle = await deployPriceOracle();
	await priceOracle.setUnderlyingPrice(cCat.address, 1n * DECIMAL);
	await priceOracle.setUnderlyingPrice(cDragon.address, 100n * DECIMAL);

	comptroller._supportMarket(cCat.address);
	comptroller._supportMarket(cDragon.address);
	// setting priceOracle
	await comptroller._setPriceOracle(await priceOracle.address);
	//set collateral factor to 50%
	await comptroller._setCollateralFactor(
		cDragon.address,
		OLD_COLLATERAL_FACTOR
	);
	//owner ??? 100 ??? CatToken ???????????????????????? 100 ??? cCat ??????????????????????????????????????? 50 CatToken ??? user1
	await catToken.connect(owner).approve(cCat.address, 100n * DECIMAL);
	await cCat.connect(owner).mint(100n * DECIMAL);
	// ?????? user1 ??? 1 dragonToken
	await dragonToken.mint(user1.address, 1n * DECIMAL);

	// enterMarket ???????????????
	await comptroller
		.connect(user1)
		.enterMarkets([cCat.address, cDragon.address]);
	// ?????? CloseFactor ????????????????????? 50%
	await comptroller._setCloseFactor(CLOSE_FACTOR);

	// ??????????????????????????? 10%?????????????????????????????????????????????
	// ?????? 10% ????????? 110%
	// LiquidationIncentive to determine how much collateral can be seized.
	// ??????????????? 110%
	await comptroller._setLiquidationIncentive(
		ethers.utils.parseUnits("1.1", 18)
	);

	// user1 ?????? 1 ??? dragonToken ??? mint cDragon
	await dragonToken.connect(user1).approve(cDragon.address, 1n * DECIMAL);
	await cDragon.connect(user1).mint(1n * DECIMAL);

	return {
		catToken,
		dragonToken,
		comptroller,
		interestRateModel,
		priceOracle,
		cCat,
		cDragon,
		owner,
		user1,
		user2,
	};
}

async function deployFlashLoanFixture() {
	hardhatReset();
	const [owner, user1, user2] = await ethers.getSigners();
	const { usdc, uni } = await transferCoinsToOwnerAndUser();
	comptroller = await deployComptroller();
	interestRateModel = await deployInterestRateModel();
	let cUSDC = await deployCToken(usdc, comptroller, interestRateModel);
	let cUNI = await deployCToken(uni, comptroller, interestRateModel);

	priceOracle = await deployPriceOracle();
	await priceOracle.setUnderlyingPrice(cUSDC.address, USDCTOKEN_PRICE);
	await priceOracle.setUnderlyingPrice(cUNI.address, UNITOKEN_PRICE);

	comptroller._supportMarket(cUSDC.address);
	comptroller._supportMarket(cUNI.address);
	// setting priceOracle
	await comptroller._setPriceOracle(await priceOracle.address);

	// enterMarket
	await comptroller.connect(owner).enterMarkets([cUSDC.address, cUNI.address]);
	await comptroller.connect(user1).enterMarkets([cUSDC.address, cUNI.address]);
	//set collateral factor to 50%
	await comptroller._setCollateralFactor(cUNI.address, OLD_COLLATERAL_FACTOR);
	// ?????? CloseFactor ????????????????????? 50%
	await comptroller._setCloseFactor(CLOSE_FACTOR);
	// ????????????
	await comptroller._setLiquidationIncentive(
		ethers.utils.parseUnits("1.1", 18)
	);

	// user1 mint 1000 cUNI
	await uni.connect(user1).approve(cUNI.address, 1000n * DECIMAL);
	await cUNI.connect(user1).mint(1000n * DECIMAL);

	return {
		owner,
		user1,
		user2,
		usdc,
		uni,
		cUSDC,
		cUNI,
		comptroller,
		priceOracle,
	};
}

async function deployFlashLoanBorrowedFixture() {
	const {
		owner,
		user1,
		user2,
		usdc,
		uni,
		cUSDC,
		cUNI,
		comptroller,
		priceOracle,
	} = await deployFlashLoanFixture();

	// owner ??? 5000 ??? USDC ????????????

	await usdc.connect(owner).approve(cUSDC.address, 10000n * USDC_DECIMAL);
	await cUSDC.connect(owner).mint(5000n * USDC_DECIMAL);

	return {
		owner,
		user1,
		user2,
		usdc,
		uni,
		cUSDC,
		cUNI,
		comptroller,
		priceOracle,
	};
}

async function deployFlashLoanUNIPriceDropFixture() {
	const {
		owner,
		user1,
		user2,
		usdc,
		uni,
		cUSDC,
		cUNI,
		comptroller,
		priceOracle,
	} = await deployFlashLoanBorrowedFixture();

	await cUSDC.connect(user1).borrow(USDC_BORROW_AMOUNT);
	// change UNI oracle price
	await priceOracle.setUnderlyingPrice(cUNI.address, NEW_UNITOKEN_PRICE);

	return {
		owner,
		user1,
		user2,
		usdc,
		uni,
		cUSDC,
		cUNI,
		comptroller,
		priceOracle,
	};
}

async function deployFlashLoanLiquadateFixture() {
	const {
		owner,
		user1,
		user2,
		usdc,
		uni,
		cUSDC,
		cUNI,
		comptroller,
		priceOracle,
	} = await deployFlashLoanUNIPriceDropFixture();

	// console.log("1");
	const result = await comptroller.getAccountLiquidity(user1.address);
	shortfall = result[2];
	// shortfall of borrow token
	// ?????????????????? usdc ?????????
	// Account Liquidity represents the USD value borrowable by a user, so is shortfall
	// shortfall represents negative liquidity (by USD value)
	// console.log("2");
	// console.log(`shortfall: ${shortfall} ${typeof shortfall}`);
	// console.log(
	// 	`BigNumber(shortfall): ${BigNumber(shortfall.toString()).toString()}`
	// );
	// console.log(`usdc.price: ${USDCTOKEN_PRICE} ${typeof USDCTOKEN_PRICE}`);
	let bUSDCTOKEN_PRICE = BigNumber(USDCTOKEN_PRICE);
	// console.log(
	// 	`bUSDCTOKEN_PRICE: ${bUSDCTOKEN_PRICE} ${typeof bUSDCTOKEN_PRICE}`
	// );
	// console.log(`CLOSE_FACTOR: ${CLOSE_FACTOR} ${typeof CLOSE_FACTOR}`);

	// repayAmount ??? shortfall / USDC_PRICE * CLOSE_FACTOR
	// ????????? USDC ??? * USDC ?????? * ???????????????
	const repayAmount = BigNumber(shortfall.toString())
		.dividedBy(BigNumber(USDCTOKEN_PRICE.toString()))
		.multipliedBy(BigNumber(CLOSE_FACTOR.toString()));

	// console.log(`repayAmount: ${repayAmount.toString()}, ${typeof repayAmount}`);

	// console.log("4");
	// console.log(`balances of user1:`);
	// console.log(`USDC: ${await usdc.balanceOf(user1.address)}`);
	// console.log(`cUSDC: ${await cUSDC.balanceOf(user1.address)}`);
	// console.log(`UNI: ${await uni.balanceOf(user1.address)}`);
	// console.log(`cUNI: ${await cUNI.balanceOf(user1.address)}`);

	// console.log(`balances of user2:`);
	// console.log(`USDC: ${await usdc.balanceOf(user2.address)}`);
	// console.log(`cUSDC: ${await cUSDC.balanceOf(user2.address)}`);
	// console.log(`UNI: ${await uni.balanceOf(user2.address)}`);
	// console.log(`cUNI: ${await cUNI.balanceOf(user2.address)}`);

	await usdc.connect(user2).approve(cUSDC.address, repayAmount.toString());
	await cUSDC
		.connect(user2)
		.liquidateBorrow(user1.address, repayAmount.toString(), cUNI.address);

	// console.log("after user2 liquidateBorrow user1");
	// console.log(`balances of user1:`);
	// console.log(`USDC: ${await usdc.balanceOf(user1.address)}`);
	// console.log(`cUSDC: ${await cUSDC.balanceOf(user1.address)}`);
	// console.log(`UNI: ${await uni.balanceOf(user1.address)}`);
	// console.log(`cUNI: ${await cUNI.balanceOf(user1.address)}`);

	// console.log(`balances of user2:`);
	// console.log(`USDC: ${await usdc.balanceOf(user2.address)}`);
	// console.log(`cUSDC: ${await cUSDC.balanceOf(user2.address)}`);
	// console.log(`UNI: ${await uni.balanceOf(user2.address)}`);
	// console.log(`cUNI: ${await cUNI.balanceOf(user2.address)}`);

	let redeemAmount = await cUNI.balanceOf(user2.address);
	await cUNI.connect(user2).redeemUnderlying(redeemAmount);

	// console.log("after user2 redeemUnderlying cUNI to UNI");
	// console.log(`balances of user2:`);
	// console.log(`USDC: ${await usdc.balanceOf(user2.address)}`);
	// console.log(`cUSDC: ${await cUSDC.balanceOf(user2.address)}`);
	// console.log(`UNI: ${await uni.balanceOf(user2.address)}`);
	// console.log(`cUNI: ${await cUNI.balanceOf(user2.address)}`);

	// console.log("after user2 swap UNI to USDC");
	// console.log(`balances of user2:`);
	// console.log(`USDC: ${await usdc.balanceOf(user2.address)}`);
	// console.log(`cUSDC: ${await cUSDC.balanceOf(user2.address)}`);
	// console.log(`UNI: ${await uni.balanceOf(user2.address)}`);
	// console.log(`cUNI: ${await cUNI.balanceOf(user2.address)}`);

	return {
		owner,
		user1,
		user2,
		usdc,
		uni,
		cUSDC,
		cUNI,
		comptroller,
		priceOracle,
	};
}

async function transferCoinsToOwnerAndUser() {
	const [owner, user1, user2] = await ethers.getSigners();

	const usdc = await ethers.getContractAt("ERC20", USDC_ADDRESS);
	await hre.network.provider.request({
		method: "hardhat_impersonateAccount",
		params: [USDC_FAUCET_ADDRESS],
	});

	const usdcFaucet = await ethers.getSigner(USDC_FAUCET_ADDRESS);
	await usdc.connect(usdcFaucet).transfer(owner.address, 10000n * USDC_DECIMAL);
	await usdc
		.connect(usdcFaucet)
		.transfer(user2.address, ORIGINAL_USER2_USDC_AMOUNT);

	const uni = await ethers.getContractAt("ERC20", UNI_ADDRESS);
	await hre.network.provider.request({
		method: "hardhat_impersonateAccount",
		params: [UNI_FAUCET_ADDRESS],
	});
	const uniFaucet = await ethers.getSigner(UNI_FAUCET_ADDRESS);
	await uni.connect(uniFaucet).transfer(owner.address, 10000n * DECIMAL);
	await uni.connect(uniFaucet).transfer(user1.address, 1000n * DECIMAL);
	return {
		usdc,
		uni,
	};
}

async function deployComptroller() {
	// deploy Comptroller
	const comptrollerFactory = await ethers.getContractFactory("Comptroller");
	const comptroller = await comptrollerFactory.deploy();
	await comptroller.deployed();
	return comptroller;
}

async function deployPriceOracle(cToken, underlyingPrice) {
	const priceOracleFactory = await ethers.getContractFactory(
		"SimplePriceOracle"
	);
	const priceOracle = await priceOracleFactory.deploy();
	await priceOracle.deployed();

	return priceOracle;
}

async function deployToken(name) {
	// deploy ERC20 nameToken
	const Token = await ethers.getContractFactory(name);
	const token = await upgrades.deployProxy(Token);
	await token.deployed();
	return token;
}

async function deployInterestRateModel() {
	// deploy interest rate model
	const interestRateModelFactory = await ethers.getContractFactory(
		"WhitePaperInterestRateModel"
	);
	const interestRateModel = await interestRateModelFactory.deploy(
		ethers.utils.parseUnits("0", 18),
		ethers.utils.parseUnits("0", 18)
	);
	await interestRateModel.deployed();
	return interestRateModel;
}

async function deployCToken(token, comptroller, interestRateModel) {
	const [owner] = await ethers.getSigners();
	const cErc20Factory = await ethers.getContractFactory("CErc20Immutable");
	tokenName = await token.name();
	tokenSymbol = await token.symbol();
	const decimal = await token.decimals();
	// (18 - 18 + underlying decimal)
	const exchangeRate = 10n ** BigInt(decimal);

	const cToken = await cErc20Factory.deploy(
		token.address,
		comptroller.address,
		interestRateModel.address,
		exchangeRate, // initialExchangeRateMantissa_
		tokenName,
		tokenSymbol,
		18,
		owner.address
	);
	await cToken.deployed();
	return cToken;
}

DEFAULT_BLOCKNUMBER = 15815693;
async function hardhatReset(blockNumber) {
	await network.provider.request({
		method: "hardhat_reset",
		params: [
			{
				forking: {
					jsonRpcUrl: URL,
					blockNumber: blockNumber || DEFAULT_BLOCKNUMBER,
				},
			},
		],
	});
}

module.exports = {
	deployComptroller,
	deployCToken,
	deployInterestRateModel,
	deployToken,
	deployPriceOracle,
	deployContractsFixture,
	deployBorrowFixture,
	deployFlashLoanFixture,
	deployFlashLoanBorrowedFixture,
	deployFlashLoanUNIPriceDropFixture,
	deployFlashLoanLiquadateFixture,
	OLD_COLLATERAL_FACTOR,
	NEW_COLLATERAL_FACTOR,
	DECIMAL,
	DEFAULT_BLOCKNUMBER,
	USDC_ADDRESS,
	UNI_ADDRESS,
	USDC_DECIMAL,
	USDC_BORROW_AMOUNT,
	NEW_UNITOKEN_PRICE,
	ORIGINAL_USER2_USDC_AMOUNT,
};
