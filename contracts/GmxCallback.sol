// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./libraries/gmx/callback/IDepositCallbackReceiver.sol";
import "./libraries/gmx/callback/IWithdrawalCallbackReceiver.sol";
import "./libraries/gmx/callback/IOrderCallbackReceiver.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IGMXPlugin.sol";
import "./interfaces/IVaultLocker.sol";
import "./interfaces/ICallbackContract.sol";
import "hardhat/console.sol";

/**
 * @title GmxCallback
 * @dev Contract handling callbacks for deposit, withdrawal, and order execution/cancellation.
 */
contract GmxCallback is Ownable, IDepositCallbackReceiver, IWithdrawalCallbackReceiver, IOrderCallbackReceiver, ICallbackContract, IVaultLocker {
    // Structure to hold the withdrawal information associated with a key
    struct WithdrawalInfo {
        uint256 lpAmount;
        address receiver;
    }

    // Configuration struct for the contract
    struct Config {
        address vault;
        address gmxPlugin;
    }

    // Mapping to store withdrawal data for each key
    mapping(bytes32 => WithdrawalInfo) public withdrawalData;

    // Configuration state
    Config public config;

    // Arrays to store keys for deposit, withdrawal, and order operations
    bytes32[] public depositKeys;
    bytes32[] public withdrawalKeys;
    bytes32[] public orderKeys;

    // Handlers for deposit, withdrawal, and order operations
    address public depositHandler;
    address public withdrawalHandler;
    address public orderHandler;

    // Modifier to restrict access to the GMX plugin only
    modifier onlyGmxPlugin() {
        require(msg.sender == config.gmxPlugin, "Invalid caller");
        _;
    }

    // Modifier to restrict access to specific handlers (deposit, withdrawal, order)
    modifier onlyHandler(State stateOption) {
        address handler;
        if (stateOption == State.Deposit) {
            handler = depositHandler;
        } else if (stateOption == State.Withdrawal) {
            handler = withdrawalHandler;
        } else if (stateOption == State.Order) {
            handler = orderHandler;
        } else {
            revert("Invalid state");
        }
        require(msg.sender == handler, "Invalid caller");
        _;
    }

    /**
     * @dev Constructor to initialize the contract with the vault and GMX plugin addresses.
     * @param _vault Address of the vault.
     * @param _gmxPlugin Address of the GMX plugin.
     */
    constructor(address _vault, address _gmxPlugin) {
        config = Config({
            vault: _vault,
            gmxPlugin: _gmxPlugin
        });
    }

    /**
     * @dev Updates the vault and GMX plugin addresses in the contract configuration.
     * @param _vault New address of the vault.
     * @param _gmxPlugin New address of the GMX plugin.
     */
    function setConfig(address _vault, address _gmxPlugin) external onlyOwner {
        require(_vault != address(0) && _gmxPlugin != address(0), "Invalid address");

        config = Config({
            vault: _vault,
            gmxPlugin: _gmxPlugin
        });
    }

    /**
     * @dev Updates the deposit, withdrawal, and order handlers in the contract.
     * @param _depositHandler Address of the deposit handler.
     * @param _withdrawalHandler Address of the withdrawal handler.
     * @param _orderHandler Address of the order handler.
     */
    function setHandler(address _depositHandler, address _withdrawalHandler, address _orderHandler) external onlyOwner {
        require(_depositHandler != address(0) && _withdrawalHandler != address(0) && _orderHandler != address(0), "Invalid address");

        depositHandler = _depositHandler;
        withdrawalHandler = _withdrawalHandler;
        orderHandler = _orderHandler;
    }

    /**
     * @dev Adds a key to the corresponding array based on the state option (Deposit, Withdrawal, Order).
     * @param key The key to be added.
     * @param stateOption The state option (Deposit, Withdrawal, Order).
     */
    function addKey(bytes32 key, State stateOption) external onlyGmxPlugin {
        if (stateOption == State.Deposit) {
            depositKeys.push(key);
        } else if (stateOption == State.Withdrawal) {
            withdrawalKeys.push(key);
        } else if (stateOption == State.Order) {
            orderKeys.push(key);
        } else {
            revert("Invalid state");
        }
    }

    /**
     * @dev Adds withdrawal data for a specific key.
     * @param withdrawalKey The key associated with the withdrawal data.
     * @param lpAmount The LP amount to be withdrawn.
     * @param receiver The address to receive the LP tokens.
     */
    function addWithdrawalData(bytes32 withdrawalKey, uint256 lpAmount, address receiver) external onlyGmxPlugin {
        bool isExist = false;
        for (uint256 i = 0; i < withdrawalKeys.length; ++i) {
            if (withdrawalKeys[i] == withdrawalKey) {
                isExist = true;
            }
        }
        require(isExist, "Invalid withdrawal key");
        withdrawalData[withdrawalKey] = WithdrawalInfo({
            lpAmount: lpAmount,
            receiver: receiver
        });
    }

    /**
     * @dev Retrieves an array of keys based on the state option (Deposit, Withdrawal, Order).
     * @param stateOption The state option (Deposit, Withdrawal, Order).
     * @return An array of keys associated with the specified state option.
     */
    function getKeys(State stateOption) public view returns (bytes32[] memory) {
        if (stateOption == State.Deposit) {
            return depositKeys;
        } else if (stateOption == State.Withdrawal) {
            return withdrawalKeys;
        } else if (stateOption == State.Order) {
            return orderKeys;
        } else {
            revert("Invalid state");
        }
    }

    /**
     * @dev Removes a key from the corresponding array based on the state option (Deposit, Withdrawal, Order).
     * @param key The key to be removed.
     * @param stateOption The state option (Deposit, Withdrawal, Order).
     */
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

    /**
     * @dev Checks whether the contract is locked (i.e., no active deposit, withdrawal, or order).
     * @return True if the contract is locked, false otherwise.
     */
    function getLockerStatus() public view returns (bool) {
        return depositKeys.length == 0 && withdrawalKeys.length == 0 && orderKeys.length == 0;
    }

    /**
     * @dev Handles actions after a deposit execution.
     * @param key The key associated with the deposit.
     * @param deposit The deposit details.
     * @param eventData Additional event data.
     */
    function afterDepositExecution(bytes32 key, Deposit.Props memory deposit, EventUtils.EventLogData memory eventData) external onlyHandler(State.Deposit) {
        removeKey(key, State.Deposit);
        IGMXPlugin(config.gmxPlugin).transferAllTokensToVault();
    }

    /**
     * @dev Handles actions after a deposit cancellation.
     * @param key The key associated with the deposit.
     * @param deposit The deposit details.
     * @param eventData Additional event data.
     */
    function afterDepositCancellation(bytes32 key, Deposit.Props memory deposit, EventUtils.EventLogData memory eventData) external onlyHandler(State.Deposit) {
        removeKey(key, State.Deposit);
        IGMXPlugin(config.gmxPlugin).transferAllTokensToVault();
    }

    /**
     * @dev Handles actions after a withdrawal execution.
     * @param key The key associated with the withdrawal.
     * @param withdrawal The withdrawal details.
     * @param eventData Additional event data.
     */
    function afterWithdrawalExecution(bytes32 key, Withdrawal.Props memory withdrawal, EventUtils.EventLogData memory eventData) external onlyHandler(State.Withdrawal) {
        removeKey(key, State.Withdrawal);
        WithdrawalInfo memory info = withdrawalData[key];
        if (info.lpAmount != 0) {
            IVault(config.vault).burnLP(info.lpAmount);
        }
        delete withdrawalData[key];
        IGMXPlugin(config.gmxPlugin).transferAllTokensToVault();
    }

    /**
     * @dev Handles actions after a withdrawal cancellation.
     * @param key The key associated with the withdrawal.
     * @param withdrawal The withdrawal details.
     * @param eventData Additional event data.
     */
    function afterWithdrawalCancellation(bytes32 key, Withdrawal.Props memory withdrawal, EventUtils.EventLogData memory eventData) external onlyHandler(State.Withdrawal) {
        removeKey(key, State.Withdrawal);
        WithdrawalInfo memory info = withdrawalData[key];
        if (info.lpAmount != 0 && info.receiver != address(0) && info.receiver != config.gmxPlugin) {
            IVault(config.vault).transferLP(info.receiver, info.lpAmount);
        }
        delete withdrawalData[key];
        IGMXPlugin(config.gmxPlugin).transferAllTokensToVault();
    }

    /**
     * @dev Handles actions after an order execution.
     * @param key The key associated with the order.
     * @param order The order details.
     * @param eventData Additional event data.
     */
    function afterOrderExecution(bytes32 key, Order.Props memory order, EventUtils.EventLogData memory eventData) external onlyHandler(State.Order) {
        removeKey(key, State.Order);
        IGMXPlugin(config.gmxPlugin).transferAllTokensToVault();
    }

    /**
     * @dev Handles actions after an order cancellation.
     * @param key The key associated with the order.
     * @param order The order details.
     * @param eventData Additional event data.
     */
    function afterOrderCancellation(bytes32 key, Order.Props memory order, EventUtils.EventLogData memory eventData) external onlyHandler(State.Order) {
        removeKey(key, State.Order);
        IGMXPlugin(config.gmxPlugin).transferAllTokensToVault();
    }

    /**
     * @dev Handles actions after an order is frozen.
     * @param key The key associated with the order.
     * @param order The order details.
     * @param eventData Additional event data.
     */
    function afterOrderFrozen(bytes32 key, Order.Props memory order, EventUtils.EventLogData memory eventData) external onlyHandler(State.Order) {
        IGMXPlugin(config.gmxPlugin).transferAllTokensToVault();
    }
}
