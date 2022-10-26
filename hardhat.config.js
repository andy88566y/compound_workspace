require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

const GOERLI_ACCOUNT_PRIVATE_KEY = process.env.GOERLI_ACCOUNT_PRIVATE_KEY;
const INFURA_API_KEY = process.env.INFURA_API_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const URL = process.env.URL;

module.exports = {
	solidity: {
		compilers: [
			{
				version: "0.8.17",
				settings: {
					optimizer: {
						enabled: true,
						runs: 200,
					},
				},
			},
		],
	},
	etherscan: {
		apiKey: ETHERSCAN_API_KEY,
	},
	networks: {
		hardhat: {
			forking: {
				url: URL,
				blockNumber: 15818135,
				enabled: true,
			},
		},
	},
};
