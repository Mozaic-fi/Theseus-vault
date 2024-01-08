import { expect } from "chai";
import { ethers } from "hardhat";
import { mine, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { getDepositKeys } from "../utils/deposit";
import { getWithdrawalKeys } from "../utils/withdrawal"

import { expandDecimals, decimalToFloat, bigNumberify } from "../utils/math";
import { hashString } from "../utils/hash";
import { handleDeposit } from "../utils/deposit";
import { OrderType, getOrderCount, getOrderKeys, createOrder, executeOrder, handleOrder, DecreasePositionSwapType, createGmxPluginOrder } from "../utils/order";
import { getPositionCount, getAccountPositionCount } from "../utils/position";
import { deployNew } from "../utils/helper";
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

enum ActionType {
    // Action types
    Stake,
    Unstake,
    SwapTokens,
    ClaimRewards
}
enum State { Deposit, Withdrawal, Order }

describe("GmxPlugin Test", () => {
    const { provider } = ethers;

    let wallet, user0, user1, user2, user3, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
    let roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, depositStoreUtils, reader, withdrawalHandler, orderVault;
    let oracleSalt;
    let vault, gmxPlugin, tokenPriceConsumer, gmxCallback;
    let marketToken;
    let mockExchageRouter, mockRouter, mockDepositVault, mockWithdrawVault;
    let fixture: any;
    before(async () => {
        fixture = await loadFixture(deployContracts);
        ({ wallet, user0, user1, user2, user3, signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.gmxFixture.accounts);

        ({ roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, withdrawalHandler, depositStoreUtils, reader, orderVault } = fixture.gmxFixture.contracts);
        ({ oracleSalt } = fixture.gmxFixture.props);
        ({ vault, gmxCallback, tokenPriceConsumer} = fixture.pluginFixture);

        gmxPlugin = await deployNew("GmxPlugin", [user0.address]);

        await gmxPlugin.setMaster(wallet.address);
        await gmxPlugin.setTokenPriceConsumer(tokenPriceConsumer.address);
        await gmxPlugin.setRouterConfig(
            fixture.gmxFixture.contracts.exchangeRouter.address, 
            fixture.gmxFixture.contracts.router.address,
            fixture.gmxFixture.contracts.depositVault.address, 
            fixture.gmxFixture.contracts.withdrawalVault.address,
            fixture.gmxFixture.contracts.orderVault.address,
            fixture.gmxFixture.contracts.reader.address
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

        await gmxCallback.setConfig(user0.address, gmxPlugin.address);

        await gmxPlugin.addPool(
            1,
            fixture.gmxFixture.contracts.ethUsdMarket.indexToken,
            fixture.gmxFixture.contracts.ethUsdMarket.longToken, 
            fixture.gmxFixture.contracts.ethUsdMarket.shortToken, 
            fixture.gmxFixture.contracts.ethUsdMarket.marketToken
        );
        const amount = ethers.utils.parseEther('1'); // 1 Ether
        await wallet.sendTransaction({
            to: gmxPlugin.address,
            value: amount,
        });

        const marketTokenAbi = await require("../abi/MarketToken.json");
        marketToken = new ethers.Contract(ethUsdMarket.marketToken, marketTokenAbi, wallet);

        mockExchageRouter = signer0.address;
        mockRouter = signer1.address;
        mockDepositVault = signer2.address;
        mockWithdrawVault = signer3.address;
    });

    describe("setRouterConfig", async () => {
        it("should revert when called by non-owner", async () => {
            await expect(gmxPlugin.connect(user0).setRouterConfig(mockExchageRouter, mockRouter, mockDepositVault, mockWithdrawVault, orderVault.address, reader.address)).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("should revert when any address is set to address(0)", async () => {
            await expect(gmxPlugin.connect(wallet).setRouterConfig(ethers.constants.AddressZero, mockRouter, mockDepositVault, mockWithdrawVault, orderVault.address, reader.address)).to.be.revertedWith("GMX: Invalid Address");
            await expect(gmxPlugin.connect(wallet).setRouterConfig(mockExchageRouter, ethers.constants.AddressZero, mockDepositVault, mockWithdrawVault, orderVault.address, reader.address)).to.be.revertedWith("GMX: Invalid Address");
            await expect(gmxPlugin.connect(wallet).setRouterConfig(mockExchageRouter, mockRouter, ethers.constants.AddressZero, mockWithdrawVault, orderVault.address, reader.address)).to.be.revertedWith("GMX: Invalid Address");
            await expect(gmxPlugin.connect(wallet).setRouterConfig(mockExchageRouter, mockRouter, mockDepositVault, ethers.constants.AddressZero, orderVault.address, reader.address)).to.be.revertedWith("GMX: Invalid Address");
            await expect(gmxPlugin.connect(wallet).setRouterConfig(mockExchageRouter, mockRouter, mockDepositVault, mockWithdrawVault, ethers.constants.AddressZero, reader.address)).to.be.revertedWith("GMX: Invalid Address");
            await expect(gmxPlugin.connect(wallet).setRouterConfig(mockExchageRouter, mockRouter, mockDepositVault, mockWithdrawVault, orderVault.address, ethers.constants.AddressZero)).to.be.revertedWith("GMX: Invalid Address");
        });
    })

    describe("setPool", async () => {
        it("should add a new pool", async () => {
            const poolId = 2;
            const indexToken = await signer0.getAddress();
            const longToken = await signer1.getAddress();
            const shortToken = await signer2.getAddress();
            const marketToken = await signer3.getAddress();

            await gmxPlugin.addPool(poolId, indexToken, longToken, shortToken, marketToken);

            const index = await gmxPlugin.getPoolIndexById(poolId);
            const pool = await gmxPlugin.pools(index);
            const poolExists = await gmxPlugin.poolExistsMap(poolId);

            expect(pool[0]).to.equal(poolId, "Pool ID mismatch");
            expect(pool[1]).to.equal(indexToken, "Index token address mismatch");
            expect(pool[2]).to.equal(longToken, "Long token address mismatch");
            expect(pool[3]).to.equal(shortToken, "short token address mismatch");
            expect(pool[4]).to.equal(marketToken, "market token address mismatch");
            expect(poolExists).to.be.true;
        });

        it("should not allow adding a pool with an existing poolId", async () => {
            const poolId = 1;
            const indexToken = await signer0.getAddress();
            const longToken = await signer1.getAddress();
            const shortToken = await signer2.getAddress();
            const marketToken = await signer3.getAddress();

            // Attempt to add a pool with the same poolId again
            await expect(gmxPlugin.addPool(poolId, indexToken, longToken, shortToken, marketToken)).to.be.revertedWith("GMX: Pool with this poolId already exists");
        });

        it("should remove an existing pool", async () => {
            const poolIdToRemove = 2;

            const initialPoolExists = await gmxPlugin.poolExistsMap(poolIdToRemove);
            const initalPoolCount = (await gmxPlugin.getPools()).length;

            await gmxPlugin.removePool(poolIdToRemove)
            const poolExistsAfterRemoval = await gmxPlugin.poolExistsMap(poolIdToRemove);
            const poolCountAfterRemoval = (await gmxPlugin.getPools()).length;

            expect(initialPoolExists).to.be.true;
            expect(poolExistsAfterRemoval).to.be.false;
            expect(poolCountAfterRemoval).to.equal(initalPoolCount - 1);
        });

        it("should not allow removing a non-existing pool", async () => {
            const poolId = 4;

            // Attempt to remove a pool that does not exist
            await expect(gmxPlugin.removePool(poolId)).to.be.revertedWith("GMX: Pool with this poolId does not exist");
        });
    })

    describe("Deposit", async () => {
        let depositKeys = [];
        let withdrawalKeys = [];
        let orderKeys = [];
        it("CreateDeposit", async () => {
            const poolId = 1;
            const longtokenAmount = "1000000000000000000";
            const shorttokenAmount = 1000_000000;
            
            depositKeys = await gmxCallback.getKeys(State.Deposit);
            expect(depositKeys.length).equal(0);

            await wnt.mint(user0.address, longtokenAmount);
            await usdc.mint(user0.address, shorttokenAmount);
            
            await wnt.connect(user0).approve(gmxPlugin.address, longtokenAmount);
            await usdc.connect(user0).approve(gmxPlugin.address, shorttokenAmount);

            const payload = ethers.utils.defaultAbiCoder.encode(['uint8','address[]','uint256[]','uint256'],[poolId, [wnt.address, usdc.address] ,[longtokenAmount, shorttokenAmount], 0]);
            await gmxPlugin.connect(user0).execute(ActionType.Stake, payload);

            depositKeys = await gmxCallback.getKeys(State.Deposit);
            expect(depositKeys.length).equal(1);
        });
        it("ExecuteDeposit", async () => {
            const block0 = await provider.getBlock((await provider.getBlockNumber()));
            const block1 = await provider.getBlock((await provider.getBlockNumber()));

            const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);
            const wntMinPrices = [expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4)];
            const wntMaxPrices = [expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4)];

            const usdcMinPrices = [ expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6)];
            const usdcMaxPrices = [ expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6)];
            const wntSignatures = await signPrices({
                signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
                salt: oracleSalt,
                minOracleBlockNumber: block0.number,
                maxOracleBlockNumber: block0.number,
                oracleTimestamp: block0.timestamp,
                blockHash: block0.hash,
                token: wnt.address,
                tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
                precision: 8,
                minPrices: wntMinPrices,
                maxPrices: wntMaxPrices,
            });

            const usdcSignatures = await signPrices({
                signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
                salt: oracleSalt,
                minOracleBlockNumber: block1.number,
                maxOracleBlockNumber: block1.number,
                oracleTimestamp: block1.timestamp,
                blockHash: block1.hash,
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
                compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number, block1.number]),
                compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number, block1.number]),
                compactedOracleTimestamps: getCompactedOracleTimestamps([block0.timestamp, block1.timestamp]),
                compactedDecimals: getCompactedDecimals([8, 18]),
                compactedMinPrices: getCompactedPrices(wntMinPrices.concat(usdcMinPrices)),
                compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
                compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(usdcMaxPrices)),
                compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
                signatures: wntSignatures.concat(usdcSignatures),
            };
            depositKeys = await gmxCallback.getKeys(State.Deposit);
            expect(depositKeys.length).equal(1);

            const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

            await depositHandler.executeDeposit(depositKeys[0], params);

            depositKeys = await gmxCallback.getKeys(State.Deposit);
            expect(depositKeys.length).equal(0);

            expect(await marketToken.balanceOf(gmxPlugin.address)).eq("6000000000000000000000");
        });

        it("CreateWithdraw", async () => {
            const poolId = 1;
            const marketTokenAmount = await marketToken.balanceOf(gmxPlugin.address);
            
            const _payload = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'], [0, 0]);
            const payload = ethers.utils.defaultAbiCoder.encode(['uint8','uint256', 'uint256', 'address', 'bytes'],[poolId, marketTokenAmount, 0, user0.address, _payload]);

            await gmxPlugin.connect(user0).execute(1, payload);

            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(1);

            const block0 = await provider.getBlock((await provider.getBlockNumber()));
            const block1 = await provider.getBlock((await provider.getBlockNumber()));

            const signerInfo = getSignerInfo([0, 1, 2, 3, 4, 7, 9]);

            const wntMinPrices = [expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4)];
            const wntMaxPrices = [expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4), expandDecimals(5000, 4)];

            const usdcMinPrices = [ expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6)];
            const usdcMaxPrices = [ expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6),  expandDecimals(1, 6)];
            const wntSignatures = await signPrices({
                signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
                salt: oracleSalt,
                minOracleBlockNumber: block0.number,
                maxOracleBlockNumber: block0.number,
                oracleTimestamp: block0.timestamp,
                blockHash: block0.hash,
                token: wnt.address,
                tokenOracleType: TOKEN_ORACLE_TYPES.DEFAULT,
                precision: 8,
                minPrices: wntMinPrices,
                maxPrices: wntMaxPrices,
            });

            const usdcSignatures = await signPrices({
                signers: [signer0, signer1, signer2, signer3, signer4, signer7, signer9],
                salt: oracleSalt,
                minOracleBlockNumber: block1.number,
                maxOracleBlockNumber: block1.number,
                oracleTimestamp: block1.timestamp,
                blockHash: block1.hash,
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
                compactedMinOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number, block1.number]),
                compactedMaxOracleBlockNumbers: getCompactedOracleBlockNumbers([block0.number, block1.number]),
                compactedOracleTimestamps: getCompactedOracleTimestamps([block0.timestamp, block1.timestamp]),
                compactedDecimals: getCompactedDecimals([8, 18]),
                compactedMinPrices: getCompactedPrices(wntMinPrices.concat(usdcMinPrices)),
                compactedMinPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
                compactedMaxPrices: getCompactedPrices(wntMaxPrices.concat(usdcMaxPrices)),
                compactedMaxPricesIndexes: getCompactedPriceIndexes([0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6]),
                signatures: wntSignatures.concat(usdcSignatures),
            };

            let usdcBalanceBefore = await usdc.balanceOf(user0.address);
            let wntBalanceBefore = await wnt.balanceOf(user0.address);

            await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], params);
            let usdcBalanceAfter = await usdc.balanceOf(user0.address);
            let wntBalanceAfter = await wnt.balanceOf(user0.address);
            expect(usdcBalanceAfter - usdcBalanceBefore).to.be.equal(1000000000);
            expect(Number(wntBalanceAfter - wntBalanceBefore)).to.be.equal(1000000000000000000);

            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(0);
        });


        it("Swaps tokens", async () => {
            await handleDeposit(fixture.gmxFixture, {
                create: {
                    market: ethUsdMarket,
                    shortTokenAmount: expandDecimals(50_000, 6),
                },
            });

            const orderParams = {
                create: {
                    receiver: user0,
                    initialCollateralToken: wnt,
                    initialCollateralDeltaAmount: expandDecimals(10, 18),
                    acceptablePrice: 0,
                    orderType: OrderType.MarketSwap,
                    swapPath: [ethUsdMarket.marketToken],
                    gasUsageLabel: "orderHandler.createOrder",
                    callbackContract: gmxCallback,
                    gmx: gmxPlugin,
                },
                execute: {
                    gasUsageLabel: "orderHandler.executeOrder",
                }
            }

            await wnt.mint(user0.address, expandDecimals(10, 18));
            await wnt.connect(user0).approve(gmxPlugin.address, expandDecimals(10, 18));

            let usdBalanceBefore = await usdc.balanceOf(user0.address);

            let orderCountBefore = await getOrderCount(dataStore);

            orderKeys = await gmxCallback.getKeys(State.Order);
            expect(orderKeys.length).to.equal(0);

            await createGmxPluginOrder(fixture.gmxFixture, orderParams.create);
            
            orderKeys = await gmxCallback.getKeys(State.Order);
            expect(orderKeys.length).to.equal(1);

            let orderCountAfter = await getOrderCount(dataStore);
            await executeOrder(fixture.gmxFixture, orderParams.execute);

            orderKeys = await gmxCallback.getKeys(State.Order);
            expect(orderKeys.length).to.equal(0);

            let usdBalanceAfter = await usdc.balanceOf(user0.address);
            expect(orderCountAfter - orderCountBefore).eq(1);
            expect(usdBalanceAfter - usdBalanceBefore).eq(50000_000000);
        });

        it("Create Order", async () => {
            const referralCode = hashString("referralCode");
            const executionFee = expandDecimals(11, 18);
            const tokenAmount = expandDecimals(50 * 1000, 18);
            usdc.mint(gmxPlugin.address, tokenAmount);

            const params = {
                addresses: {
                    receiver: user0.address,
                    callbackContract: user2.address,
                    uiFeeReceiver: user3.address,
                    market: ethUsdMarket.marketToken,
                    initialCollateralToken: ethUsdMarket.shortToken,
                    swapPath: [ethUsdMarket.marketToken],
                },
                numbers: {
                    sizeDeltaUsd: decimalToFloat(1000),
                    initialCollateralDeltaAmount: 0,
                    triggerPrice: decimalToFloat(4800),
                    acceptablePrice: decimalToFloat(4900),
                    executionFee,
                    callbackGasLimit: "2000000",
                    minOutputAmount: 700,
                },
                orderType: OrderType.LimitIncrease,
                decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
                isLong: true,
                shouldUnwrapNativeToken: true,
                referralCode,
            }
            const payload = ethers.utils.defaultAbiCoder.encode([
                'tuple(tuple(address,address,address,address,address,address[]),uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint8,uint8,bool,bool,bytes32)',
                ], 
                [[
                    [
                        params.addresses.receiver,
                        params.addresses.callbackContract,
                        params.addresses.uiFeeReceiver,
                        params.addresses.market,
                        params.addresses.initialCollateralToken,
                        params.addresses.swapPath,
                    ],
                    params.numbers.sizeDeltaUsd,
                    params.numbers.initialCollateralDeltaAmount,
                    params.numbers.triggerPrice,
                    params.numbers.acceptablePrice,
                    params.numbers.executionFee,
                    params.numbers.callbackGasLimit,
                    params.numbers.minOutputAmount,
                    params.orderType,
                    params.decreasePositionSwapType,
                    params.isLong,
                    params.shouldUnwrapNativeToken,
                    params.referralCode
                ]]
            );
            const amount = expandDecimals(11, 18);; // 11 Ether
            await wallet.sendTransaction({
                to: gmxPlugin.address,
                value: amount,
            });

            orderKeys = await gmxCallback.getKeys(State.Order);
            expect(orderKeys.length).to.equal(0);
            
            await gmxPlugin.connect(user0).execute(ActionType.SwapTokens, payload);

            orderKeys = await gmxCallback.getKeys(State.Order);
            expect(orderKeys.length).to.equal(1);

            const block = await ethers.provider.getBlock('latest');

            const order = await reader.getOrder(dataStore.address, orderKeys[0]);

            expect(order.addresses.account).eq(gmxPlugin.address);
            expect(order.addresses.receiver).eq(user0.address);
            expect(order.addresses.callbackContract).eq(gmxCallback.address);
            expect(order.addresses.market).eq(ethUsdMarket.marketToken);
            expect(order.addresses.initialCollateralToken).eq(ethUsdMarket.shortToken);
            expect(order.addresses.swapPath).deep.eq([ethUsdMarket.marketToken]);
            expect(order.numbers.orderType).eq(OrderType.LimitIncrease); 
            expect(order.numbers.decreasePositionSwapType).eq(DecreasePositionSwapType.SwapCollateralTokenToPnlToken);
            expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1000)); 
            expect(order.numbers.initialCollateralDeltaAmount).eq(0);
            expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
            expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
            expect(order.numbers.executionFee).eq(expandDecimals(11, 18));
            expect(order.numbers.callbackGasLimit).eq("2000000");
            expect(order.numbers.minOutputAmount).eq(700);
            expect(order.numbers.updatedAtBlock).eq(block.number);

            expect(order.flags.isLong).eq(true);
            expect(order.flags.shouldUnwrapNativeToken).eq(true);
            expect(order.flags.isFrozen).eq(false);
        })


        it("Limit Increase Order", async () => {
            await handleDeposit(fixture.gmxFixture, {
                create: {
                    market: ethUsdMarket,
                    longTokenAmount: expandDecimals(1000, 18),
                },
            });
            const params = {
                market: ethUsdMarket,
                initialCollateralToken: wnt,
                initialCollateralDeltaAmount: expandDecimals(10, 18),
                swapPath: [],
                sizeDeltaUsd: decimalToFloat(200 * 1000),
                acceptablePrice: expandDecimals(5001, 12),
                triggerPrice: expandDecimals(5000, 12),
                executionFee: expandDecimals(1, 15),
                minOutputAmount: expandDecimals(50000, 6),
                orderType: OrderType.LimitIncrease,
                isLong: true,
                shouldUnwrapNativeToken: false,
                gmx: gmxPlugin,
            };

            await wnt.mint(user0.address, expandDecimals(10, 18));
            await wnt.connect(user0).approve(gmxPlugin.address, expandDecimals(10, 18));
            await createGmxPluginOrder(fixture.gmxFixture, params);

            expect(await getOrderCount(dataStore)).eq(2);
            expect(await getAccountPositionCount(dataStore, gmxPlugin.address)).eq(0);
            expect(await getPositionCount(dataStore)).eq(0);

            await mine(5);

            const block1 = await provider.getBlock('latest');
            const block0 = await provider.getBlock(block1.number - 1);

            await executeOrder(fixture.gmxFixture, {
                tokens: [wnt.address, usdc.address],
                minPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
                maxPrices: [expandDecimals(4995, 4), expandDecimals(1, 6)],
                precisions: [8, 18],
                oracleBlocks: [block0, block1],
                gasUsageLabel: "executeOrder",
            });

            expect(await getOrderCount(dataStore)).eq(1);
            expect(await getAccountPositionCount(dataStore, gmxPlugin.address)).eq(1);
            expect(await getPositionCount(dataStore)).eq(1);
        })

        it("getPoolTokenPrice", async() => {
            const price = await gmxPlugin.getPoolTokenPrice(1, true);
            expect(price).to.gt("0");
        })    
    })
});