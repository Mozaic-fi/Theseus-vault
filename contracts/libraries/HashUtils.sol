// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

library HashUtils {
    function hashData(bytes[] memory dataTypes, bytes[] memory dataValues) internal pure returns (bytes32) {
        bytes memory encodedData = abi.encode(dataTypes, dataValues);
        bytes32 hash = keccak256(encodedData);

        return hash;
    }

    function hashString(string memory input) internal pure returns (bytes32) {
        bytes[] memory dataTypes = new bytes[](1);
        dataTypes[0] = "string";  // Set the dataType as "string"

        bytes[] memory dataValues = new bytes[](1);
        dataValues[0] = abi.encodePacked(input);

        return hashData(dataTypes, dataValues);
    }
}