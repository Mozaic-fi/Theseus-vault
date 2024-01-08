// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

interface ICallbackContract {
    enum State { Deposit, Withdrawal, Order }

    function addKey(bytes32 key, State stateOption) external;

    function getKeys(State stateOption) external view returns(bytes32[] memory);

    function addWithdrawalData(bytes32 withdrawalKey, uint256 lpAmount, address receiver) external;
}