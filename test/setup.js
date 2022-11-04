const { ethers } = require("hardhat");

async function deployComptroller() {
	// deploy Comptroller
	const comptrollerFactory = await ethers.getContractFactory("Comptroller");
	const comptroller = await comptrollerFactory.deploy();
	await comptroller.deployed();
	return comptroller;
}

async function deployGcdToken() {
	// deploy ERC20 GCDToken
	const GCDToken = await ethers.getContractFactory("GCDToken");
	const gcdToken = await upgrades.deployProxy(GCDToken);
	await gcdToken.deployed();
	return gcdToken;
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

async function deployCErc20() {
	const [owner] = await ethers.getSigners();
	const cErc20Factory = await ethers.getContractFactory("CErc20Immutable");
	const cErc20 = await cErc20Factory.deploy(
		gcdToken.address,
		comptroller.address,
		interestRateModel.address,
		ethers.utils.parseUnits("1", 18),
		"c GCD Token",
		"GCD",
		18,
		owner.address
	);
	await cErc20.deployed();
	return cErc20;
}

module.exports = {
	deployComptroller,
	deployGcdToken,
	deployInterestRateModel,
	deployCErc20,
};
