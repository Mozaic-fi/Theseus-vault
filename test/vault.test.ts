import { expect } from "chai";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { getWithdrawalKeys } from "../utils/withdrawal"
import { expandDecimals } from "../utils/math";
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
import { OrderType, getOrderCount, getOrderKeys, createOrder, executeOrder, handleOrder, DecreasePositionSwapType, createGmxPluginOrder } from "../utils/order";
import { handleDeposit } from "../utils/deposit";
import { deployContracts, executeDeposit } from "../scripts/deployGmxPlugin";
import { ethers } from "hardhat";

describe("Vault Test", () => {
    enum ActionType {
      // Action types
      Stake,
      Unstake,
      SwapTokens,
      ClaimRewards
    }   
    enum Status {
        Normal,
        Pending
    }
    const { provider } = ethers;
    let fixture;
    let wallet, user0, user1, user2, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
    let roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, depositStoreUtils, reader, withdrawalHandler;
    let oracleSalt;
    let vault, gmxPlugin, tokenPriceConsumer;
    let marketToken;
    let newMasterAddress, newTokenPriceConsumer;
    before(async () => {
        fixture = await loadFixture(deployContracts);
        ({ wallet, user0, user1, user2, signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.gmxFixture.accounts);

        ({ roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, withdrawalHandler, depositStoreUtils, reader } = fixture.gmxFixture.contracts);
        ({ oracleSalt } = fixture.gmxFixture.props);
        ({ vault, gmxPlugin, tokenPriceConsumer} = fixture.pluginFixture);

        const amount = ethers.utils.parseEther('1'); // 1 Ether
        await wallet.sendTransaction({
            to: gmxPlugin.address,
            value: amount,
        });
        const marketTokenAbi = await require("../abi/MarketToken.json");
        marketToken = new ethers.Contract(ethUsdMarket.marketToken, marketTokenAbi, wallet);
        newMasterAddress = user0;
        newTokenPriceConsumer = user0;
    });

    describe("Manage plugin", async () => {
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
    })

    describe("SetMaster", async () => {
        it("should set the master address by the owner", async function () {
            await expect(vault.connect(wallet).setMaster(newMasterAddress.address))
                .to.emit(vault, "MasterUpdated")
                .withArgs(wallet.address, newMasterAddress.address);
    
            const master = await vault.master();
            expect(master).to.equal(newMasterAddress.address);
        });

        it("should not allow setting master by non-owner", async function () {
            await expect(vault.connect(user0).setMaster(newMasterAddress.address))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should not allow setting invalid master address", async function () {
            await expect(vault.connect(wallet).setMaster("0x0000000000000000000000000000000000000000")).to.be.revertedWith("Vault: Invalid Address");
        });
    })

    describe("TokenConsumer", async () => {
        it("should set the token price consumer by the owner", async function () {
            const oldTokenPriceConsumer = await vault.tokenPriceConsumer();
            await expect(vault.connect(wallet).setTokenPriceConsumer(newTokenPriceConsumer.address))
                .to.emit(vault, "TokenPriceConsumerUpdated")
                .withArgs(oldTokenPriceConsumer, newTokenPriceConsumer.address);
    
            const tokenPriceConsumer = await vault.tokenPriceConsumer();
            expect(tokenPriceConsumer).to.equal(newTokenPriceConsumer.address);
        });
    
    
        it("should not allow setting token price consumer by non-owner", async function () {
            await expect(vault.connect(newTokenPriceConsumer).setTokenPriceConsumer(wallet.address)).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should not allow setting invalid token price consumer address", async function () {
            await expect(vault.connect(wallet).setTokenPriceConsumer("0x0000000000000000000000000000000000000000")).to.be.revertedWith("Vault: Invalid Address");
        });
    })

    describe("setTreasury", function () {
        it("should set the treasury address when called by the owner", async function () {
          const newTreasury = user0.address;
    
          // Call the setTreasury function as the owner
          await vault.connect(wallet).setTreasury(newTreasury);
    
          // Check if the treasury address has been updated
          expect(await vault.treasury()).to.equal(newTreasury);
        });
    
        it("should emit SetTreasury event when treasury address is updated", async function () {
          const newTreasury = user0.address;
    
          // Call the setTreasury function as the owner and check for the emitted event
          await expect(vault.connect(wallet).setTreasury(newTreasury))
            .to.emit(vault, "SetTreasury")
            .withArgs(newTreasury);
        });
    
        it("should revert if called by a non-owner", async function () {
          const newTreasury = user0.address;
    
          // Call the setTreasury function as a non-owner and expect it to revert
          await expect(vault.connect(user0).setTreasury(newTreasury)).to.be.revertedWith("Ownable: caller is not the owner");
        });
    
        it("should revert if the new treasury address is zero", async function () {
          // Call the setTreasury function with a zero address and expect it to revert
          await expect(vault.connect(wallet).setTreasury(ethers.constants.AddressZero)).to.be.revertedWith("Vault: Invalid address");
        });
    });

    describe("addAcceptedToken", function () {
        it("should add a new accepted token when called by the owner", async function () {
          const newToken = usdc.address;
    
          // Call the addAcceptedToken function as the owner
          await vault.connect(wallet).addAcceptedToken(newToken);
    
          // Check if the new token is in the list of accepted tokens
          expect(await vault.acceptedTokenMap(newToken)).to.equal(true);
          expect(await vault.acceptedTokens(0)).to.equal(newToken);
        });
    
        it("should emit AddToken event when a new token is added", async function () {
          const newToken = wnt.address;
    
          // Call the addAcceptedToken function as the owner and check for the emitted event
          await expect(vault.connect(wallet).addAcceptedToken(newToken))
            .to.emit(vault, "AddAcceptedToken")
            .withArgs(newToken);
        });
    
        it("should revert if trying to add an already existing token", async function () {
          const existingToken = await vault.acceptedTokens(0);
    
          // Call the addAcceptedToken function with an existing token and expect it to revert
          await expect(vault.connect(wallet).addAcceptedToken(existingToken)).to.be.revertedWith("Vault: Token already exists.");
        });
    
        it("should revert if called by a non-owner", async function () {
          const newToken = usdc.address;
    
          // Call the addAcceptedToken function as a non-owner and expect it to revert
          await expect(vault.connect(user0).addAcceptedToken(newToken)).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });
    
    describe("removeAcceptedToken", function () {
        it("should remove an existing accepted token when called by the owner", async function () {
          const tokenToRemove = await vault.acceptedTokens(0);
    
          // Call the removeAcceptedToken function as the owner
          await vault.connect(wallet).removeAcceptedToken(tokenToRemove);
    
          // Check if the token has been removed from the list of accepted tokens
          expect(await vault.acceptedTokenMap(tokenToRemove)).to.equal(false);
          expect(await vault.acceptedTokens(0)).to.not.equal(tokenToRemove);
        });
    
        it("should emit RemoveToken event when a token is removed", async function () {
          const tokenToRemove = await vault.acceptedTokens(0);
    
          // Call the removeAcceptedToken function as the owner and check for the emitted event
          await expect(vault.connect(wallet).removeAcceptedToken(tokenToRemove))
            .to.emit(vault, "RemoveAcceptedToken")
            .withArgs(tokenToRemove);
        });
    
        it("should revert if trying to remove a non-existing token", async function () {
          const nonExistingToken = user0.address;
    
          // Call the removeAcceptedToken function with a non-existing token and expect it to revert
          await expect(vault.connect(wallet).removeAcceptedToken(nonExistingToken)).to.be.revertedWith("Vault: Non-accepted token.");
        });
    
        it("should revert if called by a non-owner", async function () {
            const newToken = usdc.address;
    
            // Call the addAcceptedToken function as the owner
            await vault.connect(wallet).addAcceptedToken(newToken);

            const tokenToRemove = await vault.acceptedTokens(0);
    
            // Call the removeAcceptedToken function as a non-owner and expect it to revert
            await expect(vault.connect(user0).removeAcceptedToken(tokenToRemove)).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("addDepositRequest", async () => {
        before(async () => {
            await vault.connect(wallet).setTokenPriceConsumer(tokenPriceConsumer.address);
            await vault.connect(wallet).addDepositAllowedToken(usdc.address);
            await vault.connect(wallet).addDepositAllowedToken(wnt.address);

        })

        it("should add a deposit request and mint LP tokens when called with valid parameters", async function () {
            const usdcAmount = ethers.utils.parseUnits("1000", 6);
            const wntAmount = ethers.utils.parseUnits("1", 18);
            await usdc.mint(user0.address, usdcAmount);
            await wnt.mint(user0.address, wntAmount);

            // Call the addDepositRequest function with valid parameters
            await usdc.connect(user0).approve(vault.address, usdcAmount);
            await wnt.connect(user0).approve(vault.address, wntAmount);

            await vault.connect(user0).addDepositRequest(usdc.address, usdcAmount);
      
            // Check if the user's LP token balance has increased
            let lpTokenBalance = await vault.balanceOf(user0.address);
            expect(lpTokenBalance).to.be.gt(0);
      
            // Check if the tokens were transferred from the user to the contract
            const contractTokenBalance = await usdc.balanceOf(vault.address);
            expect(contractTokenBalance).to.equal(usdcAmount);

            await vault.connect(user0).addDepositRequest(wnt.address, wntAmount);
            lpTokenBalance = await vault.balanceOf(user0.address);
            expect(lpTokenBalance).to.be.equal(6000_000000);
        });
      
        it("should revert if the token is not an allowed deposit token", async function () {
            const nonAllowedToken = signer9;
            const tokenAmount = ethers.utils.parseEther("100");
        
            // Call the addDepositRequest function with a non-allowed token and expect it to revert
            await expect(vault.connect(user0).addDepositRequest(nonAllowedToken.address, tokenAmount))
                .to.be.revertedWith("Vault: Invalid token");
        });
      
          it("should revert if the token amount is zero", async function () {
            // Call the addDepositRequest function with zero token amount and expect it to revert
            await expect(vault.connect(user0).addDepositRequest(usdc.address, 0))
              .to.be.revertedWith("Vault: Invalid token amount");
          });
    })

    describe("Execute Action", async () => {
        it("Stake", async () => {
            await vault.setMaster(wallet.address);
            const shortTokenAmount = ethers.utils.parseUnits("1000", 6);
            const longTokenAmount = ethers.utils.parseUnits("1", 18);

            const payload = ethers.utils.defaultAbiCoder.encode(['uint8', 'address[]', 'uint256[]'],[1, [wnt.address, usdc.address], [longTokenAmount, shortTokenAmount]]);
            
            const usdcBalanceBefore = await usdc.balanceOf(vault.address);
            const wntBalanceBefore = await wnt.balanceOf(vault.address);
            expect(usdcBalanceBefore).to.be.equal(1000000000); // 1000 usd
            expect(wntBalanceBefore).to.be.equal("1000000000000000000"); // 1 eth

            await vault.connect(wallet).execute(1, ActionType.Stake, payload);

            const usdcBalanceAfter = await usdc.balanceOf(vault.address);            
            const wntBalanceAfter = await wnt.balanceOf(vault.address);
            expect(usdcBalanceAfter).to.be.equal(0);
            expect(wntBalanceAfter).to.be.equal(0);
            const marketTokenAmountBefore = await marketToken.balanceOf(gmxPlugin.address);
            expect(marketTokenAmountBefore).eq("0");

            const block = await provider.getBlock((await provider.getBlockNumber()));
            await executeDeposit(fixture, block);

            const marketTokenAmountAfter = await marketToken.balanceOf(gmxPlugin.address);
            expect(marketTokenAmountAfter).eq("6000000000000000000000"); //6000 GM token
        })

        it("Unstake", async () => {
            const payload = ethers.utils.defaultAbiCoder.encode(['uint8', 'uint256'], [1, "6000000000000000000000"]);

            const marketTokenAmountBefore = await marketToken.balanceOf(gmxPlugin.address);
            expect(marketTokenAmountBefore).eq("6000000000000000000000");

            await vault.connect(wallet).execute(1, ActionType.Unstake, payload);

            const marketTokenAmountAfter = await marketToken.balanceOf(gmxPlugin.address);
            expect(marketTokenAmountAfter).eq("0");

            const withdrawalKeys = await getWithdrawalKeys(dataStore, 0, 1);

            const block = await provider.getBlock((await provider.getBlockNumber()));

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

            let usdcBalanceBefore = await usdc.balanceOf(vault.address);
            let wntBalanceBefore = await wnt.balanceOf(vault.address);

            await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], params);
            let usdcBalanceAfter = await usdc.balanceOf(vault.address);
            let wntBalanceAfter = await wnt.balanceOf(vault.address);

            expect(usdcBalanceAfter - usdcBalanceBefore).to.be.equal(1000000000);
            expect(wntBalanceAfter - wntBalanceBefore).to.be.equal(1000000000000000000);
        })
    })

    describe("addWithdrawalRequest", async () => {
        before(async () => {
            await vault.addWithdrawalToken(usdc.address);
        })
        it("addWithdrawalRequest", async () => {
            const lpTokenBalanceBefore = await vault.balanceOf(user0.address);
            await vault.connect(user0).approve(vault.address, lpTokenBalanceBefore);
            await vault.connect(user0).addWithdrawRequest(usdc.address, lpTokenBalanceBefore);
            const lpTokenBalanceAfter = await vault.balanceOf(user0.address);
            expect(lpTokenBalanceAfter).to.be.equal(0);

        })
        it("activatePendingStatus", async () => {
            await vault.activatePendingStatus();
            expect(await vault.protocolStatus()).to.be.equal(Status.Pending);
        })
        it("Swap Token", async() => {
            const wntBalance = await wnt.balanceOf(vault.address);
            const payload = ethers.utils.defaultAbiCoder.encode(['address[]', 'uint256[]'],[[wnt.address],[wntBalance]]);
            await vault.approveTokens(1, payload);

            let usdcBalance = await usdc.balanceOf(marketToken.address);
            expect(usdcBalance).to.be.equal(0);
            await handleDeposit(fixture.gmxFixture, {
                create: {
                    market: ethUsdMarket,
                    shortTokenAmount: expandDecimals(50_000, 6),
                },
            });

            usdcBalance = await usdc.balanceOf(marketToken.address);
            expect(usdcBalance).to.be.equal("50000000000");
            
            const orderParams = {
                create: {
                    receiver: vault,
                    initialCollateralToken: wnt,
                    initialCollateralDeltaAmount: wntBalance,
                    acceptablePrice: 0,
                    orderType: OrderType.MarketSwap,
                    swapPath: [ethUsdMarket.marketToken],
                    gasUsageLabel: "orderHandler.createOrder",
                    gmx: gmxPlugin,
                },
                execute: {
                    gasUsageLabel: "orderHandler.executeOrder",
                }
            }

            const params = {
                addresses: {
                    receiver: vault.address,
                    callbackContract: vault.address,
                    uiFeeReceiver: vault.address,
                    market: ethers.constants.AddressZero,
                    initialCollateralToken: wnt.address,
                    swapPath: [ethUsdMarket.marketToken],
                },
                numbers: {
                    sizeDeltaUsd: 0,
                    initialCollateralDeltaAmount: wntBalance,
                    triggerPrice: 0,
                    acceptablePrice: expandDecimals(5200, 12),
                    executionFee: 0,
                    callbackGasLimit: "200000",
                    minOutputAmount: 0,
                },
                orderType: OrderType.MarketSwap,
                decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
                isLong: false,
                shouldUnwrapNativeToken: true,
                referralCode:  ethers.constants.HashZero,
            }
            const swapPayload = ethers.utils.defaultAbiCoder.encode([
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

            const orderCountBefore = await getOrderCount(dataStore);
            const usdBalanceBefore = await usdc.balanceOf(vault.address);

            await vault.execute(1, ActionType.SwapTokens, swapPayload);

            const orderCountAfter = await getOrderCount(dataStore);
            expect(orderCountAfter - orderCountBefore).to.be.equal(1);

            await executeOrder(fixture.gmxFixture, orderParams.execute);
            
            const usdBalanceAfter = await usdc.balanceOf(vault.address);
            expect(usdBalanceAfter - usdBalanceBefore).eq(5000000000);
        })
        it("settleWithdrawRequest", async () => {
            await vault.settleWithdrawRequest();
            expect(await vault.protocolStatus()).to.be.equal(Status.Normal);
            const usdcBalance = await usdc.balanceOf(user0.address);
            expect(usdcBalance).to.be.equal(6000000000);
        })
    })
});