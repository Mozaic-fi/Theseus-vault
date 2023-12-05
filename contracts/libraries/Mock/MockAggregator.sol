// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract MockAggregator is AggregatorV3Interface {
    uint8 private _decimals;
    string private _description;
    uint256 private _version;
    int256 private _mockAnswer;
    uint80 private _mockRoundId;
    uint256 private _mockStartedAt;
    uint256 private _mockUpdatedAt;
    uint80 private _mockAnsweredInRound;

    constructor(
        uint8 decimals_,
        string memory description_,
        uint256 version_,
        int256 initialAnswer_,
        uint80 initialRoundId_,
        uint256 initialStartedAt_,
        uint256 initialUpdatedAt_,
        uint80 initialAnsweredInRound_
    ) {
        _decimals = decimals_;
        _description = description_;
        _version = version_;
        _mockAnswer = initialAnswer_;
        _mockRoundId = initialRoundId_;
        _mockStartedAt = initialStartedAt_;
        _mockUpdatedAt = initialUpdatedAt_;
        _mockAnsweredInRound = initialAnsweredInRound_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external view override returns (string memory) {
        return _description;
    }

    function version() external view override returns (uint256) {
        return _version;
    }

    function getRoundData(uint80 _roundId)
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = _mockRoundId;
        answer = _mockAnswer;
        startedAt = _mockStartedAt;
        updatedAt = _mockUpdatedAt;
        answeredInRound = _mockAnsweredInRound;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = _mockRoundId;
        answer = _mockAnswer;
        startedAt = _mockStartedAt;
        updatedAt = _mockUpdatedAt;
        answeredInRound = _mockAnsweredInRound;
    }

    // Function to update mock data for testing purposes
    function updateMockData(
        int256 newAnswer,
        uint80 newRoundId,
        uint256 newStartedAt,
        uint256 newUpdatedAt,
        uint80 newAnsweredInRound
    ) external {
        _mockAnswer = newAnswer;
        _mockRoundId = newRoundId;
        _mockStartedAt = newStartedAt;
        _mockUpdatedAt = newUpdatedAt;
        _mockAnsweredInRound = newAnsweredInRound;
    }
}
