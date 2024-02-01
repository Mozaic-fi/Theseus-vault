// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract TokenPriceConsumer is Ownable {
    mapping(address => AggregatorV3Interface) private tokenPriceFeeds;
    
    mapping(address => uint256) private tokenHeartbeatDurations;

    constructor(address[] memory tokenAddresses, address[] memory priceFeedAddresses, uint256[] memory heartbeatDurations) {
        require(tokenAddresses.length == priceFeedAddresses.length, "Arrays length mismatch");
        require(tokenAddresses.length == heartbeatDurations.length, "Arrays length mismatch");


        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            tokenPriceFeeds[tokenAddresses[i]] = AggregatorV3Interface(priceFeedAddresses[i]);
            tokenHeartbeatDurations[tokenAddresses[i]] = heartbeatDurations[i];
        }
    }

    function addPriceFeed(address tokenAddress, address priceFeedAddress, uint256 heartbeatDuration) public onlyOwner {
        require(priceFeedAddress != address(0), "Invalid address");
        require(address(tokenPriceFeeds[tokenAddress]) == address(0), "PriceFeed already exist");
        tokenPriceFeeds[tokenAddress] = AggregatorV3Interface(priceFeedAddress);
        tokenHeartbeatDurations[tokenAddress] = heartbeatDuration;

    }

    function removePriceFeed(address tokenAddress) public onlyOwner {
        require(address(tokenPriceFeeds[tokenAddress]) != address(0), "PriceFeed already exist");
        delete tokenPriceFeeds[tokenAddress];
        delete tokenHeartbeatDurations[tokenAddress];
    }

    function getTokenPrice(address tokenAddress) public view returns (uint256) {
        AggregatorV3Interface priceFeed = tokenPriceFeeds[tokenAddress];
        require(address(priceFeed) != address(0), "Price feed not found");

        (uint80 roundId, int256 answer, ,uint256 updatedAt  , ) = priceFeed.latestRoundData();

        require(roundId != 0 && answer >= 0 && updatedAt != 0, "PriceFeed: Sanity check");

        require(block.timestamp - updatedAt <= tokenHeartbeatDurations[tokenAddress], "Price feed is stale");
        
        // Token price might need additional scaling based on decimals
        return uint256(answer);
    }

    function decimals(address tokenAddress) public view returns (uint8) {
        AggregatorV3Interface priceFeed = tokenPriceFeeds[tokenAddress];
        require(address(priceFeed) != address(0), "Price feed not found");
        return priceFeed.decimals();
    }
}