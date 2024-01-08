const hre = require("hardhat");
async function main() {

    // Vault 
    await hre.run("verify:verify", {
        address: "0x0F1Fe6741bBDBaE5456346e1F0ba838f3223a4C7",
        constructorArguments: [
        ],
    });

    // Gmx plugin
    await hre.run("verify:verify", {
        address: "0x52cfDe513aF039f4E7E63F7C86954c51Fe5fd058",
        constructorArguments: [
            "0x0F1Fe6741bBDBaE5456346e1F0ba838f3223a4C7"
        ],
    });    
    // Token Consumer
    await hre.run("verify:verify", {
        address: "0x10e551AD38e77fb4a70f989B00cd0679E95e0d7c",
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