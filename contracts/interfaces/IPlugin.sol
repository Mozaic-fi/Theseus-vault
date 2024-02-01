// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

/**
 * @dev Interface of the Plugin standard.
 */
interface IPlugin {
    enum ActionType {
        // Action types
        Stake,
        Unstake,
        SwapTokens,
        ClaimRewards,
        CancelAction
    }

    function execute(ActionType _actionType, bytes calldata _payload) external payable;
    
    function getTotalLiquidity() external view returns (uint256);

    function getPoolNumber() external view returns(uint256);

    function getAllowedTokens(uint8 _poolId) external view returns (address[] memory tokens);

    function getPoolTokenPrice(uint8 _poolId, bool _maximize) external view returns (int256);

    function getPoolTokenInfo(uint8 _poolId) external view returns (address token, uint8 decimal, uint256 balance);
}
