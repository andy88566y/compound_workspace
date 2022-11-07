const {
	time,
	loadFixture,
	helpers,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");
const DECIMAL = 10n ** 18n;
const OLD_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.5", 18);
const NEW_COLLATERAL_FACTOR = ethers.utils.parseUnits("0.3", 18);

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

// 讓 user1 borrow/repay
// 延續上題，部署另一份 CErc20 合約
// 在 Oracle 中設定一顆 token A 的價格為 $1，一顆 token B 的價格為 $100
// Token B 的 collateral factor 為 50%
// User1 使用 1 顆 token B 來 mint cToken
// User1 使用 token B 作為抵押品來借出 50 顆 token A
describe("Borrow / repayBorrow", async function () {
	beforeEach(async function () {
		const [owner, user1] = await ethers.getSigners();
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
		// user1 使用 1 顆 dragonToken 來 mint cDragon
		await dragonToken.connect(user1).approve(cDragon.address, 1n * DECIMAL);
		await cDragon.connect(user1).mint(1n * DECIMAL);
		// enterMarket 提供流動性
		await comptroller
			.connect(user1)
			.enterMarkets([cCat.address, cDragon.address]);
	});

	it("should User1 使用 dragonToken 作為抵押品來借出 50 顆 catTokens", async function () {
		const [owner, user1] = await ethers.getSigners();
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

	// 調整 token A 的 collateral factor，讓 user1 被 user2 清算
	describe("when collateral factor of CatToken changes", async function () {
		it("user2 can liquidated user1", async function () {
			const [, user1, user2] = await ethers.getSigners();
			// user1 借了 50 CatToken
			await cCat.connect(user1).borrow(50n * DECIMAL);
			// 重設抵押率，從 50% --> 30%
			await comptroller._setCollateralFactor(
				cDragon.address,
				NEW_COLLATERAL_FACTOR
			);

			// 設定 CloseFactor 最高可清算比例 50%
			await comptroller._setCloseFactor(ethers.utils.parseUnits("0.5", 18));

			// 設定清算人的激勵費 10%，這是清算者從被清算者身上拿的
			// 獎勵 10% 要寫成 110%
			// LiquidationIncentive to determine how much collateral can be seized.
			// 所以要寫成 110%
			await comptroller._setLiquidationIncentive(
				ethers.utils.parseUnits("1.1", 18)
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
});
