const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const { abi } = require("./erc20_abi");
const binanceHotWalletAddress = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

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
