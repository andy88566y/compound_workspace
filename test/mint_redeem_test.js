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
} = require("./setup");

describe("CErc20", async function () {
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

	it("should be able to mint cCat with catToken and reddem back", async function () {
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
