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
import { parseUnits } from "ethers/lib/utils";

describe("Vault Test", () => {
    enum ActionType {
      // Action types
      Stake,
      Unstake,
      SwapTokens,
      ClaimRewards,
      CancelAction
    }

    enum State { Deposit, Withdrawal, Order }
    const { provider } = ethers;
    let fixture;
    let wallet, user0, user1, user2, user8, signer0, signer1, signer2, signer3, signer4, signer7, signer9;
    let roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, depositStoreUtils, reader, withdrawalHandler;
    let oracleSalt;
    let vault, gmxPlugin, gmxCallback, tokenPriceConsumer;
    let marketToken;
    let newMasterAddress, newTokenPriceConsumer;
    before(async () => {
        fixture = await loadFixture(deployContracts);
        ({ wallet, user0, user1, user2, user8, signer0, signer1, signer2, signer3, signer4, signer7, signer9 } = fixture.gmxFixture.accounts);

        ({ roleStore, dataStore, eventEmitter, oracleStore, oracle, wnt, wbtc, usdc, ethUsdMarket, depositVault, depositHandler, withdrawalHandler, depositStoreUtils, reader } = fixture.gmxFixture.contracts);
        ({ oracleSalt } = fixture.gmxFixture.props);
        ({ vault, gmxPlugin, gmxCallback, tokenPriceConsumer} = fixture.pluginFixture);

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

    describe("SetTreasury", async function () {
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

    describe("SetExecutionFee", async function () {
        before(async function() {
            await vault.setMaster(wallet.address);
        })
        it("should set execution fee by owner", async function () {
            const depositMinExecFee = 100; // Set your desired value
            const withdrawMinExecFee = 50; // Set your desired value
        
            await vault.connect(wallet).setExecutionFee(depositMinExecFee, withdrawMinExecFee);
        
            const actualDepositMinExecFee = await vault.depositMinExecFee();
            const actualWithdrawMinExecFee = await vault.withdrawMinExecFee();
        
            expect(actualDepositMinExecFee).to.equal(depositMinExecFee);
            expect(actualWithdrawMinExecFee).to.equal(withdrawMinExecFee);
          });
        
          it("should not set execution fee by non-owner", async function () {
            const depositMinExecFee = 100; // Set your desired value
            const withdrawMinExecFee = 50; // Set your desired value
        
            await expect(
              vault.connect(user0).setExecutionFee(depositMinExecFee, withdrawMinExecFee)
            ).to.be.revertedWith("Vault: caller must be master");
          });
        
          it("should emit SetExecutionFee event", async function () {
            const depositMinExecFee = 100; // Set your desired value
            const withdrawMinExecFee = 50; // Set your desired value
        
            const tx = await vault.connect(wallet).setExecutionFee(depositMinExecFee, withdrawMinExecFee);
        
            expect(tx)
              .to.emit(vault, "SetExecutionFee")
              .withArgs(depositMinExecFee, withdrawMinExecFee);
          });
    })

    describe("addAcceptedToken", function () {
        it("should add a new accepted token when called by the owner", async function () {
          const newToken = user0.address;
    
          // Call the addAcceptedToken function as the owner
          await vault.connect(wallet).addAcceptedToken(newToken);
    
          // Check if the new token is in the list of accepted tokens
          expect(await vault.acceptedTokenMap(newToken)).to.equal(true);
          expect(await vault.acceptedTokens(2)).to.equal(newToken);
        });
    
        it("should emit AddToken event when a new token is added", async function () {
          const newToken = user1.address;
    
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
          const tokenToRemove1 = await vault.acceptedTokens(2);
          const tokenToRemove2 = await vault.acceptedTokens(3);
    
          // Call the removeAcceptedToken function as the owner
          await vault.connect(wallet).removeAcceptedToken(tokenToRemove1);
          await vault.connect(wallet).removeAcceptedToken(tokenToRemove2);

    
          // Check if the token has been removed from the list of accepted tokens
          expect(await vault.acceptedTokenMap(tokenToRemove1)).to.equal(false);
          expect(await vault.acceptedTokens(0)).to.not.equal(tokenToRemove2);
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
        let minGmAmount: any = 0;
        let payload = "";
        before(async () => {
            await vault.connect(wallet).setTokenPriceConsumer(tokenPriceConsumer.address);
            await vault.connect(wallet).setExecutionFee(1000000000000000, 0);
        })

        it("should add a deposit request and mint LP tokens when called with valid parameters", async function () {
            const usdcAmount = ethers.utils.parseUnits("1000", 6);
            const wntAmount = ethers.utils.parseUnits("1", 18);
            await usdc.mint(user0.address, usdcAmount);
            await wnt.mint(user0.address, wntAmount);

            // Call the addDepositRequest function with valid parameters
            await usdc.connect(user0).approve(vault.address, usdcAmount);
            await wnt.connect(user0).approve(vault.address, wntAmount);

            minGmAmount = ethers.utils.parseEther("1000");
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);
            await vault.connect(user0).addDepositRequest(usdc.address, usdcAmount, payload, {value: 1000000000000000});

            // Check if the user's LP token balance has increased
            let lpTokenBalance = await vault.balanceOf(user0.address);
            expect(lpTokenBalance).to.be.equal(1000000000);
      
            // Check if the tokens were transferred from the user to the contract
            const contractTokenBalance = await usdc.balanceOf(vault.address);
            expect(contractTokenBalance).to.equal(usdcAmount);

            minGmAmount = ethers.utils.parseEther("5000");
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);
            await vault.connect(user0).addDepositRequest(wnt.address, wntAmount, payload, {value: 1000000000000000});
            lpTokenBalance = await vault.balanceOf(user0.address);
            expect(lpTokenBalance).to.be.equal(6000_000000);

        });
      
        it("should revert if the token is not an allowed deposit token", async function () {
            const nonAllowedToken = signer9;
            const tokenAmount = ethers.utils.parseEther("100");
        
            minGmAmount = ethers.utils.parseEther("1000");
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);
            // Call the addDepositRequest function with a non-allowed token and expect it to revert
            await expect(vault.connect(user0).addDepositRequest(nonAllowedToken.address, tokenAmount, payload, {value: 1000000000000000}))
                .to.be.revertedWith("Vault: Invalid token");
        });
      
        it("should revert if the token amount is zero", async function () {
            minGmAmount = ethers.utils.parseEther("1000");
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);
            // Call the addDepositRequest function with zero token amount and expect it to revert
            await expect(vault.connect(user0).addDepositRequest(usdc.address, 0, payload, {value: 1000000000000000}))
                .to.be.revertedWith("Vault: Invalid token amount");
            });
    })

    describe("Execute Action", async () => {
        let depositKeys = [];
        it("Stake", async () => {
            // Setting the master address for the vault
            await vault.setMaster(wallet.address);
        
            // Defining token amounts and minimum GMA amount
            const shortTokenAmount = ethers.utils.parseUnits("1000", 6);
            const longTokenAmount = ethers.utils.parseUnits("1", 18);
            const minGmAMount = ethers.utils.parseEther("1000");
            const _payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAMount]);
            // Encoding parameters for the payload
            const payload = ethers.utils.defaultAbiCoder.encode(['uint8', 'address[]', 'uint256[]', 'bytes'], [1, [wnt.address, usdc.address], [longTokenAmount, shortTokenAmount], _payload]);
        
            // Checking balances before the stake
            const usdcBalanceBefore = await usdc.balanceOf(vault.address);
            const wntBalanceBefore = await wnt.balanceOf(vault.address);
            expect(usdcBalanceBefore).to.be.equal(1000000000); // 1000 usd
            expect(wntBalanceBefore).to.be.equal("1000000000000000000"); // 1 eth
        
            // Checking the deposit keys before the stake
            depositKeys = await gmxCallback.getKeys(State.Deposit);
            expect(depositKeys.length).eq(0);
        
            // Executing the stake action
            await vault.connect(wallet).execute(1, ActionType.Stake, payload);
        
            // Checking balances after the stake
            const usdcBalanceAfter = await usdc.balanceOf(vault.address);
            const wntBalanceAfter = await wnt.balanceOf(vault.address);
            expect(usdcBalanceAfter).to.be.equal(0);
            expect(wntBalanceAfter).to.be.equal(0);
        
            // Checking the market token amount before deposit
            const marketTokenAmountBefore = await marketToken.balanceOf(gmxPlugin.address);
            expect(marketTokenAmountBefore).eq("0");
        
            // Getting the current block and deposit keys after the stake
            const block = await provider.getBlock((await provider.getBlockNumber()));
            depositKeys = await gmxCallback.getKeys(State.Deposit);
            expect(depositKeys.length).eq(1);
        
            // Checking vault status before and after deposit
            let vaultStatus = await vault.getVaultStatus();
            expect(vaultStatus).to.equal(false);

            await executeDeposit(fixture, block);
            
            vaultStatus = await vault.getVaultStatus();
            expect(vaultStatus).to.equal(true);
        
            // Checking deposit keys after deposit
            depositKeys = await gmxCallback.getKeys(State.Deposit);
            expect(depositKeys.length).eq(0);
        
            // Checking market token amount after deposit
            const marketTokenAmountAfter = await marketToken.balanceOf(gmxPlugin.address);
            expect(marketTokenAmountAfter).to.equal("6000000000000000000000");
        
            // Checking balances in vault and gmxPlugin after deposit
            const usdcBalance = await usdc.balanceOf(vault.address);
            const wntBalance = await wnt.balanceOf(vault.address);
            const usdcBalance1 = await usdc.balanceOf(gmxPlugin.address);
            const wntBalance1 = await wnt.balanceOf(gmxPlugin.address);
            expect(wntBalance).to.equal("0");
            expect(wntBalance1).to.equal("0");
        
            // Checking if the market token amount matches the expected value
            expect(marketTokenAmountAfter).eq("6000000000000000000000"); //6000 GM token
        });
    })

    describe("AddWithdrawalRequest", async () => {
        let withdrawalKeys = [];
        it("addWithdrawalRequest", async () => {
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);

            const lpTokenBalanceBefore = await vault.balanceOf(user0.address);
            const lpTokenBalanceInVaultBefore = await vault.balanceOf(vault.address);
            expect(lpTokenBalanceInVaultBefore).to.equal(0);
            
            const payload = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'],[0, 0]);
            await vault.connect(user0).approve(vault.address, lpTokenBalanceBefore);
            await vault.connect(user0).addWithdrawalRequest(lpTokenBalanceBefore, 1, 1, payload);

            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(1);

            const lpTokenBalanceAfter = await vault.balanceOf(user0.address);
            const lpTokenBalanceInVaultAfter = await vault.balanceOf(vault.address);

            expect(lpTokenBalanceInVaultAfter).to.equal(6000000000);
            expect(lpTokenBalanceAfter).to.be.equal(0);
        })
        it("Cancel Withdrawal", async () => {
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(1);

            const payload = ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32'],[State.Withdrawal, withdrawalKeys[0]]);
            const lpBalanceBefore = await vault.balanceOf(user0.address);
            const lpInVault = await vault.balanceOf(vault.address);
            
            await vault.execute(1, ActionType.CancelAction, payload);
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(0);

            const lpBalanceAfter = await vault.balanceOf(user0.address);

            expect(lpInVault).to.equal(6000000000);
            expect(lpBalanceBefore).to.equal(0);
            expect(lpBalanceAfter).to.equal(6000000000);


        })
        it("addWithdrawalRequest", async () => {
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);

            const lpTokenBalanceBefore = await vault.balanceOf(user0.address);
            const lpTokenBalanceInVaultBefore = await vault.balanceOf(vault.address);
            expect(lpTokenBalanceInVaultBefore).to.equal(0);
            
            const payload = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'],[0, 0]);
            await vault.connect(user0).approve(vault.address, lpTokenBalanceBefore);
            await vault.connect(user0).addWithdrawalRequest(lpTokenBalanceBefore, 1, 1, payload);

            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(1);

            const lpTokenBalanceAfter = await vault.balanceOf(user0.address);
            const lpTokenBalanceInVaultAfter = await vault.balanceOf(vault.address);

            expect(lpTokenBalanceInVaultAfter).to.equal(6000000000);
            expect(lpTokenBalanceAfter).to.be.equal(0);
        })
        it("Execute Withdrawal", async() => {
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

            let usdcBalanceBefore = await usdc.balanceOf(user0.address);
            let wntBalanceBefore = await wnt.balanceOf(user0.address);
            await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], params);
            let usdcBalanceAfter = await usdc.balanceOf(user0.address);
            let wntBalanceAfter = await wnt.balanceOf(user0.address);

            expect(usdcBalanceAfter - usdcBalanceBefore).to.be.equal(1000000000);
            expect(wntBalanceAfter - wntBalanceBefore).to.be.equal(1000000000000000000);
            const lpTokenBalanceInVaultAfter = await vault.balanceOf(vault.address);
            
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(0);

            expect(lpTokenBalanceInVaultAfter).to.be.equal(0);
        })
    })

    describe("addDepositRequest to selected Pool", async () => {
        let minGmAmount: any = 0;
        let payload = "";
        before(async () => {
            await vault.connect(wallet).setTokenPriceConsumer(tokenPriceConsumer.address);
            await vault.connect(wallet).setExecutionFee(1000000000000000, 0);
            await vault.connect(wallet).selectPluginAndPool(1, 1);

        })

        it("should add a deposit request and mint LP tokens when called with valid parameters", async function () {
            const usdcAmount = ethers.utils.parseUnits("1000", 6);
            const wntAmount = ethers.utils.parseUnits("1", 18);
            await usdc.mint(user0.address, usdcAmount);
            await wnt.mint(user0.address, wntAmount);

            // Call the addDepositRequest function with valid parameters
            await usdc.connect(user0).approve(vault.address, usdcAmount);
            await wnt.connect(user0).approve(vault.address, wntAmount);
            minGmAmount = ethers.utils.parseEther("1000");
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);

            await vault.connect(user0).addDepositRequest(usdc.address, usdcAmount, payload, {value: 1000000000000000});

            // Getting the current block and excute deposit
            let block = await provider.getBlock((await provider.getBlockNumber()));
            await executeDeposit(fixture, block);

            // Check if the user's LP token balance has increased
            let lpTokenBalance = await vault.balanceOf(user0.address);
            expect(lpTokenBalance).to.be.equal(1000000000);
      
            let poolTokenInfo = await vault.getPoolTokenInfo(1, 1);
            expect(poolTokenInfo.balance).to.equal("1000000000000000000000");

            minGmAmount = ethers.utils.parseEther("5000");
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);
            await vault.connect(user0).addDepositRequest(wnt.address, wntAmount, payload, {value: 1000000000000000});

            // Getting the current block and excute deposit
            block = await provider.getBlock((await provider.getBlockNumber()));
            await executeDeposit(fixture, block);

            poolTokenInfo = await vault.getPoolTokenInfo(1, 1);
            expect(poolTokenInfo.balance).to.equal("6000000000000000000000");


            lpTokenBalance = await vault.balanceOf(user0.address);
            expect(lpTokenBalance).to.be.equal(6000_000000);
        });
      
        it("should revert if the token is not an allowed deposit token", async function () {
            const nonAllowedToken = signer9;
            const tokenAmount = ethers.utils.parseEther("100");

            minGmAmount = 0;
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);
        
            // Call the addDepositRequest function with a non-allowed token and expect it to revert
            await expect(vault.connect(user0).addDepositRequest(nonAllowedToken.address, tokenAmount, payload, {value: 1000000000000000}))
                .to.be.revertedWith("Vault: Invalid token");
        });
      
        it("should revert if the token amount is zero", async function () {
            minGmAmount = 0;
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);

            // Call the addDepositRequest function with zero token amount and expect it to revert
            await expect(vault.connect(user0).addDepositRequest(usdc.address, 0, payload, {value: 1000000000000000}))
                .to.be.revertedWith("Vault: Invalid token amount");
            });
    })
    describe("AddWithdrawalRequest", async () => {
        let withdrawalKeys = [];
        it("addWithdrawalRequest", async () => {
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);

            const lpTokenBalanceBefore = await vault.balanceOf(user0.address);
            const lpTokenBalanceInVaultBefore = await vault.balanceOf(vault.address);
            expect(lpTokenBalanceInVaultBefore).to.equal(0);
            
            const payload = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'],[0, 0]);
            await vault.connect(user0).approve(vault.address, lpTokenBalanceBefore);
            await vault.connect(user0).addWithdrawalRequest(lpTokenBalanceBefore, 1, 1, payload);

            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(1);

            const lpTokenBalanceAfter = await vault.balanceOf(user0.address);
            const lpTokenBalanceInVaultAfter = await vault.balanceOf(vault.address);

            expect(lpTokenBalanceInVaultAfter).to.equal(6000000000);
            expect(lpTokenBalanceAfter).to.be.equal(0);
        })
        it("Cancel Withdrawal", async () => {
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(1);

            const payload = ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32'],[State.Withdrawal, withdrawalKeys[0]]);
            const lpBalanceBefore = await vault.balanceOf(user0.address);
            const lpInVault = await vault.balanceOf(vault.address);
            
            await vault.execute(1, ActionType.CancelAction, payload);
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(0);

            const lpBalanceAfter = await vault.balanceOf(user0.address);

            expect(lpInVault).to.equal(6000000000);
            expect(lpBalanceBefore).to.equal(0);
            expect(lpBalanceAfter).to.equal(6000000000);


        })
        it("addWithdrawalRequest", async () => {
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);

            const lpTokenBalanceBefore = await vault.balanceOf(user0.address);
            const lpTokenBalanceInVaultBefore = await vault.balanceOf(vault.address);
            expect(lpTokenBalanceInVaultBefore).to.equal(0);
            
            const payload = ethers.utils.defaultAbiCoder.encode(['uint256', 'uint256'],[0, 0]);
            await vault.connect(user0).approve(vault.address, lpTokenBalanceBefore);
            await vault.connect(user0).addWithdrawalRequest(lpTokenBalanceBefore, 1, 1, payload);

            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(1);

            const lpTokenBalanceAfter = await vault.balanceOf(user0.address);
            const lpTokenBalanceInVaultAfter = await vault.balanceOf(vault.address);

            expect(lpTokenBalanceInVaultAfter).to.equal(6000000000);
            expect(lpTokenBalanceAfter).to.be.equal(0);
        })
        it("Execute Withdrawal", async() => {
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

            let usdcBalanceBefore = await usdc.balanceOf(user0.address);
            let wntBalanceBefore = await wnt.balanceOf(user0.address);
            await withdrawalHandler.executeWithdrawal(withdrawalKeys[0], params);
            let usdcBalanceAfter = await usdc.balanceOf(user0.address);
            let wntBalanceAfter = await wnt.balanceOf(user0.address);

            expect(usdcBalanceAfter - usdcBalanceBefore).to.be.equal(1000000000);
            expect(wntBalanceAfter - wntBalanceBefore).to.be.equal(1000000000000000000);
            const lpTokenBalanceInVaultAfter = await vault.balanceOf(vault.address);
            
            withdrawalKeys = await gmxCallback.getKeys(State.Withdrawal);
            expect(withdrawalKeys.length).to.equal(0);

            expect(lpTokenBalanceInVaultAfter).to.be.equal(0);
        })
    })
    

    describe("UpdateLiquidityProviderRate", async () => {
        before(async () => {
            await vault.connect(wallet).setTokenPriceConsumer(tokenPriceConsumer.address);
            await vault.connect(wallet).setExecutionFee(1000000000000000, 0);
            await vault.connect(wallet).setProtocolFeePercentage(500); // 5 %
            await vault.connect(wallet).setTreasury(user8.address);
            await vault.connect(wallet).selectPluginAndPool(0, 0);
        })
        it("addDepositRequest", async () => {
            let total = await vault.totalAssetInUsd();
            expect(total).to.equal("1000000000000000000000000000000000000");
            const usdcAmount = ethers.utils.parseUnits("1000", 6);
            const wntAmount  = ethers.utils.parseUnits("1", 18);
            await usdc.mint(user0.address, usdcAmount);
            await wnt.mint(user0.address, wntAmount);

            // Call the addDepositRequest function with valid parameters
            await usdc.connect(user0).approve(vault.address, usdcAmount);
            await wnt.connect(user0).approve(vault.address, wntAmount);

            let minGmAmount = ethers.utils.parseEther("0");
            let payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);
            await vault.connect(user0).addDepositRequest(usdc.address, usdcAmount, payload, {value: 1000000000000000});

            const lpBalanceuser0 = await vault.balanceOf(user0.address);
            expect(lpBalanceuser0).to.equal("1000000000");

            total = await vault.totalAssetInUsd();
            expect(total).to.equal("1001000000000000000000000000000000000000");

            // Check if the user's LP token balance has increased
            let lpTokenBalance = await vault.balanceOf(user0.address);
            expect(lpTokenBalance).to.be.equal(1000_000000);

            // Check if the tokens were transferred from the user to the contract
            const contractTokenBalance = await usdc.balanceOf(vault.address);
            expect(contractTokenBalance).to.equal(usdcAmount);

            minGmAmount = ethers.utils.parseEther("5000");
            payload = ethers.utils.defaultAbiCoder.encode(['uint256'], [minGmAmount]);
            await vault.connect(user0).addDepositRequest(wnt.address, wntAmount, payload, {value: 1000000000000000});
            lpTokenBalance = await vault.balanceOf(user0.address);
            expect(lpTokenBalance).to.be.equal(6000_000000);

            total = await vault.totalAssetInUsd();
            expect(total).to.equal("6001000000000000000000000000000000000000");
        })

        it("updateLiquidityProviderRate", async () => {
            await usdc.mint(vault.address, parseUnits("3000", 6));
            let total = await vault.totalAssetInUsd();
            expect(total).to.equal("9001000000000000000000000000000000000000");

            let lpRate = await vault.lpRate();
            let protocolFeeInVault = await vault.protocolFeeInVault();
            expect(lpRate).to.equal("1000000000000000000");
            expect(protocolFeeInVault).to.equal(0);

            const currentRate = await vault.getCurrentLiquidityProviderRate();
            expect(currentRate).to.equal("1499916680553241126");

            await vault.updateLiquidityProviderRate();
            protocolFeeInVault = await vault.protocolFeeInVault();

            lpRate = await vault.lpRate();
            expect(lpRate).to.equal("1474920846525579070");
            expect(protocolFeeInVault).to.equal("149999999999999999856300000000000000000");
        })

        it("withdrawProtocolFee", async () => {
            let usdcBalance = await usdc.balanceOf(user8.address);
            expect(usdcBalance).to.equal(0);

            await vault.withdrawProtocolFee(usdc.address);
            usdcBalance = await usdc.balanceOf(user8.address);
            
            expect(usdcBalance).to.equal(149999999);
            const protocolFeeInVault = await vault.protocolFeeInVault();
            expect(protocolFeeInVault).to.equal(0);
        })
        it("TransferExecutionFee", async () => {
            const vaultBalanceBefore = await vault.getBalance();
            const gmxBalanceBefore = await gmxPlugin.getBalance();
            await vault.transferExecutionFee(1, 2000000000000000);
            const vaultBalanceAfter = await vault.getBalance();
            const gmxBalanceAfter = await gmxPlugin.getBalance();
            expect(vaultBalanceBefore - vaultBalanceAfter).to.equal(2000000000000000);
            expect(gmxBalanceAfter - gmxBalanceBefore).to.equal(2000000000000000);
        })
    })
}); 