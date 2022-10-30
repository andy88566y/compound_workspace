const {
	time,
	loadFixture,
	helpers,
} = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { abi } = require("./erc20_abi");
const binanceHotWalletAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const gcdTokenContractAddress = "0x24d41dbc3d60d0784f8a937c59FBDe51440D5140";
const DECIMAL = 10n ** 18n;
const MINT_AMOUNT = 100n * DECIMAL;
/*
describe("Binance", async function () {
	it("Binance has money", async function () {
		accounts = await ethers.getSigners();
		let usdc = await ethers.getContractAt(abi, usdcAddress);
		let balance = await usdc.balanceOf(binanceHotWalletAddress);
		expect(balance).to.gt(0);
		console.log(`Binance wallet balance: ${balance}`);
	});

	it("Binance give me money", async function () {
		let transferAmount = 10000000;

		let usdc = await ethers.getContractAt(abi, usdcAddress);
		await hre.network.provider.request({
			method: "hardhat_impersonateAccount",
			params: [binanceHotWalletAddress],
		});
		const binanceWallet = await ethers.getSigner(binanceHotWalletAddress);
		await usdc
			.connect(binanceWallet)
			.transfer(accounts[0].address, transferAmount);
		let balance = await usdc.balanceOf(accounts[0].address);
		console.log(`My wallet usdc amount: ${balance}`);
		expect(balance).to.eq(transferAmount);
	});
});

describe("GCDToken", async function () {
	async function deployGCDTokenFixture() {
		const GCDToken = await ethers.getContractFactory("GCDToken");
		const gcdToken = await upgrades.deployProxy(GCDToken);
		await gcdToken.deployed();

		return { gcdToken };
	}

	it("deployed properly", async function () {
		const { gcdToken } = await loadFixture(deployGCDTokenFixture);
		// assert that the name and symbol are correct
		expect(await gcdToken.name()).to.equal("GCDToken");
		expect(await gcdToken.symbol()).to.equal("GCD");
		// check pre minted value
		balance = await gcdToken.balanceOf(accounts[0].address);
		expect(ethers.utils.formatUnits(balance, 18)).to.equal("100.0");
	});

	it("can be mint", async function () {
		const { gcdToken } = await loadFixture(deployGCDTokenFixture);

		let amount = ethers.utils.parseUnits("10.0", 18);
		await gcdToken.mint(accounts[1].address, amount);
		balance = await gcdToken.balanceOf(accounts[1].address);
		expect(balance).to.eq(10000000000000000000n);
		expect(ethers.utils.formatUnits(balance, 18)).to.equal("10.0");
	});
});
*/
describe("CErc20", async function () {
	it("should be able to mint CErc20 with GCDToken", async function () {
		const [owner, user] = await ethers.getSigners();
		// deploy Comptroller
		const comptrollerFactory = await ethers.getContractFactory("Comptroller");
		const comptroller = await comptrollerFactory.deploy();
		await comptroller.deployed();

		// console.log(comptroller);

		// deploy ERC20 GCDToken
		const GCDToken = await ethers.getContractFactory("GCDToken");
		const gcdToken = await upgrades.deployProxy(GCDToken);
		await gcdToken.deployed();
		// console.log("gcdToken deployed");
		// console.log(gcdToken);

		// deploy interest rate model
		const interestRateModelFactory = await ethers.getContractFactory(
			"WhitePaperInterestRateModel"
		);
		const interestRateModel = await interestRateModelFactory.deploy(
			ethers.utils.parseUnits("0", 18),
			ethers.utils.parseUnits("0", 18)
		);
		await interestRateModel.deployed();
		// console.log("interestRateModel deployed.");
		// console.log(interestRateModel);

		// init initialExchangeRateMantissa_
		// 隔了一天忘記上面這一行什麼意思

		// init CGCDToken
		/*
			function initialize(address underlying_,
                        ComptrollerInterface comptroller_,
                        InterestRateModel interestRateModel_,
                        uint initialExchangeRateMantissa_,
                        string memory name_,
                        string memory symbol_,
                        uint8 decimals_)
		*/

		// init cErc20TokenDelegate
		// const cErc20TokenDelegateFactory = await ethers.getContractFactory(
		// 	"CErc20Delegate"
		// );
		// const cErc20TokenDelegate = await cErc20TokenDelegateFactory.deploy();
		// await cErc20TokenDelegate.deployed();
		// console.log("cErc20TokenDelegate deployed");
		// console.log(cErc20TokenDelegate);

		// init cErc20TokenDelegator
		// const cErc20TokenDelegatorFactory = await ethers.getContractFactory(
		// 	"CErc20Delegator"
		// );
		//constructor(
		//  address underlying_,
		// 	ComptrollerInterface comptroller_,
		// 	InterestRateModel interestRateModel_,
		// 	uint initialExchangeRateMantissa_,
		// 	string memory name_,
		// 	string memory symbol_,
		// 	uint8 decimals_,
		// 	address payable admin_,
		// 	address implementation_,
		// 	bytes memory becomeImplementationData
		//)
		// const cErc20TokenDelegator = await cErc20TokenDelegatorFactory.deploy(
		// 	gcdToken.address,
		// 	comptroller.address,
		// 	interestRateModel.address,
		// 	1n * DECIMAL,
		// 	"compound GCD Token",
		// 	"cGCD",
		// 	18,
		// 	accounts[0].address,
		// 	cErc20TokenDelegate.address,
		// 	"0x00"
		// );
		// await cErc20TokenDelegator.deployed();
		// console.log("cErc20TokenDelegator deployed");
		// console.log(cErc20TokenDelegator);

		// approve through delegator
		// await gcdToken.approve(cErc20TokenDelegate.address, MINT_AMOUNT);

		// use gcdToken to mint cToken
		// console.log("cErc20TokenDelegator.address: ", cErc20TokenDelegator.address);
		// console.log("cErc20TokenDelegate.address: ", cErc20TokenDelegate.address);
		// await cErc20TokenDelegator.mint(MINT_AMOUNT);
		// 貌似 market 沒有成功 init
		// console.log("listed: ", markets[cToken].isListed) 現在會是 false
		// 感覺 cToken 沒有成功部署？
		// 或是我 delegate 的用法有錯
		// delegate 是進階題，如果要到回去的話就是只部署 CErc20.sol 就好，那就要解決 initialize 的問題
		/*
			constructor(
				address underlying_,
				ComptrollerInterface comptroller_,
				InterestRateModel interestRateModel_,
				uint initialExchangeRateMantissa_,
				string memory name_,
				string memory symbol_,
				uint8 decimals_,
				address payable admin_)
		*/
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
		// console.log("cErc20 deployed");
		// console.log(cErc20);

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
