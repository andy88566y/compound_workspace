const { ethers } = require("hardhat");

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
	const cCat = await cErc20Factory.deploy(
		token.address,
		comptroller.address,
		interestRateModel.address,
		ethers.utils.parseUnits("1", 18),
		token.name,
		token.symbol,
		18,
		owner.address
	);
	await cCat.deployed();
	return cCat;
}

module.exports = {
	deployComptroller,
	deployCToken,
	deployInterestRateModel,
	deployToken,
	deployPriceOracle,
	deployContractsFixture,
};
