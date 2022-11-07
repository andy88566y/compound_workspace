const {
	time,
	loadFixture,
	helpers,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const DECIMAL = 10n ** 18n;

const {
	deployToken,
	deployComptroller,
	deployInterestRateModel,
	deployCToken,
	deployPriceOracle,
} = require("./setup");

describe("Mint/Redeem", async function () {
	beforeEach(async function () {
		// deploy contracts
		catToken = await deployToken("CatToken");
		dragonToken = await deployToken("DragonToken");
		comptroller = await deployComptroller();
		interestRateModel = await deployInterestRateModel();
		cCat = await deployCToken(catToken);
		cDragon = await deployCToken(dragonToken);
		comptroller._supportMarket(cCat.address);
		comptroller._supportMarket(cDragon.address);
	});

	it("should be able to mint cCat with catToken and redeem back", async function () {
		const [owner, user] = await ethers.getSigners();
		// 在 CatToken.sol 本來就有寫先給 owner 100 catTokens
		await expect(await catToken.balanceOf(owner.address)).to.eq(100n * DECIMAL);
		// 設定 user 有 1000 catToken
		await catToken.mint(user.address, ethers.utils.parseUnits("1000", 18));
		await expect(await catToken.balanceOf(user.address)).to.eq(1000n * DECIMAL);

		// catToken approve cCat use
		await catToken
			.connect(user)
			.approve(cCat.address, ethers.utils.parseUnits("100", 18));
		// user use 100 catToken to mint 100 cCat
		await expect(
			cCat.connect(user).mint(ethers.utils.parseUnits("100", 18))
		).to.changeTokenBalances(
			cCat,
			[user.address],
			[ethers.utils.parseUnits("100", 18)]
		);

		// user has 1000 - 100 = 900 catTokens left
		await expect(await catToken.balanceOf(user.address)).to.eq(900n * DECIMAL);
		// user has 100 cToken
		await expect(await cCat.balanceOf(user.address)).to.eq(100n * DECIMAL);

		// user use 100 cErc20 to redeem 100 erc20
		await expect(
			cCat.connect(user).redeem(ethers.utils.parseUnits("100", 18))
		).to.changeTokenBalances(
			cCat,
			[user.address],
			[ethers.utils.parseUnits("-100", 18)]
		);

		// user has 900 + 100 = 1000 GCDTokens
		await expect(await catToken.balanceOf(user.address)).to.eq(1000n * DECIMAL);
		// user has 0 cToken
		await expect(await cCat.balanceOf(user.address)).to.eq(0n * DECIMAL);
	});
});

describe("deploy price Oracle", async function () {
	beforeEach(async function () {
		catToken = await deployToken("CatToken");
		cCat = await deployCToken(catToken);
		priceOracle = await deployPriceOracle();
		await priceOracle.setUnderlyingPrice(cCat, 100n * DECIMAL);
	});

	it("should deploy good price oracle", async function () {
		expect(priceOracle.getUnderlyingPrice(cCat.address)).to.equal(
			100n * DECIMAL
		);
	});
});

describe("Borrow / repayBorrow", async function () {
	beforeEach(async function () {
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
			ethers.utils.parseUnits("0.5", 18)
		);
		//owner 存 100 顆 CatToken 進去池子，並取得 100 顆 cCat 池子有錢之後，待會才能借出 50 CatToken 給 user1
		await catToken.connect(owner).approve(cCat.address, 100n * DECIMAL);
		await cCat.connect(owner).mint(100n * DECIMAL);
		// 設定 user1 有 1 dragonToken
		await dragonToken.mint(user1.address, 1n * DECIMAL);
		// user1 使用 1 顆 dragonToken 來 mint cDragon
		await dragonToken.connect(user1).approve(cDragon.address, 1n * DECIMAL);
		await cDragon.connect(user1).mint(1n * DECIMAL);
	});

	it("should User1 使用 dragonToken 作為抵押品來借出 50 顆 catTokens", async function () {
		const [owner, user1] = await ethers.getSigners();
		// enterMarket 提供流動性
		await comptroller
			.connect(user1)
			.enterMarkets([cCat.address, cDragon.address]);
		// owner 事先存 100 顆 CatToken，換到的 cCat
		expect(await cCat.balanceOf(owner.address)).to.eq(100n * DECIMAL);
		// user1 有 1 dragonToken
		// expect(await dragonToken.balanceOf(user1.address)).to.eq(1n * DECIMAL);
		// user1 有 1 顆 cDragon
		expect(await cDragon.balanceOf(user1.address)).to.eq(1n * DECIMAL);
		// user1 借出 50 CatToken
		await cCat.connect(user1).borrow(50n * DECIMAL);
		expect(await catToken.balanceOf(user1.address)).to.eq(50n * DECIMAL);
	});
});
