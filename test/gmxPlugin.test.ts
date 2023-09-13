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

describe("GmxPlugin Test", () => {
    const { provider } = ethers;

    let wallet, user0, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
    let roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, depositStoreUtils, reader, withdrawalHandler;
    let oracleSalt;
    let vault, gmxPlugin, tokenPriceConsumer;
    let mtoken;
    let mockExchageRouter, mockRouter, mockDepositVault, mockWithdrawVault;
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

      mockExchageRouter = signer0.address;
      mockRouter = signer1.address;
      mockDepositVault = signer2.address;
      mockWithdrawVault = signer3.address;
    });
    
    it("should revert when called by non-owner", async () => {
      await expect(gmxPlugin.connect(user0).setConfig(mockExchageRouter, mockRouter, mockDepositVault, mockWithdrawVault)).to.be.revertedWith("Ownable: caller is not the owner");
    });
  
    it("should revert when any address is set to address(0)", async () => {
      await expect(gmxPlugin.connect(wallet).setConfig(ethers.constants.AddressZero, mockRouter, mockDepositVault, mockWithdrawVault)).to.be.revertedWith("GMX: Invalid Address");
      await expect(gmxPlugin.connect(wallet).setConfig(mockExchageRouter, ethers.constants.AddressZero, mockDepositVault, mockWithdrawVault)).to.be.revertedWith("GMX: Invalid Address");
      await expect(gmxPlugin.connect(wallet).setConfig(mockExchageRouter, mockRouter, ethers.constants.AddressZero, mockWithdrawVault)).to.be.revertedWith("GMX: Invalid Address");
      await expect(gmxPlugin.connect(wallet).setConfig(mockExchageRouter, mockRouter, mockDepositVault, ethers.constants.AddressZero)).to.be.revertedWith("GMX: Invalid Address");
    });

    it("should add a new pool", async () => {
      const poolId = 2;
      const longToken = await signer1.getAddress();
      const shortToken = await signer2.getAddress();
      const marketToken = await signer3.getAddress();
  
      // await gmxPlugin.connect(owner).addPool(poolId, longToken, shortToken, marketToken);
      await gmxPlugin.addPool(poolId, longToken, shortToken, marketToken);

      const index = await gmxPlugin.getPoolIndex(poolId);
      const pool = await gmxPlugin.pools(index);
      const poolExists = await gmxPlugin.poolExistsMap(poolId);
      expect(pool[0]).to.equal(poolId, "Pool ID mismatch");
      expect(pool[1]).to.equal(longToken, "Token A address mismatch");
      expect(pool[2]).to.equal(shortToken, "Token B address mismatch");
      expect(pool[3]).to.equal(marketToken, "Pool LP address mismatch");
      expect(poolExists).to.be.true;
    });

    it("should not allow adding a pool with an existing poolId", async () => {
      const poolId = 1;
      const longToken = await signer1.getAddress();
      const shortToken = await signer2.getAddress();
      const marketToken = await signer3.getAddress();
  
      // Attempt to add a pool with the same poolId again
      await expect(gmxPlugin.addPool(poolId, longToken, shortToken, marketToken)).to.be.revertedWith("GMX: Pool with this poolId already exists");
    });

    it("should remove an existing pool", async () => {
      const poolIds = [2, 3];
      const longToken = await signer1.getAddress();
      const shortToken = await signer2.getAddress();
      const marketToken = await signer3.getAddress();
  
      await gmxPlugin.addPool(poolIds[1], longToken, shortToken, marketToken);
  
      const initialPoolExists = await gmxPlugin.poolExistsMap(poolIds[1]);
      const initalPoolCount = (await gmxPlugin.getPools()).length;
      await gmxPlugin.removePool(poolIds[0]);
      await gmxPlugin.removePool(poolIds[1]);
  
      const poolExistsAfterRemoval1 = await gmxPlugin.poolExistsMap(poolIds[0]);
      const poolExistsAfterRemoval2 = await gmxPlugin.poolExistsMap(poolIds[0]);
      const poolCountAfterRemoval = (await gmxPlugin.getPools()).length;

      expect(initialPoolExists).to.be.true;
      expect(poolExistsAfterRemoval1).to.be.false;
      expect(poolExistsAfterRemoval2).to.be.false;
      expect(poolCountAfterRemoval).to.equal(initalPoolCount - 2);
    });

    it("should not allow removing a non-existing pool", async () => {
      const poolId = 4;
  
      // Attempt to remove a pool that does not exist
      await expect(gmxPlugin.removePool(poolId)).to.be.revertedWith("GMX: Pool with this poolId does not exist");
    });

    it("CreateDeposit", async () => {
      const poolId = 1;
      const longtokenAmount = "0";
      const shorttokenAmount = 10000000;
      const payload = ethers.utils.defaultAbiCoder.encode(['uint8','address[]','uint256[]'],[poolId, [wnt.address, usdc.address] ,[longtokenAmount, shorttokenAmount]]);

      await wnt.mint(user0.address, longtokenAmount);
      await usdc.mint(user0.address, shorttokenAmount);

      await wnt.connect(user0).approve(gmxPlugin.address, longtokenAmount);
      await usdc.connect(user0).approve(gmxPlugin.address, shorttokenAmount);
      await gmxPlugin.connect(user0).execute(0, payload);
    });

    it("ExecuteDeposit", async () => {
      const block0 = await provider.getBlock((await provider.getBlockNumber()));
      const block1 = await provider.getBlock((await provider.getBlockNumber()));

      const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
      const wntMinPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
      const wntMaxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];

      const usdcMinPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
      const usdcMaxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];
      const wntSignatures = await signPrices({
        signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
        salt: oracleSalt,
        minOracleBlockNumber: block0.number - 10,
        maxOracleBlockNumber: block0.number,
        oracleTimestamp: block0.timestamp,
        blockHash: block0.hash,
        token: wnt.address,
        tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
        precision: 1,
        minPrices: wntMinPrices,
        maxPrices: wntMaxPrices,
      });

      const usdcSignatures = await signPrices({
        signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
        salt: oracleSalt,
        minOracleBlockNumber: block1.number - 7,
        maxOracleBlockNumber: block1.number,
        oracleTimestamp: block1.timestamp,
        blockHash: block1.hash,
        token: usdc.address,
        tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
        precision: 20,
        minPrices: usdcMinPrices,
        maxPrices: usdcMaxPrices,
      });

      const params = {
        priceFeedTokens: [],
        signerInfo,
        tokens: [wnt.address, usdc.address],
        compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number - 10, block1.number - 7]),
        compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number, block1.number]),
        compactedOracleTimestamps: getCompactedOracleTimestamps([block0.timestamp, block1.timestamp]),
        compactedDecimals: getCompactedDecimals([1, 20]),
        compactedMinPrices: getCompactedPrices(wntMinPrices.concat(usdcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(usdcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wntSignatures.concat(usdcSignatures),
      };
      const depositKeys = await getDepositKeys(dataStore, 0, 1);
      
      const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);
      // console.log("deposit", deposit);

      await depositHandler.executeDeposit(depositKeys[0], params);
    });

    it("CreateWithdraw", async () => {
      const poolId = 1;
      const marketTokenAmount = await mtoken.balanceOf(gmxPlugin.address);
      
      const payload = ethers.utils.defaultAbiCoder.encode(['uint8','uint256'],[poolId, marketTokenAmount]);

      await gmxPlugin.connect(user0).execute(1, payload);

      const withdrawalKeys = await getWithdrawalKeys(dataStore, 0, 1);

      const block0 = await provider.getBlock((await provider.getBlockNumber()));
      const block1 = await provider.getBlock((await provider.getBlockNumber()));

      const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
      const wntMinPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
      const wntMaxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];

      const usdcMinPrices = [4990, 4991, 4995, 5000, 5001, 5005, 5007];
      const usdcMaxPrices = [4990, 4991, 4995, 5010, 5011, 5015, 5017];
      const wntSignatures = await signPrices({
        signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
        salt: oracleSalt,
        minOracleBlockNumber: block0.number - 10,
        maxOracleBlockNumber: block0.number,
        oracleTimestamp: block0.timestamp,
        blockHash: block0.hash,
        token: wnt.address,
        tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
        precision: 1,
        minPrices: wntMinPrices,
        maxPrices: wntMaxPrices,
      });

      const usdcSignatures = await signPrices({
        signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
        salt: oracleSalt,
        minOracleBlockNumber: block1.number - 7,
        maxOracleBlockNumber: block1.number,
        oracleTimestamp: block1.timestamp,
        blockHash: block1.hash,
        token: usdc.address,
        tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
        precision: 20,
        minPrices: usdcMinPrices,
        maxPrices: usdcMaxPrices,
      });

      const params = {
        priceFeedTokens: [],
        signerInfo,
        tokens: [wnt.address, usdc.address],
        compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number - 10, block1.number - 7]),
        compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number, block1.number]),
        compactedOracleTimestamps: getCompactedOracleTimestamps([block0.timestamp, block1.timestamp]),
        compactedDecimals: getCompactedDecimals([1, 20]),
        compactedMinPrices: getCompactedPrices(wntMinPrices.concat(usdcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(usdcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wntSignatures.concat(usdcSignatures),
      };

      await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], params);
    });
});