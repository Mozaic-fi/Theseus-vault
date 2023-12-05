const hre = require("hardhat");
async function main() {
    await hre.run("verify:verify", {
        address: "0x0b4407907cF70A9eF4aE6dB1Ae4AcE9F952045D0",
        constructorArguments: [
        ],
    });
    await hre.run("verify:verify", {
        address: "0x5a45fE9e9084cfBd0f749ACb2b3D202841aDf1BA",
        constructorArguments: [
            "0x0b4407907cF70A9eF4aE6dB1Ae4AcE9F952045D0"
        ],
    });    
    await hre.run("verify:verify", {
        address: "0x3ccE8566106C75b8Cf5a924E393cA895d16A138b",
        constructorArguments: [
            [],[]
        ],
    });    
}
main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exit(1);
});