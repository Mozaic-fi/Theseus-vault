// const hre = require("hardhat");
import { ethers } from "hardhat";
import { deployNew } from '../utils/helper';
import { ARBITRUM_GOERLI } from "../utils/chains";
import { getContract } from "../utils/contracts";
import readerAbi from "../abi/Reader.json";
import exchangeRouterAbi from "../abi/ExchangeRouter.json";
import { DecreasePositionSwapType, OrderType } from "../utils/order";

const main = async () => {
    const [deployer] = await ethers.getSigners(); 
    console.log("signers", deployer.address);
    // const tokenPriceConsumer = await deployNew("TokenPriceConsumer", [[], []]);
    // console.log("tokenPriceConsumer", tokenPriceConsumer.address);
    // const vault = await deployNew("Vault", []);
    // console.log("vault", vault.address);
    // const gmxPlugin = await deployNew("GmxPlugin", [vault.address]);
    // console.log("gmxPlugin", gmxPlugin.address);

   
    // await vault.setMaster(deployer.address);
    // console.log("setMaster");
    // await vault.setTokenPriceConsumer(tokenPriceConsumer.address);
    // console.log("setTokenPriceConsumer");
    // await vault.addPlugin(1, gmxPlugin.address);
    // console.log("addPlugin");

    // // gmx plugin config
    // await gmxPlugin.setMaster(deployer.address);
    // console.log("setMaster");
    // await gmxPlugin.setTokenPriceConsumer(tokenPriceConsumer.address);
    // console.log("setTokenPriceConsumer");
    // await gmxPlugin.setRouterConfig(
    //     getContract(ARBITRUM_GOERLI, "ExchangeRouter"),
    //     getContract(ARBITRUM_GOERLI, "SyntheticsRouter"),
    //     getContract(ARBITRUM_GOERLI, "DepositVault"),
    //     getContract(ARBITRUM_GOERLI, "WithdrawalVault"),
    //     getContract(ARBITRUM_GOERLI, "OrderVault"),
    //     getContract(ARBITRUM_GOERLI, "SyntheticsReader"),
    // );
    // console.log("setRouterConfig");
    // console.log("address", getContract(ARBITRUM_GOERLI, "DataStore"));
    // console.log("deployer", deployer.address);
    // const ReaderContract = new ethers.Contract(getContract(ARBITRUM_GOERLI, "SyntheticsReader"), readerAbi, deployer);
    // console.log("reader", ReaderContract.address);
    // const marketlist = await ReaderContract.getMarkets(getContract(ARBITRUM_GOERLI, "DataStore"),  0, 100);
    // console.log("market list", marketlist);
    // const ethUsdMarket = marketlist[0];
    // console.log("index Token", ethUsdMarket.indexToken);
    // await gmxPlugin.addPool(
    //     1,
    //     ethUsdMarket.indexToken,
    //     ethUsdMarket.longToken, 
    //     ethUsdMarket.shortToken, 
    //     ethUsdMarket.marketToken
    // );

    // console.log("start addtokens");
    // await vault.addAcceptedToken(ethUsdMarket.longToken);
    // await vault.addAcceptedToken(ethUsdMarket.shortToken);
    // await vault.addDepositAllowedToken(ethUsdMarket.shortToken);
    // await vault.addWithdrawalToken(ethUsdMarket.shortToken);
    // console.log("end tokens");
    // const usdcMockAggregator = await deployNew("MockAggregator", [18, "usdc", 1, "1000000000000000000", 0, 0, 0, "1000000000000000000"]);
    // const ethMockAggregator = await deployNew("MockAggregator", [18, "wnt", 1, "5000000000000000000000", 0, 0, 0, "5000000000000000000000"]);
    
    // console.log("usdcMockAggregator", usdcMockAggregator.address);
    // console.log("ethMockAggregator", ethMockAggregator.address);
    
    // await tokenPriceConsumer.addPriceFeed(ethUsdMarket.shortToken, usdcMockAggregator.address);
    // console.log("add price feed1")

    // await tokenPriceConsumer.addPriceFeed(ethUsdMarket.longToken, ethMockAggregator.address);
    // console.log("add price feed2")
    // const payload = ethers.utils.defaultAbiCoder.encode(['uint8',' address[]', 'uint256[]'],[1, ["0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3", "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5"], [0, 100000000]]);
    // console.log("payload", payload);
    const exchangeRouter = new ethers.Contract("0xFE98518C9c8F1c5a216E999816c2dE3199f295D2", exchangeRouterAbi, deployer);


    const sender = deployer.address;
    const account = deployer.address;
    const receiver = deployer.address;
    const callbackContract =  ethers.constants.AddressZero;
    const uiFeeReceiver = deployer.address;
    const market = "0x1529876A9348D61C6c4a3EEe1fe6CbF1117Ca315";
    const initialLongToken = "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3";
    const initialShortToken = "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5";
    const longTokenSwapPath = [];
    const shortTokenSwapPath = [];
    const minMarketTokens = 0;
    const shouldUnwrapNativeToken = true;
    const executionFee = "10000000000000000";
    const executionFeeToMint = executionFee;
    const callbackGasLimit = 0;
    const longTokenAmount = 0;
    const shortTokenAmount = 0;

    // await wnt.mint(depositVault.address, executionFeeToMint);

    // if (longTokenAmount.gt(0)) {
    //     const _initialLongToken = await contractAt("MintableToken", initialLongToken);
    //     await _initialLongToken.mint(depositVault.address, longTokenAmount);
    // }

    // if (shortTokenAmount.gt(0)) {
    //     const _initialShortToken = await contractAt("MintableToken", initialShortToken);
    //     await _initialShortToken.mint(depositVault.address, shortTokenAmount);
    // }

    // const params = {
    //     receiver: receiver,
    //     callbackContract: callbackContract,
    //     uiFeeReceiver: uiFeeReceiver,
    //     market: market,
    //     initialLongToken,
    //     initialShortToken,
    //     longTokenSwapPath,
    //     shortTokenSwapPath,
    //     minMarketTokens,
    //     shouldUnwrapNativeToken,
    //     executionFee,
    //     callbackGasLimit,
    // };
    // console.log(params);
    const gasLimit = 5000000;

    // await exchangeRouter.multicall(
    //     [
    //         exchangeRouter.interface.encodeFunctionData("sendTokens", [
    //             "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5",
    //             getContract(ARBITRUM_GOERLI,"DepositVault"),
    //             100000000,
    //         ]),
    //         exchangeRouter.interface.encodeFunctionData("createDeposit", [
    //             params
    //         ])
    //     ], 
    //     {
    //         gasLimit,
    //         value: executionFee
    //     }
    // );
    // console.log("multicall");


//======================

const params = {
    addresses: {
        receiver: deployer.address,
        callbackContract: ethers.constants.AddressZero,
        uiFeeReceiver: deployer.address,
        market: ethers.constants.AddressZero,//"0x1529876A9348D61C6c4a3EEe1fe6CbF1117Ca315",
        initialCollateralToken: "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5",
        swapPath: ["0x1529876A9348D61C6c4a3EEe1fe6CbF1117Ca315"],
    },
    numbers: {
        sizeDeltaUsd: 0,
        initialCollateralDeltaAmount: 0,
        triggerPrice: 0,
        acceptablePrice: 0,
        executionFee: "10000000000000000",
        callbackGasLimit: 0,
        minOutputAmount: 0,
    },
    orderType: OrderType.MarketSwap,
    decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
    isLong: false,
    shouldUnwrapNativeToken: false,
    referralCode: ethers.constants.HashZero 
}


    await exchangeRouter.multicall(
        [
            exchangeRouter.interface.encodeFunctionData("sendWnt", [
                getContract(ARBITRUM_GOERLI,"OrderVault"),
                params.numbers.executionFee,
            ]),
            exchangeRouter.interface.encodeFunctionData("sendTokens", [
                "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5",
                getContract(ARBITRUM_GOERLI,"OrderVault"),
                10000000,
            ]),
            exchangeRouter.interface.encodeFunctionData("createOrder", [
                params
            ])
        ], 
        {
            gasLimit,
            value: params.numbers.executionFee
        }
    );
    console.log("multicall");

    // const decoded = ethers.utils.defaultAbiCoder.decode(['tuple(tuple(address,address,address,address,address,address[]),tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bytes32)'],
    // "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000193e5939a08ce9dbd480000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000006c6b935b8bbd400000000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006278a47688fcd3f3d450ddc875f83b3211a17857000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001529876a9348d61c6c4a3eee1fe6cbf1117ca31500000000000000000000000004fc936a15352a1b15b3b9c56ea002051e3db3e500000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000");
    // console.log("decoded:", decoded);
//======================





    // exchangeRouter.connect(user0).multicall
    
    // // await exchangeRouter.sendTokens("0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5", getContract(ARBITRUM_GOERLI, "DepositVault"), 100000000, {gasLimit: gasLimit});
    // // console.log("sendTokens");
    // await exchangeRouter.createDeposit(params, {value: executionFee, gasLimit: gasLimit});
    // console.log("createDeposit");
    // const data = ethers.utils.defaultAbiCoder.decode(['address', 'address', 'uint256'], "0x7d39aaf100000000000000000000000082afd2590814a7ce3d7ea6b63f80481f8b227ba9000000000000000000000000000000000000000000000000002386f26fc10000");
    // const data = ethers.utils.defaultAbiCoder.decode(['tuple(address,address,address,address,address,address,address[],address[],uint256,bool,uint256,uint256)'], "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000193e5939a08ce9dbd480000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000006c6b935b8bbd400000000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006278a47688fcd3f3d450ddc875f83b3211a17857000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001529876a9348d61c6c4a3eee1fe6cbf1117ca31500000000000000000000000004fc936a15352a1b15b3b9c56ea002051e3db3e500000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000");
    // const data = ethers.utils.defaultAbiCoder.decode(['address','address','address','address','address','address','address[]','address[]','uint256','bool','uint256','uint256'],"0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000193e5939a08ce9dbd480000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000006c6b935b8bbd400000000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006278a47688fcd3f3d450ddc875f83b3211a17857000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001529876a9348d61c6c4a3eee1fe6cbf1117ca31500000000000000000000000004fc936a15352a1b15b3b9c56ea002051e3db3e500000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000");
    // const functionSelector: string = ethers.utils.id('sendTokens(address,address,uint256)');
    // const functionSelector: string = getSelector("sendWnt(address,uint256)");
    
    // const payload1 = ethers.utils.defaultAbiCoder.encode(['address','address','uint256'],["0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5", getContract(ARBITRUM_GOERLI, "DepositVault"), 100000000]);
    // getSelector("sendTokens(address,address,uint256)") + 
    // console.log("payload1", payload1);

    // const payload2 = ethers.utils.defaultAbiCoder.encode(['tuple(address,address,address,address,address,address,address[],address[],uint256,bool,uint256,uint256)'],[params]);
// getSelector("createDeposit((address,address,address,address,address,address,address[],address[],uint256,bool,uint256,uint256))") + 
    // console.log("payload2", payload2);
    // console.log("sel", functionSelector);
    // console.log(data);
}

const getSelector = (data: string): string => {
    return ethers.utils.id(data).slice(0, 10);;
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});