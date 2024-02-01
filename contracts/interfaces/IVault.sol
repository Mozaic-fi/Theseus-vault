// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;


interface IVault {
    function burnLP(uint256 _lpAmount) external;
    function transferLP(address _account, uint256 _lpAmount) external;
}