const { ethers } = require("hardhat");

const OLD_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
const NEW_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.3", 18);
const DECIMAL = 10n ** 18n;

async function deployContractsFixture() {
	// deploy contracts
	catToken = await deployToken("CatToken");
	dragonToken = await deployToken("DragonToken");
	comptroller = await deployComptroller();
	interestRateModel = await deployInterestRateModel();
	cCat = await deployCToken(catToken);
	cDragon = await deployCToken(dragonToken);
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
	cCat = await deployCToken(catToken);
	cDragon = await deployCToken(dragonToken);

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

async function deployCToken(token) {
	const [owner] = await ethers.getSigners();
	const cErc20Factory = await ethers.getContractFactory("CErc20Immutable");
	tokenName = await token.name();
	tokenSymbol = await token.symbol();
	const cToken = await cErc20Factory.deploy(
		token.address,
		comptroller.address,
		interestRateModel.address,
		ethers.utils.parseUnits("1", 18),
		tokenName,
		tokenSymbol,
		18,
		owner.address
	);
	await cToken.deployed();
	return cToken;
}

module.exports = {
	deployComptroller,
	deployCToken,
	deployInterestRateModel,
	deployToken,
	deployPriceOracle,
	deployContractsFixture,
	deployBorrowFixture,
	OLD_COLLATERAL_FACTOR,
	NEW_COLLATERAL_FACTOR,
	DECIMAL,
};
