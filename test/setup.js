const { ethers } = require("hardhat");
const { int } = require("hardhat/internal/core/params/argumentTypes");
const { DEFAULT_FLAGS } = require("typechain");
require("dotenv").config();
const URL = process.env.URL;
const OLD_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
const NEW_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.3", 18);
const DECIMAL = 10n ** 18n;
const USDC_DECIMAL = 10n ** 6n;
const USDC_ADDRESS = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const UNI_ADDRESS = "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984";
const USDC_FAUCET_ADDRESS = "0xf977814e90da44bfa03b6295a0616a897441acec";
const UNI_FAUCET_ADDRESS = "0x47173b170c64d16393a52e6c480b3ad8c302ba1e";

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
	//owner 存 100 顆 CatToken 進去池子，並取得 100 顆 cCat 池子有錢之後，待會才能借出 50 CatToken 給 user1
	await catToken.connect(owner).approve(cCat.address, 100n * DECIMAL);
	await cCat.connect(owner).mint(100n * DECIMAL);
	// 設定 user1 有 1 dragonToken
	await dragonToken.mint(user1.address, 1n * DECIMAL);

	// enterMarket 提供流動性
	await comptroller
		.connect(user1)
		.enterMarkets([cCat.address, cDragon.address]);
	// 設定 CloseFactor 最高可清算比例 50%
	await comptroller._setCloseFactor(ethers.utils.parseUnits("0.5", 18));

	// 設定清算人的激勵費 10%，這是清算者從被清算者身上拿的
	// 獎勵 10% 要寫成 110%
	// LiquidationIncentive to determine how much collateral can be seized.
	// 所以要寫成 110%
	await comptroller._setLiquidationIncentive(
		ethers.utils.parseUnits("1.1", 18)
	);

	// user1 使用 1 顆 dragonToken 來 mint cDragon
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
	cUSDC = await deployCToken(usdc, comptroller, interestRateModel);
	cUNI = await deployCToken(uni, comptroller, interestRateModel);

	priceOracle = await deployPriceOracle();
	await priceOracle.setUnderlyingPrice(cUSDC.address, 1n * DECIMAL);
	await priceOracle.setUnderlyingPrice(cUNI.address, 10n * DECIMAL);

	comptroller._supportMarket(cUSDC.address);
	comptroller._supportMarket(cUNI.address);
	// setting priceOracle
	await comptroller._setPriceOracle(await priceOracle.address);

	// enterMarket
	await comptroller.connect(owner).enterMarkets([cUSDC.address, cUNI.address]);
	await comptroller.connect(user1).enterMarkets([cUSDC.address, cUNI.address]);
	//set collateral factor to 50%
	await comptroller._setCollateralFactor(cUNI.address, OLD_COLLATERAL_FACTOR);
	// 設定 CloseFactor 最高可清算比例 50%
	await comptroller._setCloseFactor(ethers.utils.parseUnits("0.5", 18));
	// 清算獎勵
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

	// owner 存 5000 顆 USDC 進去池子

	await usdc.connect(owner).approve(cUSDC.address, 5000n * USDC_DECIMAL);
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

async function transferCoinsToOwnerAndUser() {
	const [owner, user1] = await ethers.getSigners();

	const usdc = await ethers.getContractAt("ERC20", USDC_ADDRESS);
	await hre.network.provider.request({
		method: "hardhat_impersonateAccount",
		params: [USDC_FAUCET_ADDRESS],
	});

	const usdcFaucet = await ethers.getSigner(USDC_FAUCET_ADDRESS);
	await usdc.connect(usdcFaucet).transfer(owner.address, 10000n * USDC_DECIMAL);

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

DEFAULT_BLOCKNUMBER = 14390000;

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
	OLD_COLLATERAL_FACTOR,
	NEW_COLLATERAL_FACTOR,
	DECIMAL,
	DEFAULT_BLOCKNUMBER,
	USDC_ADDRESS,
	UNI_ADDRESS,
	USDC_DECIMAL,
};
