import {ethers} from 'hardhat';
import { deployNew } from '../utils/helper';
export const deployContracts = async (fixture: any) => {
    const accountList = await ethers.getSigners();
    const vault = await deployNew("Vault", []);
    const gmxPlugin = await deployNew("GmxPlugin", [accountList[1].address]);
 
    await vault.setMaster(accountList[0].address);
    await vault.addPlugin(1, gmxPlugin.address);
    await gmxPlugin.setConfig(
        fixture.contracts.exchangeRouter.address, 
        fixture.contracts.router.address, 
        fixture.contracts.depositVault.address, 
        fixture.contracts.withdrawalVault.address
    );
    await gmxPlugin.addPool(
        1, 
        fixture.contracts.ethUsdMarket.longToken, 
        fixture.contracts.ethUsdMarket.shortToken, 
        fixture.contracts.ethUsdMarket.marketToken
    );
    const tokenPriceConsumer = await deployNew("TokenPriceConsumer", [[], []]);
    return {
        contracts: {
            vault,
            gmxPlugin,
            tokenPriceConsumer
        }
    }
}