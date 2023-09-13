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
        GetTotalAssetsMD,
        ClaimReward,
        SwapRemote
    }

    function execute(ActionType _actionType, bytes calldata _payload) external payable returns(bytes memory response);
    
    function getTotalLiquidity() external view returns (uint256);

    function getPoolNumber() external view returns(uint256);

    function getStakedAmount(uint8 _poolId) external view returns(uint256 _stakedAmount);
}
