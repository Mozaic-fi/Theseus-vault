// const hre = require("hardhat");
import { ethers } from "hardhat";
import { deployNew } from '../utils/helper';
import { ARBITRUM_GOERLI } from "../utils/chains";
import { getContract } from "../utils/contracts";
import readerAbi from "../abi/Reader.json";
import vaultAbi from "../abi/Vault.json";
import gmxAbi from "../abi/GmxPlugin.json";
import tokenAbi from "../abi/marketToken.json";
import exchangeRouterAbi from "../abi/ExchangeRouter.json";
import { DecreasePositionSwapType, OrderType } from "../utils/order";

const main = async () => {
    const [deployer] = await ethers.getSigners(); 
    console.log("signers", deployer.address);
    const exchangeRouter = new ethers.Contract("0xFE98518C9c8F1c5a216E999816c2dE3199f295D2", exchangeRouterAbi, deployer);


    // const sender = deployer.address;
    // const account = deployer.address;
    const receiver = deployer.address;
    const callbackContract =  ethers.constants.AddressZero;
    const uiFeeReceiver = deployer.address;
    const market = "0x1529876A9348D61C6c4a3EEe1fe6CbF1117Ca315";
    // const initialLongToken = "0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3";
    // const initialShortToken = "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5";
    const longTokenSwapPath = [];
    const shortTokenSwapPath = [];
    // const minMarketTokens = 0;
    const shouldUnwrapNativeToken = false;
    const executionFee = "1000000000000000";
    // const executionFeeToMint = executionFee;
    const callbackGasLimit = 0;
    // const longTokenAmount = 0;
    // const shortTokenAmount = 0;
    // struct CreateDepositParams {
    //     address receiver;
    //     address callbackContract;
    //     address uiFeeReceiver;
    //     address market;
    //     address initialLongToken;
    //     address initialShortToken;
    //     address[] longTokenSwapPath;
    //     address[] shortTokenSwapPath;
    //     uint256 minMarketTokens;
    //     bool shouldUnwrapNativeToken;
    //     uint256 executionFee;
    //     uint256 callbackGasLimit;
    // }
    const params = {
        receiver: receiver,
        callbackContract: callbackContract,
        uiFeeReceiver: uiFeeReceiver,
        market: market,
        longTokenSwapPath,
        shortTokenSwapPath,
        minLongTokenAmount: 0,
        minShortTokenAmount: 1,
        shouldUnwrapNativeToken: 0,
        executionFee,
        callbackGasLimit,
    };
    console.log(params);
    const gasLimit = 1000000;

    await exchangeRouter.multicall(
        [
            exchangeRouter.interface.encodeFunctionData("sendWnt", [
                getContract(ARBITRUM_GOERLI,"WithdrawalVault"),
                params.executionFee,
            ]),
            exchangeRouter.interface.encodeFunctionData("sendTokens", [
                "0x1529876A9348D61C6c4a3EEe1fe6CbF1117Ca315",
                getContract(ARBITRUM_GOERLI,"WithdrawalVault"),
                "5000000000000000000",
            ]),
            exchangeRouter.interface.encodeFunctionData("createWithdrawal", [
                params
            ])
        ], 
        {
            gasLimit,
            value: params.executionFee
        }
    );
    console.log("withdraw");
    

    // const createDepositPayload = ethers.utils.defaultAbiCoder.encode(['uint8','address[]','uint256[]'],[1,["0xe39Ab88f8A4777030A534146A9Ca3B52bd5D43A3", "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5"],[0,"10000000"]]);
    const vaultContract = new ethers.Contract("0x0b4407907cF70A9eF4aE6dB1Ae4AcE9F952045D0", vaultAbi, deployer);
    
    // // const gmxPlugin = new ethers.Contract("0x5a45fE9e9084cfBd0f749ACb2b3D202841aDf1BA", gmxAbi, deployer); 
    // // await gmxPlugin.setGmxParams("0x0b4407907cF70A9eF4aE6dB1Ae4AcE9F952045D0", "0x0000000000000000000000000000000000000000", 0,"1000000000000000",false);
    // await vaultContract.execute(1, 0 ,createDepositPayload, {gasLimit: gasLimit});
    // console.log("create deposit");

    // const GM = new ethers.Contract("0x1529876A9348D61C6c4a3EEe1fe6CbF1117Ca315", tokenAbi, deployer);
    // await GM.approve("0xa960786Bc30F8587279df6116F9E0B15C5b034dE", "1000000000000000000000");
    // console.log("approve");
    // const withdrawPayload = ethers.utils.defaultAbiCoder.encode(['uint8', 'uint256'],[1, "2000000000000000000"]);
    // await vaultContract.execute(1, 1 ,withdrawPayload, {gasLimit: gasLimit});
//======================

    // await exchangeRouter.sendWnt(getContract(ARBITRUM_GOERLI,"OrderVault"),params.numbers.executionFee, {value: params.numbers.executionFee, gasLimit});
    // console.log("&&");
    // await exchangeRouter.sendTokens("0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5",getContract(ARBITRUM_GOERLI,"OrderVault"),params.numbers.initialCollateralDeltaAmount, {gasLimit});
    // console.log("&&");
    // await exchangeRouter.createOrder(params, {gasLimit});
    // console.log("&&");
    /*await exchangeRouter.multicall(
        [
            exchangeRouter.interface.encodeFunctionData("sendWnt", [
                getContract(ARBITRUM_GOERLI,"OrderVault"),
                params.numbers.executionFee,
            ]),
            exchangeRouter.interface.encodeFunctionData("sendTokens", [
                "0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5",
                getContract(ARBITRUM_GOERLI,"OrderVault"),
                1000000,
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
    console.log("multicall");*/

    // const decoded = ethers.utils.defaultAbiCoder.decode(['tuple(tuple(address,address,address,address,address,address[]),tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bytes32)'],
    // "0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001a000000000000000000000000000000000000000193e5939a08ce9dbd480000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006c6b935b8bbd40000000000000000000000000000000000000000000000000006c6b935b8bbd400000000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000006278a47688fcd3f3d450ddc875f83b3211a17857000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001529876a9348d61c6c4a3eee1fe6cbf1117ca31500000000000000000000000004fc936a15352a1b15b3b9c56ea002051e3db3e500000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000");
    // console.log("decoded:", decoded);
}


main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});