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
	deployComptroller,
	deployGcdToken,
	deployInterestRateModel,
	deployCErc20,
} = require("./setup");

describe("CErc20", async function () {
	it("should be able to mint CErc20 with GCDToken and reddem back", async function () {
		const [owner, user] = await ethers.getSigners();
		comptroller = await deployComptroller();
		gcdToken = await deployGcdToken();
		interestRateModel = await deployInterestRateModel();
		cErc20 = await deployCErc20();

		// 在 GCDToken.sol 本來就有寫先給 owner 100 GCDToken
		await expect(await gcdToken.balanceOf(owner.address)).to.eq(100n * DECIMAL);
		// 設定 user 有 1000 GCDToken
		await gcdToken.mint(user.address, ethers.utils.parseUnits("1000", 18));
		await expect(await gcdToken.balanceOf(user.address)).to.eq(1000n * DECIMAL);

		//'MintComptrollerRejection(9)'
		await expect(comptroller._supportMarket(cErc20.address))
			.to.emit(comptroller, "MarketListed")
			.withArgs(cErc20.address);

		// GCDToken approve cErc20 use
		await gcdToken
			.connect(user)
			.approve(cErc20.address, ethers.utils.parseUnits("100", 18));
		// user use 100 GCDToken to mint 100 cErc20
		await expect(
			cErc20.connect(user).mint(ethers.utils.parseUnits("100", 18))
		).to.changeTokenBalances(
			cErc20,
			[user.address],
			[ethers.utils.parseUnits("100", 18)]
		);

		// user has 1000 - 100 = 900 GCDTokens left
		await expect(await gcdToken.balanceOf(user.address)).to.eq(900n * DECIMAL);
		// user has 100 cToken
		await expect(await cErc20.balanceOf(user.address)).to.eq(100n * DECIMAL);

		// user use 100 cErc20 to redeem 100 erc20
		await expect(
			cErc20.connect(user).redeem(ethers.utils.parseUnits("100", 18))
		).to.changeTokenBalances(
			cErc20,
			[user.address],
			[ethers.utils.parseUnits("-100", 18)]
		);

		// user has 900 + 100 = 1000 GCDTokens
		await expect(await gcdToken.balanceOf(user.address)).to.eq(1000n * DECIMAL);
		// user has 0 cToken
		await expect(await cErc20.balanceOf(user.address)).to.eq(0n * DECIMAL);
	});
});
