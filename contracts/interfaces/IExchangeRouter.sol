// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

interface IExchangeRouter {

    /**
     * @dev Receives and executes a batch of function calls on this contract.
     */
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
    
    struct CreateDepositParams {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address initialLongToken;
        address initialShortToken;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 minMarketTokens;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    struct CreateWithdrawalParams {
        address receiver;
        address callbackContract;
        address uiFeeReceiver;
        address market;
        address[] longTokenSwapPath;
        address[] shortTokenSwapPath;
        uint256 minLongTokenAmount;
        uint256 minShortTokenAmount;
        bool shouldUnwrapNativeToken;
        uint256 executionFee;
        uint256 callbackGasLimit;
    }

    // @dev Wraps the specified amount of native tokens into WNT then sends the WNT to the specified address
    function sendWnt(address receiver, uint256 amount) external payable;

    // @dev Sends the given amount of tokens to the given address
    function sendTokens(address token, address receiver, uint256 amount) external payable;

    function createDeposit(
        CreateDepositParams calldata params
    ) external payable returns (bytes32);

    function createWithdrawal(
        CreateWithdrawalParams calldata params
    ) external payable returns (bytes32);
}