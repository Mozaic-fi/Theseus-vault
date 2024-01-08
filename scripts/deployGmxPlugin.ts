import {ethers} from 'hardhat';
import { deployNew } from '../utils/helper';
import { deployFixture } from '../utils/fixture';
import { getDepositKeys } from "../utils/deposit";
import { expandDecimals } from '../utils/math';
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
export const deployContracts = async () => {
    const fixture: any = await deployFixture();
    const accountList = await ethers.getSigners();
    const [ wallet ] = accountList;

    const tokenPriceConsumer = await deployNew("TokenPriceConsumer", [[], []]);
    const usdcMockAggregator = await deployNew("MockAggregator", [8, "usdc", 1, "100000000", 0, 0, 0, "100000000"]);
    const ethMockAggregator = await deployNew("MockAggregator", [18, "wnt", 1, "5000000000000000000000", 0, 0, 0, "5000000000000000000000"]);

    await tokenPriceConsumer.addPriceFeed(fixture.contracts.usdc.address, usdcMockAggregator.address);
    await tokenPriceConsumer.addPriceFeed(fixture.contracts.wnt.address, ethMockAggregator.address);

    // vault Plugin setting
    const vault = await deployNew("Vault", []);
    
    // await vault.setMaster(accountList[0].address);
    await vault.setMaster(wallet.address);

    await vault.setTokenPriceConsumer(tokenPriceConsumer.address);
    
    // gmx Plugin setting
    const gmxPlugin = await deployNew("GmxPlugin", [vault.address]);

    const gmxCallback = await deployNew("GmxCallback", [vault.address, gmxPlugin.address]);

    await gmxCallback.setHandler(fixture.contracts.depositHandler.address, fixture.contracts.withdrawalHandler.address, fixture.contracts.orderHandler.address);

    await gmxPlugin.setMaster(wallet.address);

    await gmxPlugin.setTokenPriceConsumer(tokenPriceConsumer.address);

    await vault.addPlugin(1, gmxPlugin.address);

    await vault.setTreasury(fixture.accounts.user8.address);

    await vault.setVaultLockers([gmxCallback.address]);

    await vault.setVaultManagers([gmxCallback.address]);

    await vault.connect(wallet).addAcceptedToken(fixture.contracts.usdc.address);
    await vault.connect(wallet).addAcceptedToken(fixture.contracts.wnt.address);
    await vault.connect(wallet).addDepositAllowedToken(fixture.contracts.usdc.address);
    await vault.connect(wallet).addDepositAllowedToken(fixture.contracts.wnt.address);

    await gmxPlugin.setRouterConfig(
        fixture.contracts.exchangeRouter.address, 
        fixture.contracts.router.address, 
        fixture.contracts.depositVault.address, 
        fixture.contracts.withdrawalVault.address,
        fixture.contracts.orderVault.address,
        fixture.contracts.reader.address
    );

    const callbackGasLimit = 2000000;
    const executionFee = expandDecimals(1, 18);

    await gmxPlugin.setGmxParams(
        gmxPlugin.address,
        gmxCallback.address,
        callbackGasLimit,
        executionFee,
        false
    );

    await gmxPlugin.addPool(
        1,
        fixture.contracts.ethUsdMarket.indexToken,
        fixture.contracts.ethUsdMarket.longToken, 
        fixture.contracts.ethUsdMarket.shortToken, 
        fixture.contracts.ethUsdMarket.marketToken
    );


    const amount = ethers.utils.parseEther('1'); // 1 Ether
    await wallet.sendTransaction({
        to: gmxPlugin.address,
        value: amount,
    });

    return {
        gmxFixture: fixture,
        pluginFixture: {
            vault,
            gmxPlugin,
            gmxCallback,
            tokenPriceConsumer,
        }
    }
}

export const executeDeposit = async(fixture: any, block: any) => {
    // const { provider } = ethers;
    let wallet, user0, user1, user2, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
    let roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, depositStoreUtils, reader, withdrawalHandler;
    let oracleSalt;
    let vault, gmxPlugin, tokenPriceConsumer;
    let marketToken;
    let newMasterAddress, newTokenPriceConsumer;
    ({ wallet, user0, user1, user2, signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.gmxFixture.accounts);

    ({ roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, withdrawalHandler, depositStoreUtils, reader } = fixture.gmxFixture.contracts);
    ({ oracleSalt } = fixture.gmxFixture.props);
    ({ vault, gmxPlugin, tokenPriceConsumer} = fixture.pluginFixture);

    const amount = ethers.utils.parseEther('1'); // 1 Ether
    await wallet.sendTransaction({
        to: gmxPlugin.address,
        value: amount,
    });
    const mAbi = await require("../abi/MarketToken.json");
    marketToken = new ethers.Contract(ethUsdMarket.marketToken, mAbi, wallet);
    newMasterAddress = user0;
    newTokenPriceConsumer = user0;

    
    // const block = await provider.getBlock((await provider.getBlockNumber()));
    const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
    const wntMinPrices = [expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4)];
    const wntMaxPrices = [expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4)];

    const usdcMinPrices = [ expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6)];
    const usdcMaxPrices = [ expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6)];
    const wntSignatures = await signPrices({
        signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
        salt: oracleSalt,
        minOracleBlockNumber: block.number,
        maxOracleBlockNumber: block.number,
        oracleTimestamp: block.timestamp,
        blockHash: block.hash,
        token: wnt.address,
        tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
        precision: 8,
        minPrices: wntMinPrices,
        maxPrices: wntMaxPrices,
    });

    const usdcSignatures = await signPrices({
        signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
        salt: oracleSalt,
        minOracleBlockNumber: block.number,
        maxOracleBlockNumber: block.number,
        oracleTimestamp: block.timestamp,
        blockHash: block.hash,
        token: usdc.address,
        tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
        precision: 18,
        minPrices: usdcMinPrices,
        maxPrices: usdcMaxPrices,
    });

    const params = {
        priceFeedTokens: [],
        signerInfo,
        tokens: [wnt.address, usdc.address],
        compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number]),
        compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block.number, block.number]),
        compactedOracleTimestamps: getCompactedOracleTimestamps([block.timestamp, block.timestamp]),
        compactedDecimals: getCompactedDecimals([8, 18]),
        compactedMinPrices: getCompactedPrices(wntMinPrices.concat(usdcMinPrices)),
        compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(usdcMaxPrices)),
        compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
        signatures: wntSignatures.concat(usdcSignatures),
    };
    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    await depositHandler.executeDeposit(depositKeys[0], params);
}