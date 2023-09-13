// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

// Libraries
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IPlugin.sol";
import "./TokenPriceConsumer.sol";

contract Vault is Ownable, ERC20 {
    using SafeERC20 for IERC20;

    uint256 public constant MOZAIC_DECIMAL = 6;

    /* ========== STATE VARIABLES ========== */
    address public master;

    address payable public treasury;    

    address[] public acceptingTokens;

    mapping(address => bool) public tokenMap;
    
    struct Plugin {
        address pluginAddress;
        uint256 pluginId;
    }

    Plugin[] public plugins;
    
    mapping(uint256 => uint256) public pluginIdToIndex;

    address public tokenPriceConsumer;

    /* ========== EVENTS ========== */

    event AddToken(address _token);

    event RemoveToken(address _token);

    event AddPlugin(uint256 _pluginId, address _pluginAddress);

    event RemovePlugin(uint256 _pluginId);

    event Execute(uint8 _pluginId, IPlugin.ActionType _actionType, bytes _payload);

    event MasterUpdated(address _oldMaster, address _newMaster);

    event TokenPriceConsumerUpdated(address _oldTokenPriceConsumer, address _newTokenPriceConsumer);

    event SetTreasury(address payable treasury);

    /* ========== MODIFIERS ========== */

    modifier onlyMaster() {
        require(msg.sender == master, "Invalid caller");
        _;
    }

    /* ========== CONFIGURATION ========== */
    constructor(      
    ) ERC20("Arbitrum LPToken", "mozLP") {
    }

    function setMaster(address _newMaster) external onlyOwner {
        require(_newMaster != address (0), "Vault: Invalid Address");
        address _oldMaster = master;
        master = _newMaster;
        emit MasterUpdated(_oldMaster, _newMaster);
    }

    function setTokenPriceConsumer(address _tokenPriceConsumer) public onlyOwner {
        require(_tokenPriceConsumer != address(0), "Vault: Invalid Address");
        address _oldTokenPriceComsumer = tokenPriceConsumer;
        tokenPriceConsumer = _tokenPriceConsumer;
        emit TokenPriceConsumerUpdated(_oldTokenPriceComsumer, _tokenPriceConsumer);
    }

    function setTreasury(address payable _treasury) public onlyOwner {
        require(_treasury != address(0), "Controller: Invalid address");
        treasury = _treasury;
        emit SetTreasury(_treasury);
    }

    /// @notice Add the token address to the list of accepted token addresses.
    function addToken(address _token) external onlyOwner {
        if(tokenMap[_token] == false) {
            tokenMap[_token] = true;
            acceptingTokens.push(_token);
            emit AddToken(_token);
        } else {
            revert("Vault: Token already exists.");
        }
    }
    
    /// @notice Remove the token address from the list of accepted token addresses.
    function removeToken(address _token) external onlyOwner {
        if(tokenMap[_token] == true) {
            tokenMap[_token] = false;
            for(uint256 i = 0; i < acceptingTokens.length; ++i) {
                if(acceptingTokens[i] == _token) {
                    acceptingTokens[i] = acceptingTokens[acceptingTokens.length - 1];
                    acceptingTokens.pop();
                    emit RemoveToken(_token);
                    return;
                }
            }
        }
        revert("Vault: Non-accepted token.");
    }

    function addPlugin(uint256 _pluginId, address _pluginAddress) external onlyOwner {
        require(pluginIdToIndex[_pluginId] == 0, "Plugin with this ID already exists");
        
        plugins.push(Plugin(_pluginAddress, _pluginId));
        pluginIdToIndex[_pluginId] = plugins.length;

        emit AddPlugin(_pluginId, _pluginAddress);
    }
    
    function removePlugin(uint256 _pluginId) external onlyOwner {
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");
        
        uint256 pluginIndex = pluginIdToIndex[_pluginId] - 1;
        delete pluginIdToIndex[_pluginId];
        
        if (pluginIndex != plugins.length - 1) {
            // Move the last plugin in the array to the position of the removed plugin
            Plugin storage lastPlugin = plugins[plugins.length - 1];
            plugins[pluginIndex] = lastPlugin;
            pluginIdToIndex[lastPlugin.pluginId] = pluginIndex + 1;
        }
        
        plugins.pop();
        emit RemovePlugin(_pluginId);
    }

    /* ========== USER FUNCTIONS ========== */
    
    function deposit(address _tokenAddress, uint256 _amountLD) external {
        require(isAcceptingToken(_tokenAddress), "Vault: Invalid token");
        IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), _amountLD);
        uint256 amount = _amountLD * TokenPriceConsumer(tokenPriceConsumer).getTokenPrice(_tokenAddress);
        uint256 amountMLP = amount * totalSupply() / getTotalLiquidity();
        _mint(msg.sender, amountMLP);
    }

    function withdraw(uint256 _amountMLP) external {
        uint256 amountMD = convertMLPtoMD(_amountMLP);
        amountMD = 0;
        _burn(msg.sender, _amountMLP);

        uint256 amountUsdMD = convertMLPtoMD(_amountMLP);

        for(uint8 i; i < plugins.length; ++i) {
            if(amountUsdMD == 0) return;
            address plugin = plugins[i].pluginAddress;
            for(uint8 poolId; poolId < IPlugin(plugin).getPoolNumber(); ++ poolId) {
                uint256 stakedAmt = IPlugin(plugin).getStakedAmount(poolId);
                uint256 amount;
                if(stakedAmt >  amountUsdMD) {
                    stakedAmt = 0;
                    amount = amountUsdMD;
                } else {
                    amountUsdMD -= stakedAmt;
                    amount = stakedAmt;
                }
                bytes memory payload =  abi.encode(poolId, amount);
                IPlugin(plugin).execute(IPlugin.ActionType.Unstake, payload);
            }
        }
    }

    function execute(uint8 _pluginId, IPlugin.ActionType _actionType, bytes memory _payload) external onlyMaster {
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");
        address plugin = plugins[pluginIdToIndex[_pluginId] - 1].pluginAddress;
        
        if(_actionType == IPlugin.ActionType.Stake) {
            (, address[] memory _tokens, uint256[] memory _amounts) = abi.decode(_payload, (uint8, address[], uint256[]));
            require(_tokens.length == _amounts.length, "Valut: Lists must have the same length");
            for(uint256 i; i < _tokens.length; ++i) {
                IERC20(_tokens[i]).approve(plugin, _amounts[i]);
            }
        }
        IPlugin(plugin).execute(_actionType, _payload);
        emit Execute(_pluginId, _actionType, _payload);
    }

    /* ========== VIEW FUNCTIONS ========== */

    function getPluginsCount() external view returns (uint256) {
        return plugins.length;
    }
    
    function getPlugin(uint256 _pluginId) external view returns (address pluginAddress, uint256 pluginId) {
        require(pluginIdToIndex[_pluginId] != 0, "Plugin with this ID does not exist");
        
        Plugin memory plugin = plugins[pluginIdToIndex[_pluginId] - 1];
        return (plugin.pluginAddress, plugin.pluginId);
    }

    function getTotalLiquidity() public view returns(uint256 _totalLiquidity) {
        for(uint8 i; i < plugins.length; i++) {
            _totalLiquidity += IPlugin(plugins[i].pluginAddress).getTotalLiquidity();
        }
    }
    function isAcceptingToken(address _token) public view returns (bool) {
        return tokenMap[_token];
    }

    function getPlugins() public view returns(Plugin[] memory) {
        return plugins;
    }
    /* ========== CONVERT FUNCTIONS ========== */

    function convertLDtoMD(address _tokenAddress, uint256 _amountLD) public view returns(uint256) {
        uint256 decimals = IERC20Metadata(_tokenAddress).decimals();
        if(decimals > MOZAIC_DECIMAL) {
            return _amountLD / (10 ** (decimals - MOZAIC_DECIMAL));
        } else {
            return _amountLD * (10 ** (MOZAIC_DECIMAL - decimals));
        }
    }
    
    function convertMDtoLD(address _tokenAddress, uint256 _amountMD) public view returns(uint256) {
        uint256 decimals = IERC20Metadata(_tokenAddress).decimals();
        if(decimals > MOZAIC_DECIMAL) {
            return _amountMD * (10 ** (decimals - MOZAIC_DECIMAL));
        } else {
            return _amountMD / (10 ** (MOZAIC_DECIMAL - decimals));
        }
    }

    function convertMDtoMLP(uint256 _amountMD) public view returns(uint256) {
        return _amountMD * totalSupply() / getTotalLiquidity();
    }

    function convertMLPtoMD(uint256 _amountMLP) public view returns(uint256) {
        return _amountMLP * getTotalLiquidity() / totalSupply();
    }


    receive() external payable {}
    // Fallback function is called when msg.data is not empty
    fallback() external payable {}
    function getBalance() public view returns (uint) {
        return address(this).balance;
    }

    function withdrawFee(uint256 _amount) public onlyOwner {
        // get the amount of Ether stored in this contract
        uint amount = address(this).balance;
        require(amount >= _amount, "Vault: Invalid withdraw amount.");
        // send Ether to treasury
        // Treasury can receive Ether since the address of treasury is payable
        require(treasury != address(0), "Vault: Invalid treasury");
        (bool success, ) = treasury.call{value: _amount}("");
        require(success, "Vault: Failed to send Ether");
    }
}