// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

// Libraries
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';

import "./interfaces/IPlugin.sol";
import "./interfaces/IVaultLocker.sol";

import "./TokenPriceConsumer.sol";
import "hardhat/console.sol";

contract Vault is Ownable, ERC20, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    // Enum representing the status of the protocol.
    enum Status {
        Normal,   // Indicates normal operational status.
        Pending  // Indicates pending or transitional status.
    }

    // Struct defining the properties of a Plugin.
    struct Plugin {
        address pluginAddress;  // Address of the plugin contract.
        uint8 pluginId;       // Unique identifier for the plugin.
    }

    // Struct containing withdrawal information.
    struct WithdrawalInfo {
        address userAddress;     // Address of the user initiating the withdrawal.
        address tokenAddress;    // Address of the token being withdrawn.
        uint256 lpAmount;        // Amount of LP (Liquidity Provider) tokens to be withdrawn.
    }

    // Constant representing the number of decimals for the MOZAIC token.
    uint256 public constant MOZAIC_DECIMALS = 6;

    // Constant representing the number of decimals for the ASSET.
    uint256 public constant ASSET_DECIMALS = 36;

    /* ========== STATE VARIABLES ========== */
    // Stores the address of the master contract.
    address public master;

    // Stores the address of the treasury, which is payable for receiving funds.
    address payable public treasury;

    // Stores the address of the token price consumer contract.
    address public tokenPriceConsumer;

    // Maps plugin IDs to their respective index.
    mapping(uint8 => uint256) public pluginIdToIndex;

    // An array to store instances of the Plugin struct.
    Plugin[] public plugins;

    // Maps token addresses to boolean values indicating whether the token is accepted.
    mapping(address => bool) public acceptedTokenMap;

    // An array of accepted token addresses.
    address[] public acceptedTokens;

    // Maps token addresses to boolean values indicating whether deposits are allowed for the token.
    mapping(address => bool) public depositAllowedTokenMap;

    // An array of token addresses for which deposits are allowed.
    address[] public depositAllowedTokens;

    // Stores the ID of the currently selected plugin.
    uint8 public selectedPluginId;

    // Stores the ID of the currently selected pool.
    uint8 public selectedPoolId;

    address[] public vaultLockers;

    address[] public vaultManagers;

    uint256 public lpRate = 1e18;
    uint256 public protocolFeePercentage;
    uint256 public protocolFeeInVault;

    uint256 public depositMinExecFee;
    uint256 public withdrawMinExecFee;

    uint256 public constant BP_DENOMINATOR = 1e4;
    uint256 public constant MAX_FEE = 1e3;

    /* ========== EVENTS ========== */
    event AddPlugin(uint8 _pluginId, address _pluginAddress);
    event RemovePlugin(uint8 _pluginId);
    event Execute(uint8 _pluginId, IPlugin.ActionType _actionType, bytes _payload);
    event MasterUpdated(address _oldMaster, address _newMaster);
    event TokenPriceConsumerUpdated(address _oldTokenPriceConsumer, address _newTokenPriceConsumer);
    event SetTreasury(address payable treasury);
    event SetProtocolFeePercentage(uint256 _protocolFeePercentage);
    event SetExecutionFee(uint256 _depositMinExecFee, uint256 _withdrawMinExecFee);

    event AddAcceptedToken(address _token);
    event RemoveAcceptedToken(address _token);
    event AddDepositAllowedToken(address _token);
    event RemoveDepositAllowedToken(address _token);

    event AddDepositRequest(address _token, uint256 _amount);
    event AddWithdrawRequest(WithdrawalInfo _info);
    event SelectPluginAndPool(uint8 _pluginId, uint8 _poolId);
    event ApproveTokens(uint8 _pluginId, address[] _tokens, uint256[] _amounts);

    event WithdrawProtocolFee(address _token, uint256 _amount);

    /* ========== MODIFIERS ========== */
    // Modifier allowing only the master contract to execute the function.
    modifier onlyMaster() {
        require(msg.sender == master, "Vault: caller must be master");
        _;
    }

    // Modifier allowing only the master contract or the vault itself to execute the function.
    modifier onlyMasterOrSelf() {
        require(msg.sender == master || msg.sender == address(this), "Vault: caller must be master or self");
        _;
    }

    modifier onlyVaultLockers() {
        bool isVaultLocker = false;
        for(uint256 i  = 0; i < vaultLockers.length; i++) {
            if(vaultLockers[i] == msg.sender) {
                isVaultLocker = true;
                break;
            }
        }
        require(isVaultLocker, "Vault: Invalid vault locker");
        _;
    }

    modifier onlyVaultManagers() {
        bool isVaultManager = false;
        for(uint256 i  = 0; i < vaultManagers.length; i++) {
            if(vaultManagers[i] == msg.sender) {
                isVaultManager = true;
                break;
            }
        }
        require(isVaultManager, "Vault: Invalid vault Manger");
        _;
    }

    /* ========== CONFIGURATION ========== */
    // Constructor for the Arbitrum LPToken contract, inheriting from ERC20.
    constructor() ERC20("Arbitrum LPToken", "mozLP") {
    }

    // Allows the owner to set a new master address for the Vault.
    function setMaster(address _newMaster) external onlyOwner {
        // Ensure that the new master address is valid.
        require(_newMaster != address(0), "Vault: Invalid Address");

        // Store the current master address before updating.
        address _oldMaster = master;

        // Update the master address to the new value.
        master = _newMaster;

        // Emit an event to log the master address update.
        emit MasterUpdated(_oldMaster, _newMaster);
    }

    // Allows the owner to set the address of the token price consumer contract.
    function setTokenPriceConsumer(address _tokenPriceConsumer) public onlyOwner {
        // Ensure that the new token price consumer address is valid.
        require(_tokenPriceConsumer != address(0), "Vault: Invalid Address");

        // Store the current token price consumer address before updating.
        address _oldTokenPriceConsumer = tokenPriceConsumer;

        // Update the token price consumer address to the new value.
        tokenPriceConsumer = _tokenPriceConsumer;

        // Emit an event to log the token price consumer address update.
        emit TokenPriceConsumerUpdated(_oldTokenPriceConsumer, _tokenPriceConsumer);
    }

    // Allows the owner to set the address of the treasury.
    function setTreasury(address payable _treasury) public onlyOwner {
        // Ensure that the new treasury address is valid.
        require(_treasury != address(0), "Vault: Invalid address");

        // Update the treasury address to the new value.
        treasury = _treasury;

        // Emit an event to log the treasury address update.
        emit SetTreasury(_treasury);
    }

    // Allows the master contract to select a plugin and pool.
    function selectPluginAndPool(uint8 _pluginId, uint8 _poolId) onlyMaster public {
        // Ensure that both the pluginId and poolId are valid and not zero.
        require(_pluginId != 0 && _poolId != 0, "Vault: Invalid pluginId or poolId");

        // Set the selectedPluginId and selectedPoolId to the provided values.
        selectedPluginId = _pluginId;
        selectedPoolId = _poolId;
        emit SelectPluginAndPool(_pluginId, _poolId);
    }

    function setExecutionFee(uint256 _depositMinExecFee, uint256 _withdrawMinExecFee) onlyMaster public {
        depositMinExecFee = _depositMinExecFee;
        withdrawMinExecFee = _withdrawMinExecFee;
        emit SetExecutionFee(_depositMinExecFee, _withdrawMinExecFee);
    }

    // Allows the owner to add a new accepted token.
    function addAcceptedToken(address _token) external onlyOwner {
        // Check if the token does not already exist in the accepted tokens mapping.
        if (acceptedTokenMap[_token] == false) {
            // Set the token as accepted, add it to the acceptedTokens array, and emit an event.
            acceptedTokenMap[_token] = true;
            acceptedTokens.push(_token);
            emit AddAcceptedToken(_token);
        } else {
            // Revert if the token already exists in the accepted tokens.
            revert("Vault: Token already exists.");
        }
    }

    // Allows the owner to remove an accepted token.
    function removeAcceptedToken(address _token) external onlyOwner {
        // Check if the token exists in the accepted tokens mapping.
        if (acceptedTokenMap[_token] == true) {
            // Set the token as not accepted, remove it from the acceptedTokens array, and emit an event.
            acceptedTokenMap[_token] = false;
            for (uint256 i = 0; i < acceptedTokens.length; ++i) {
                if (acceptedTokens[i] == _token) {
                    acceptedTokens[i] = acceptedTokens[acceptedTokens.length - 1];
                    acceptedTokens.pop();
                    emit RemoveAcceptedToken(_token);
                    return;
                }
            }
        }
        // Revert if the token does not exist in the accepted tokens.
        revert("Vault: Non-accepted token.");
    }

    // Allows the owner to add a new deposit allowed token.
    function addDepositAllowedToken(address _token) external onlyOwner {
        // Check if the token does not already exist in the deposit allowed tokens mapping.
        if (depositAllowedTokenMap[_token] == false) {
            // Set the token as allowed for deposit, add it to the depositAllowedTokens array, and emit an event.
            depositAllowedTokenMap[_token] = true;
            depositAllowedTokens.push(_token);
            emit AddDepositAllowedToken(_token);
        } else {
            // Revert if the token already exists in the deposit allowed tokens.
            revert("Vault: Token already exists.");
        }
    }

    // Allows the owner to remove a deposit allowed token.
    function removeDepositAllowedToken(address _token) external onlyOwner {
        // Check if the token exists in the deposit allowed tokens mapping.
        if (depositAllowedTokenMap[_token] == true) {
            // Set the token as not allowed for deposit, remove it from the depositAllowedTokens array, and emit an event.
            depositAllowedTokenMap[_token] = false;
            for (uint256 i = 0; i < depositAllowedTokens.length; ++i) {
                if (depositAllowedTokens[i] == _token) {
                    depositAllowedTokens[i] = depositAllowedTokens[depositAllowedTokens.length - 1];
                    depositAllowedTokens.pop();
                    emit RemoveDepositAllowedToken(_token);
                    return;
                }
            }
        }
        // Revert if the token does not exist in the deposit allowed tokens.
        revert("Vault: Non-deposit allowed token.");
    }

    // Allows the owner to add a new plugin to the vault.
    function addPlugin(uint8 _pluginId, address _pluginAddress) external onlyOwner {
        // Ensure that the pluginId is not zero and does not already exist.
        require(_pluginId != 0, "Vault: PluginId cannot be zero");
        require(pluginIdToIndex[_pluginId] == 0, "Plugin with this ID already exists");

        // Create a new Plugin instance and add it to the plugins array.
        plugins.push(Plugin(_pluginAddress, _pluginId));
        
        // Update the mapping with the index of the added plugin.
        pluginIdToIndex[_pluginId] = plugins.length;

        // Emit an event to log the addition of a new plugin.
        emit AddPlugin(_pluginId, _pluginAddress);
    }

    // Allows the owner to remove a plugin from the vault.
    function removePlugin(uint8 _pluginId) external onlyOwner {
        // Ensure that the pluginId exists.
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");

        // Get the index of the plugin in the array.
        uint256 pluginIndex = pluginIdToIndex[_pluginId] - 1;
        
        // Delete the mapping entry for the removed plugin.
        delete pluginIdToIndex[_pluginId];

        if (pluginIndex != plugins.length - 1) {
            // If the removed plugin is not the last one, replace it with the last plugin in the array.
            Plugin memory lastPlugin = plugins[plugins.length - 1];
            plugins[pluginIndex] = lastPlugin;
            pluginIdToIndex[lastPlugin.pluginId] = pluginIndex + 1;
        }

        // Remove the last element from the array.
        plugins.pop();

        // Emit an event to log the removal of a plugin.
        emit RemovePlugin(_pluginId);
    }

    function setProtocolFeePercentage(uint256 _protocolFeePercentage) external onlyOwner {
        require(_protocolFeePercentage <= MAX_FEE, "Vault: protocol fee exceeds the max fee");
        protocolFeePercentage = _protocolFeePercentage;
        emit SetProtocolFeePercentage(_protocolFeePercentage);
    }

    function setVaultLockers(address[] memory _vaultLockers) external onlyOwner {
        vaultLockers = _vaultLockers;
    }

    function setVaultManagers(address[] memory _vaultManagers) external onlyOwner {
        vaultManagers = _vaultManagers;
    }

    /* ========== USER FUNCTIONS ========== */
    
    // Allows users to initiate a deposit request by converting tokens to LP tokens and staking them into the selected pool.
    function addDepositRequest(address _token, uint256 _tokenAmount) external payable nonReentrant {
        require(getVaultStatus() == true, "Vault: Vault is locked");

        require(msg.value >= depositMinExecFee, "Vault: Insufficient execution fee");

        // Ensure the deposited token is allowed for deposit in the vault.
        require(isDepositAllowedToken(_token), "Vault: Invalid token");
        
        // Ensure a valid and positive token amount is provided.
        require(_tokenAmount > 0, "Vault: Invalid token amount");

        // Calculate the USD value of the deposited tokens.
        uint256 amountUsd = calculateTokenValueInUsd(_token, _tokenAmount);

        require(amountUsd >= 10 ** (ASSET_DECIMALS - 2), "Invalid token amount");

        // Convert the USD value to the corresponding LP token amount.
        uint256 lpAmountToMint = convertAssetToLP(amountUsd);

        // Ensure that there is a sufficient LP amount to mint.
        require(lpAmountToMint > 0, "Vault: Insufficient amount");

        // Transfer the deposited tokens from the user to the vault.
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _tokenAmount);

        // Mint the calculated LP tokens and send them to the user.
        _mint(msg.sender, lpAmountToMint);

        // Emit an event to log the deposit request.
        emit AddDepositRequest(_token, _tokenAmount);

        // Stake the minted LP tokens to the selected pool.
        stakeToSelectedPool(_token, _tokenAmount);
    }


    // Internal function to stake a specified token amount to the selected pool using the configured plugin.
    function stakeToSelectedPool(address _token, uint256 _tokenAmount) internal {
        // Retrieve the list of allowed tokens for the selected plugin and pool.
        address[] memory allowedTokens = getTokensByPluginAndPoolId(selectedPluginId, selectedPoolId);

        // Iterate through the allowed tokens to find the matching token.
        for (uint256 i = 0; i < allowedTokens.length; i++) {
            if (allowedTokens[i] == _token) {
                // Create an array to represent token amounts, with the target token's amount set accordingly.
                uint256[] memory _amounts = new uint256[](allowedTokens.length);
                _amounts[i] = _tokenAmount;

                // Encode the payload for the 'Stake' action using the selected plugin and pool.
                bytes memory payload = abi.encode(uint8(selectedPoolId), allowedTokens, _amounts);

                // Execute the 'Stake' action on the selected plugin with the encoded payload.
                this.execute(uint8(selectedPluginId), IPlugin.ActionType.Stake, payload);
                return;
            }
        }
    }

    function addWithdrawalRequest(uint256 _lpAmount, uint8 _pluginId, uint8 _poolId, bytes memory payload) external payable {
        require(getVaultStatus() == true, "Vault: Vault is locked");

        require(msg.value >= withdrawMinExecFee, "Vault: Insufficient execution fee");

        // Ensure a valid and positive LP token amount is provided.
        require(_lpAmount > 0, "Vault: Invalid LP token amount");

        // Transfer the specified amount of LP tokens from the user to the contract.
        this.transferFrom(msg.sender, address(this), _lpAmount);

        // Convert LP tokens to USD value.
        uint256 usdAmountToWithdraw = convertLPToAsset(_lpAmount);

        (, uint8 poolTokenDecimals) = getPoolTokenInfo(_pluginId, _poolId);

        uint256 poolTokenPrice = getPoolTokenPrice(_pluginId, _poolId);
        
        uint256 poolTokenAmount = convertDecimals(usdAmountToWithdraw, 6, poolTokenDecimals) / poolTokenPrice;

        bytes memory _payload = abi.encode(_poolId, poolTokenAmount, _lpAmount, msg.sender, payload);
        
        this.execute(_pluginId, IPlugin.ActionType.Unstake, _payload);
    }

    function getPoolTokenPrice(uint8 _pluginId, uint8 _poolId) public view returns (uint256) {
        // Ensure that the specified plugin exists.
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");

        // Retrieve the plugin address based on the provided plugin ID.
        address plugin = plugins[pluginIdToIndex[_pluginId] - 1].pluginAddress;
        return uint256(IPlugin(plugin).getPoolTokenPrice(_poolId, true));
    }

    function getPoolTokenInfo(uint8 _pluginId, uint8 _poolId) public view returns (address _token, uint8 _decimals) {
        // Ensure that the specified plugin exists.
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");

        // Retrieve the plugin address based on the provided plugin ID.
        address plugin = plugins[pluginIdToIndex[_pluginId] - 1].pluginAddress;
        return IPlugin(plugin).getPoolTokenInfo(_poolId);
    }
    
    /* ========== MASTER FUNCTIONS ========== */
    
    // Allows the master contract or the vault itself to execute actions on a specified plugin.
    function execute(uint8 _pluginId, IPlugin.ActionType _actionType, bytes memory _payload) public onlyMasterOrSelf nonReentrant {
        // Ensure that the specified plugin exists.
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");

        // Retrieve the plugin address based on the provided plugin ID.
        address plugin = plugins[pluginIdToIndex[_pluginId] - 1].pluginAddress;

        // If the action type is 'Stake', approve tokens for staking according to the payload.
        if (_actionType == IPlugin.ActionType.Stake) {
            (, address[] memory _tokens, uint256[] memory _amounts, ) = abi.decode(_payload, (uint8, address[], uint256[], uint256));
            require(_tokens.length == _amounts.length, "Vault: Lists must have the same length");

            // Iterate through the tokens and approve them for staking.
            for (uint256 i; i < _tokens.length; ++i) {
                if (_amounts[i] > 0) {
                    IERC20(_tokens[i]).safeIncreaseAllowance(plugin, _amounts[i]);
                }
            }
        }

        // Execute the specified action on the plugin with the provided payload.
        IPlugin(plugin).execute(_actionType, _payload);

        // Emit an event to log the execution of the plugin action.
        emit Execute(_pluginId, _actionType, _payload);
    }

    // Allows the master contract to approve tokens for a specified plugin based on the provided payload.
    function approveTokens(uint8 _pluginId, bytes memory _payload) external onlyMaster nonReentrant {
        // Ensure that the specified plugin exists.
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");

        // Retrieve the plugin address based on the provided plugin ID.
        address plugin = plugins[pluginIdToIndex[_pluginId] - 1].pluginAddress;

        // Decode the payload to obtain the list of tokens and corresponding amounts to approve.
        (address[] memory _tokens, uint256[] memory _amounts) = abi.decode(_payload, (address[], uint256[]));
        require(_tokens.length == _amounts.length, "Vault: Lists must have the same length");

        // Iterate through the tokens and approve them for the plugin.
        for (uint256 i; i < _tokens.length; ++i) {
            IERC20(_tokens[i]).safeIncreaseAllowance(plugin, _amounts[i]);
        }
        emit ApproveTokens(_pluginId, _tokens, _amounts);
    }

    function updateLiquidityProviderRate() external onlyMaster nonReentrant {
        uint256 previousRate = lpRate;
        
        // Calculate current rate
        uint256 currentRate = getCurrentLiquidityProviderRate();
        
        // Check if the current rate is higher than the previous rate
        if (currentRate > previousRate) {
            // Calculate the change in rate and update total profit
            uint256 deltaRate = currentRate - previousRate;
            uint256 totalProfit = convertDecimals(deltaRate * totalSupply(), 18 + MOZAIC_DECIMALS, ASSET_DECIMALS);
            
            // Calculate protocol fee        
            uint256 protocolFee = totalProfit.mul(protocolFeePercentage).div(BP_DENOMINATOR);
            
            protocolFeeInVault += protocolFee;
            // Update the LP rates
            lpRate = getCurrentLiquidityProviderRate();
        } else {
            // Update the LP rates
            lpRate = currentRate;
        }
    }

    // Withdraws protocol fees stored in the vault for a specific token.
    function withdrawProtocolFee(address _token) external onlyMaster nonReentrant {
        require(isAcceptedToken(_token), "Vault: Invalid token");

        // Calculate the token amount from the protocol fee in the vault
        uint256 tokenAmount = calculateTokenAmountFromUsd(_token, protocolFeeInVault);

        // Get the token balance of this contract
        uint256 tokenBalance = IERC20(_token).balanceOf(address(this));

        // Determine the transfer amount, ensuring it doesn't exceed the token balance
        uint256 transferAmount = tokenBalance >= tokenAmount ? tokenAmount : tokenBalance;

        // Update the protocol fee in the vault after the withdrawal
        protocolFeeInVault = protocolFeeInVault.sub(protocolFeeInVault.mul(transferAmount).div(tokenAmount));

        // Safely transfer the tokens to the treasury address
        IERC20(_token).safeTransfer(treasury, transferAmount);

        // Emit an event to log the withdrawal
        emit WithdrawProtocolFee(_token, transferAmount);
    }

    function transferExecutionFee(uint8 _pluginId, uint256 _amount) external onlyMaster nonReentrant {
        Plugin memory plugin = getPlugin(_pluginId);
        require(_amount <= address(this).balance, "Vault: Insufficient balance");
        (bool success, ) = plugin.pluginAddress.call{value: _amount}("");
        require(success, "Vault: Failed to send Ether");
    } 

    /* ========== VIEW FUNCTIONS ========== */

    // Retrieve the array of plugins registered in the vault.
    function getPlugins() public view returns (Plugin[] memory) {
        return plugins;
    }

    // Retrieve the total count of registered plugins in the vault.
    function getPluginsCount() public view returns (uint256) {
        return plugins.length;
    }

    // Retrieve details about a specific plugin based on its unique identifier.
    function getPlugin(uint8 _pluginId) public view returns (Plugin memory) {
        // Ensure that the specified plugin exists.
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");

        // Retrieve and return details about the specified plugin.
        Plugin memory plugin = plugins[pluginIdToIndex[_pluginId] - 1];
        return plugin;
    }

    // Retrieves the current liquidity provider rate.
    function getCurrentLiquidityProviderRate() public view returns(uint256) {
        uint256 _totalAssets = totalAssetInUsd() > protocolFeeInVault ? totalAssetInUsd() - protocolFeeInVault: 0;
        
        // Variable to store the current rate
        uint256 currentRate;

         // Check if total supply or total assets is zero
        if (totalSupply() == 0 || _totalAssets <  10 ** ASSET_DECIMALS) {
            currentRate = 1e18;
        } else {
            // Convert total assets to the desired decimals
            uint256 adjustedAssets = convertDecimals(_totalAssets, ASSET_DECIMALS, MOZAIC_DECIMALS + 18);

            // Calculate the current rate
            currentRate = adjustedAssets / totalSupply();
        }
        return currentRate;
    }

    // Calculate the total value of assets held by the vault, including liquidity from registered plugins
    // and the USD value of accepted tokens held in the vault.
    function totalAssetInUsd() public view returns (uint256 _totalAsset) {
        // Iterate through registered plugins to calculate their total liquidity.
        for (uint8 i; i < plugins.length; ++i) {
            _totalAsset += IPlugin(plugins[i].pluginAddress).getTotalLiquidity();
        }

        // Iterate through accepted tokens to calculate their total USD value.
        for (uint256 i; i < acceptedTokens.length; ++i) {
            // Calculate the USD value of the token based on its balance in the vault.
            _totalAsset += calculateTokenValueInUsd(acceptedTokens[i], IERC20(acceptedTokens[i]).balanceOf(address(this)));
        }

        // Return the total calculated asset value.
        return _totalAsset;
    }

    // Check if a given token is accepted by the vault.
    function isAcceptedToken(address _token) public view returns (bool) {
        return acceptedTokenMap[_token];
    }

    // Check if a given token is allowed for deposit in the vault.
    function isDepositAllowedToken(address _token) public view returns (bool) {
        return depositAllowedTokenMap[_token];
    }

    function getAcceptedTokens() public view returns (address[] memory) {
        return acceptedTokens;
    }

    function getDepositAllowedTokens() public view returns (address[] memory) {
        return depositAllowedTokens;
    }

    // Retrieve the list of tokens allowed for a specific pool associated with a plugin.
    // Returns an array of token addresses based on the provided plugin and pool IDs.
    function getTokensByPluginAndPoolId(uint8 _pluginId, uint8 _poolId) public view returns (address[] memory) {
        // Initialize an array to store the allowed tokens for the specified pool.
        address[] memory poolAllowedTokens;

        // If the specified plugin does not exist, return an empty array.
        if (pluginIdToIndex[_pluginId] == 0) {
            return poolAllowedTokens;
        }

        // Retrieve the plugin information based on the provided plugin ID.
        Plugin memory plugin = plugins[pluginIdToIndex[_pluginId] - 1];

        // Retrieve the allowed tokens for the specified pool from the associated plugin.
        poolAllowedTokens = IPlugin(plugin.pluginAddress).getAllowedTokens(_poolId);

        // Return the array of allowed tokens for the specified pool.
        return poolAllowedTokens;
    }

    function getVaultStatus() public view returns (bool) {
        bool status = true;
        for(uint256 i = 0; i < vaultLockers.length; i++) {
            if(IVaultLocker(vaultLockers[i]).getLockerStatus() == false) {
                status = false;
                break;
            }
        }
        return status;
    }
    
    /* ========== HELPER FUNCTIONS ========== */

    // Calculate the USD value of a given token amount based on its price and decimals.
    function calculateTokenValueInUsd(address _tokenAddress, uint256 _tokenAmount) public view returns (uint256) {
        // Retrieve the token and price consumer decimals.
        uint256 tokenDecimals = IERC20Metadata(_tokenAddress).decimals();
        uint256 priceConsumerDecimals = TokenPriceConsumer(tokenPriceConsumer).decimals(_tokenAddress);

        // Retrieve the token price from the price consumer.
        uint256 tokenPrice = TokenPriceConsumer(tokenPriceConsumer).getTokenPrice(_tokenAddress);

        return convertDecimals(_tokenAmount * tokenPrice, tokenDecimals + priceConsumerDecimals, ASSET_DECIMALS);
    }

    // Calculate the token amount corresponding to a given USD value based on token price and decimals.
    function calculateTokenAmountFromUsd(address _tokenAddress, uint256 _tokenValueUsd) public view returns (uint256) {
        // Retrieve the token and price consumer decimals.
        uint256 tokenDecimals = IERC20Metadata(_tokenAddress).decimals();
        uint256 priceConsumerDecimals = TokenPriceConsumer(tokenPriceConsumer).decimals(_tokenAddress);

        // Convert the USD value to the desired ASSET_DECIMALS.
        uint256 normalizedValue = convertDecimals(_tokenValueUsd, ASSET_DECIMALS, tokenDecimals + priceConsumerDecimals);

        // Calculate the token amount based on the normalized value and token price.
        uint256 tokenAmount = normalizedValue / TokenPriceConsumer(tokenPriceConsumer).getTokenPrice(_tokenAddress);

        // Return the calculated token amount.
        return tokenAmount;
    }

    /* ========== CONVERT FUNCTIONS ========== */

    // Convert an amount from one decimal precision to another.
    function convertDecimals(uint256 _amount, uint256 _from, uint256 _to) public pure returns (uint256) {
        // If the source decimal precision is greater than or equal to the target, perform division.
        if (_from >= _to) {
            return _amount / 10 ** (_from - _to);
        } else {
            // If the target decimal precision is greater than the source, perform multiplication.
            return _amount * 10 ** (_to - _from);
        }
    }

    // Convert an asset amount to LP tokens based on the current total asset and total LP token supply.
    function convertAssetToLP(uint256 _amount) public view returns (uint256) {
        // If the total asset is zero, perform direct decimal conversion.
        uint256 _totalAssetInUsd = totalAssetInUsd() > protocolFeeInVault ?  totalAssetInUsd() - protocolFeeInVault : 0;
        if (_totalAssetInUsd == 0 || totalSupply() == 0) {
            return convertDecimals(_amount, ASSET_DECIMALS, MOZAIC_DECIMALS);
        }
        
        // Perform conversion based on the proportion of the provided amount to the total asset.
        return (_amount * totalSupply()) / _totalAssetInUsd;
    }

    // Convert LP tokens to an equivalent asset amount based on the current total asset and total LP token supply.
    function convertLPToAsset(uint256 _amount) public view returns (uint256) {
        uint256 _totalAssetInUsd = totalAssetInUsd() > protocolFeeInVault ?  totalAssetInUsd() - protocolFeeInVault : 0;

        // If the total LP token supply is zero, perform direct decimal conversion.
        if (totalSupply() == 0) {
            return convertDecimals(_amount, MOZAIC_DECIMALS, ASSET_DECIMALS);
        }
        // Perform conversion based on the proportion of the provided amount to the total LP token supply.
        return (_amount * _totalAssetInUsd) / totalSupply();
    }

    // Retrieve the decimal precision of the token (MOZAIC_DECIMALS).
    function decimals() public view virtual override returns (uint8) {
        return uint8(MOZAIC_DECIMALS);
    }

    function burnLP(uint256 _lpAmount) external onlyVaultManagers {
        _burn(address(this), _lpAmount);
    }
    
    function transferLP(address _account, uint256 _lpAmount) external onlyVaultManagers {
        transfer(_account, _lpAmount);
    }
    /* ========== TREASURY FUNCTIONS ========== */
    receive() external payable {}
    // Fallback function is called when msg.data is not empty
    fallback() external payable {}
    
    function getBalance() public view returns (uint) {
        return address(this).balance;
    }
} 