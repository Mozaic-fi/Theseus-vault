import { ethers } from "hardhat";
import vaultAbi from "../abi/Vault.json";

const main = async () => {
    const [deployer] = await ethers.getSigners(); 
    const vaultContract = new ethers.Contract("0x0b4407907cF70A9eF4aE6dB1Ae4AcE9F952045D0", vaultAbi, deployer);
    // const payload = ethers.utils.defaultAbiCoder.encode(['address[]', 'uint256[]'],[["0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5"],["10000000000000000"]]);
    // console.log(payload);
    await vaultContract.addDepositRequest("0x04FC936a15352a1b15b3B9c56EA002051e3DB3e5", 100000000);
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});