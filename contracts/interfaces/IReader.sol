// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

import "./IDataStore.sol"; // Import the DataStore contract
import "./IMarket.sol"; // Import the Market contract
import "./IPrice.sol"; // Import the Price contract
import "./IMarketPoolValueInfo.sol"; // Import the MarketPoolValueInfo contract

interface IReader {
    function getMarketTokenPrice(
        IDataStore dataStore,
        IMarket.Props memory market,
        IPrice.Props memory indexTokenPrice,
        IPrice.Props memory longTokenPrice,
        IPrice.Props memory shortTokenPrice,
        bytes32 pnlFactorType,
        bool maximize
    ) external view returns (int256, IMarketPoolValueInfo.Props memory);
}