// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/gmx/callback/IDepositCallbackReceiver.sol";
import "./libraries/gmx/callback/IWithdrawalCallbackReceiver.sol";
import "./libraries/gmx/callback/IOrderCallbackReceiver.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IVaultLocker.sol";
import "./interfaces/ICallbackContract.sol";
import "hardhat/console.sol";


contract GmxCallback is Ownable, IDepositCallbackReceiver, IWithdrawalCallbackReceiver, IOrderCallbackReceiver, ICallbackContract, IVaultLocker {
    struct Config {
        address vault;
        address gmxPlugin;
    }

    struct WithdrawalInfo {
        uint256 lpAmount;
        address receiver;
    }

    mapping(bytes32 => WithdrawalInfo) public withdrawalData;

    Config public config;

    bytes32[] public depositKeys;
    bytes32[] public withdrawalKeys;
    bytes32[] public orderKeys;

    address public depositHandler;
    address public withdrawalHandler;
    address public orderHandler;

    modifier onlyGmxPlugin() {
        require(msg.sender == config.gmxPlugin, "Invalid caller");
        _;
    }

    modifier onlyHandler(State stateOption) {
        address handler;
        if(stateOption == State.Deposit) {
            handler = depositHandler;
        } else if(stateOption == State.Withdrawal) {
            handler = withdrawalHandler;
        } else if( stateOption == State.Order) {
            handler = orderHandler;
        } else {
            revert("Invalid state");
        }
        require(msg.sender == handler, "Invalid caller");
        _;
    }

    constructor(address _vault, address _gmxPlugin) {
        config = Config({
            vault: _vault,
            gmxPlugin: _gmxPlugin
        });
    }

    function setConfig(address _vault, address _gmxPlugin) external onlyOwner {
        require(_vault != address(0) && _gmxPlugin != address(0), "Invalid address");

        config = Config({
            vault: _vault,
            gmxPlugin: _gmxPlugin
        });
    }

    function setHandler(address _depositHandler, address _withdrawalHandler, address _orderHandler) external onlyOwner {
        require(_depositHandler != address(0) && _withdrawalHandler != address(0) && _orderHandler != address(0), "Invalid address");

        depositHandler = _depositHandler;
        withdrawalHandler = _withdrawalHandler;
        orderHandler = _orderHandler;
    }

    function addKey(bytes32 key, State stateOption) external onlyGmxPlugin {
        if(stateOption == State.Deposit) {
            depositKeys.push(key);
        } else if(stateOption == State.Withdrawal) {
            withdrawalKeys.push(key);
        } else if( stateOption == State.Order) {
            orderKeys.push(key);
        } else {
            revert("Invalid state");
        }
    }

    function addWithdrawalData(bytes32 withdrawalKey, uint256 lpAmount, address receiver) external onlyGmxPlugin {
        bool isExist = false;
        for(uint256 i = 0; i < withdrawalKeys.length; ++i) {
            if(withdrawalKeys[i] == withdrawalKey) {
                isExist = true;
            }
        }
        require(isExist, "Invalid withdrawal key");
        withdrawalData[withdrawalKey] = WithdrawalInfo({
            lpAmount: lpAmount,
            receiver: receiver
        });
    }

    function getKeys(State stateOption) public view returns(bytes32[] memory) {
        if(stateOption == State.Deposit) {
            return depositKeys;
        } else if(stateOption == State.Withdrawal) {
            return withdrawalKeys;
        } else if( stateOption == State.Order) {
            return orderKeys;
        } else {
            revert("Invalid state");
        }
    }

    function removeKey(bytes32 key, State stateOption) internal {
        bytes32[] storage targetArray;

        if (stateOption == State.Deposit) {
            targetArray = depositKeys;
        } else if (stateOption == State.Withdrawal) {
            targetArray = withdrawalKeys;
        } else if (stateOption == State.Order) {
            targetArray = orderKeys;
        } else {
            revert("Invalid state");
        }

        uint256 length = targetArray.length;
        for (uint256 i = 0; i < length; i++) {
            if (targetArray[i] == key) {
                // Found the element, now remove it
                if (i < length - 1) {
                    // Move the last element to the position of the element to be removed
                    targetArray[i] = targetArray[length - 1];
                }
                // Remove the last element (which is now a duplicate or the original element)
                targetArray.pop();

                // You may choose to break here if you want to remove only the first occurrence
                break;
            }
        }
    }

    function getLockerStatus() public view returns (bool) {
        return depositKeys.length == 0 && withdrawalKeys.length == 0 && orderKeys.length == 0;
    }


    function afterDepositExecution(bytes32 key, Deposit.Props memory deposit, EventUtils.EventLogData memory eventData) external onlyHandler(State.Deposit) {
        removeKey(key, State.Deposit);
    }

    function afterDepositCancellation(bytes32 key, Deposit.Props memory deposit, EventUtils.EventLogData memory eventData) external onlyHandler(State.Deposit) {
        removeKey(key, State.Deposit);
    }

    function afterWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal, EventUtils.EventLogData memory eventData) external onlyHandler(State.Withdrawal) {
        removeKey(key, State.Withdrawal);
        WithdrawalInfo memory info = withdrawalData[key];
        if(info.lpAmount != 0) {
            IVault(config.vault).burnLP(info.lpAmount);
        }
    }

    function afterWithdrawalCancellation(bytes32 key, Withdrawal.Props memory withdrawal, EventUtils.EventLogData memory eventData) external onlyHandler(State.Withdrawal) {
        removeKey(key, State.Withdrawal);
        WithdrawalInfo memory info = withdrawalData[key];
        if(info.lpAmount != 0 && info.receiver != address(0)) {
            IVault(config.vault).transferLP(info.receiver, info.lpAmount);
        }
    }

    function afterOrderExecution(bytes32 key, Order.Props memory order, EventUtils.EventLogData memory eventData) external onlyHandler(State.Order) {
        removeKey(key, State.Order);
    }

    function afterOrderCancellation(bytes32 key, Order.Props memory order, EventUtils.EventLogData memory eventData) external onlyHandler(State.Order) {
        removeKey(key, State.Order);
    }

    function afterOrderFrozen(bytes32 key, Order.Props memory order, EventUtils.EventLogData memory eventData) external onlyHandler(State.Order) {
        removeKey(key, State.Order);
    }
}