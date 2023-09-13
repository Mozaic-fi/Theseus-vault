import { expect } from "chai";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../utils/fixture";
import { getDepositKeys } from "../utils/deposit";
import { getWithdrawalKeys } from "../utils/withdrawal"
import {
    TOKEN_ORACLE_TYPES,
    signPrices,
    getSignerInfo,
    getCompactedPrices,
    getCompactedPriceIndexes,
    getCompactedDecimals,
    getCompactedOracleBlockNumbers,
    getCompactedOracleTimestamps,
} from "../utils/oracle";
import { deployContracts } from "../scripts/deployGmxPlugin";
import { ethers } from "hardhat";

describe("Vault Test", () => {
    const { provider } = ethers;

    let wallet, user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
    let roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, depositStoreUtils, reader, withdrawalHandler;
    let oracleSalt;
    let vault, gmxPlugin, tokenPriceConsumer;
    let mtoken;
    let newMasterAddress, newTokenPriceConsumer;
    before(async () => {
      const fixture = await deployFixture();
      const vaultContracts = await deployContracts(fixture);
      ({ wallet, user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.accounts);

      ({ roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, withdrawalHandler, depositStoreUtils, reader } = fixture.contracts);
      ({ oracleSalt } = fixture.props);
      ({ vault, gmxPlugin, tokenPriceConsumer} = vaultContracts.contracts);

      const amount = ethers.utils.parseEther('1'); // 1 Ether
      await wallet.sendTransaction({
          to: gmxPlugin.address,
          value: amount,
      });
      const mAbi = await require("../abi/MarketToken.json");
      mtoken = new ethers.Contract(ethUsdMarket.marketToken, mAbi, wallet);
      newMasterAddress = user0;
      newTokenPriceConsumer = user0;
    });
    
    it("***", async () => {
        console.log("******");
    });


    it("should add a new plugin when called by owner", async () => {
        const pluginId = 2;
        const pluginAddress = await wallet.getAddress();
    
        await vault.connect(wallet).addPlugin(pluginId, pluginAddress);
        
        const pluginIndex = await vault.pluginIdToIndex(pluginId);
        const addedPlugin = (await vault.getPlugins())[pluginIndex - 1];

        expect(addedPlugin.pluginAddress).to.equal(pluginAddress, "Plugin address mismatch");
        expect(addedPlugin.pluginId).to.equal(pluginId, "Plugin ID mismatch");
        expect(pluginIndex).to.equal(2, "Plugin index mismatch");
    });

    it("should revert when adding a plugin with an existing ID", async () => {
        const pluginId = 2;
        const pluginAddress = await wallet.getAddress();

        // Attempt to add a plugin with the same ID again
        await expect(vault.connect(wallet).addPlugin(pluginId, pluginAddress)).to.be.revertedWith("Plugin with this ID already exists");
    });

    it("should remove an existing plugin when called by wallet", async () => {
        const pluginId = 2;

        await vault.connect(wallet).removePlugin(pluginId);
        const pluginIndex = await vault.pluginIdToIndex(pluginId);

        expect(pluginIndex).to.equal(0, "Plugin index should be 0 after removal");
    });

    it("should revert when removing a non-existing plugin", async () => {
        const pluginId = 2;

        // Attempt to remove a plugin that does not exist
        await expect(vault.connect(wallet).removePlugin(pluginId)).to.be.revertedWith("Plugin with this ID does not exist");
    });


    it("should set the master address by the owner", async function () {
        await expect(vault.connect(wallet).setMaster(newMasterAddress.address))
            .to.emit(vault, "MasterUpdated")
            .withArgs(wallet.address, newMasterAddress.address);

        const master = await vault.master();
        expect(master).to.equal(newMasterAddress.address);
    });

    it("should set the token price consumer by the owner", async function () {
        const oldTokenPriceConsumer = await vault.tokenPriceConsumer();
        await expect(vault.connect(wallet).setTokenPriceConsumer(newTokenPriceConsumer.address))
            .to.emit(vault, "TokenPriceConsumerUpdated")
            .withArgs(oldTokenPriceConsumer, newTokenPriceConsumer.address);

        const tokenPriceConsumer = await vault.tokenPriceConsumer();
        expect(tokenPriceConsumer).to.equal(newTokenPriceConsumer.address);
    });

    it("should not allow setting master address by non-owner", async function () {
        await expect(vault.connect(newMasterAddress).setMaster(wallet.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow setting token price consumer by non-owner", async function () {
        await expect(vault.connect(newTokenPriceConsumer).setTokenPriceConsumer(wallet.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should not allow setting invalid master address", async function () {
        await expect(vault.connect(wallet).setMaster("0x0000000000000000000000000000000000000000")).to.be.revertedWith("Vault: Invalid Address");
    });

    it("should not allow setting invalid token price consumer address", async function () {
        await expect(vault.connect(wallet).setTokenPriceConsumer("0x0000000000000000000000000000000000000000")).to.be.revertedWith("Vault: Invalid Address");
    });
});