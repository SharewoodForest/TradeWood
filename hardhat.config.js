require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("dotenv").config();

const accounts = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true, // only for deploying Uniswap V2 test fixtures
      ...(process.env.FORK
        ? {
            chainId: 4663,
            hardfork: "shanghai",
            chains: { 4663: { hardforkHistory: { shanghai: 0 } } },
            forking: { url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com" },
          }
        : {}),
    },
    // Local Robinhood Chain fork via anvil (supports Cancun/transient storage, which Uniswap V4 needs):
    //   anvil --fork-url https://rpc.mainnet.chain.robinhood.com --chain-id 4663
    anvil: { url: "http://127.0.0.1:8545", chainId: 4663, accounts: [] },
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts,
    },
    robinhoodTestnet: {
      url: process.env.ROBINHOOD_TESTNET_RPC_URL || "https://rpc.testnet.chain.robinhood.com",
      chainId: 46630,
      accounts,
    },
  },
};
