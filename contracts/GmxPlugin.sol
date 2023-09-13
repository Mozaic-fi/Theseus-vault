// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.18;

// Libraries
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "./interfaces/IPlugin.sol";
import "./interfaces/IExchangeRouter.sol";
import "./interfaces/IDataStore.sol";

import "./TokenPriceConsumer.sol";

contract GmxPlugin is Ownable, IPlugin {
    using SafeERC20 for IERC20;

    address public localVault;
    address public depositVault;
    address public withdrawVault;
    address public exchangeRouter;
    address public router;

    struct PoolConfig {
        uint256 poolId;
        address longToken;
        address shortToken;
        address marketToken;
    }

    /* ========== STATE VARIABLES ========== */
    PoolConfig[] public pools;

    mapping(uint256 => bool) public poolExistsMap;

    address[] public uniqueTokens;

    address public tokenPriceConsumer; 

    /* ========== EVENTS ========== */
    event PoolAdded(uint256 poolId);

    event PoolRemoved(uint256 poolId);

    /* ========== MODIFIERS ========== */

    modifier onlyVault() {
        require(msg.sender == localVault, "Invalid caller");
        _;
    }

    /* ========== CONFIGURATION ========== */

    constructor(address _localVault) {
        require(_localVault != address(0), "GMX: Invalid Address");
        localVault = _localVault;
    }

    function setConfig(address _exchangeRouter, address _router, address _depositVault, address _withdrawVault) public onlyOwner {
        require(_exchangeRouter != address(0) && _router != address(0) && _depositVault != address(0) && _withdrawVault != address(0), "GMX: Invalid Address");
        exchangeRouter = _exchangeRouter;
        router = _router;
        depositVault = _depositVault;
        withdrawVault = _withdrawVault;
    }

    function setTokenPriceConsumer(address _tokenPriceConsumer) public onlyOwner {
        require(_tokenPriceConsumer != address(0), "GMX: Invalid Address");
        tokenPriceConsumer = _tokenPriceConsumer;
    }

    function addPool(uint256 _poolId, address _longToken, address _shortToken, address _marketToken) external onlyOwner {
        require(!poolExistsMap[_poolId], "GMX: Pool with this poolId already exists");

        // Create a new pool configuration and push it to the array
        PoolConfig memory newPool = PoolConfig(_poolId, _longToken, _shortToken, _marketToken);
        pools.push(newPool);
        
        // Mark the pool as existing
        poolExistsMap[_poolId] = true;
        
        if (!isTokenAdded(_longToken)) {
            uniqueTokens.push(_longToken);
        }
        if (!isTokenAdded(_shortToken)) {
            uniqueTokens.push(_shortToken);
        }

        emit PoolAdded(_poolId);
    }

    function removePool(uint256 _poolId) external onlyOwner {
        require(poolExistsMap[_poolId], "GMX: Pool with this poolId does not exist");

        // Find the index of the pool in the array
        uint256 indexToRemove = getPoolIndex(_poolId);

        // Swap the pool to remove with the last pool in the array
        // This avoids leaving gaps in the array
        uint256 lastIndex = pools.length - 1;
        if (indexToRemove != lastIndex) {
            pools[indexToRemove] = pools[lastIndex];
        }

        // Remove the last pool (which now contains the removed pool's data)
        pools.pop();

        // Mark the pool as no longer existing
        delete poolExistsMap[_poolId];

        // Update the unique tokens
        updateUniqueTokens();

        emit PoolRemoved(_poolId);
    }

    /* ========== PUBLIC FUNCTIONS ========== */
    function execute(ActionType _actionType, bytes calldata _payload) external payable returns(bytes memory response) {
        if(_actionType == ActionType.Stake) {
            stake(_payload);
        } else if(_actionType == ActionType.Unstake) {
            unstake(_payload);
        }
    }

    /* ========== VIEW FUNCTIONS ========== */
    function getTotalLiquidity() public view returns (uint256 total) {
        uint256 amount;
        for(uint256 i; i < uniqueTokens.length; ++i) {
            amount = IERC20(uniqueTokens[i]).balanceOf(address(this)) * TokenPriceConsumer(tokenPriceConsumer).getTokenPrice(uniqueTokens[i]);
            total += amount;
        }
        for(uint256 i; i < pools.length; ++i) {
            amount = IERC20(pools[i].marketToken).balanceOf(address(this)) * TokenPriceConsumer(tokenPriceConsumer).getTokenPrice(pools[i].marketToken);
            total += amount;
        }
    }

    function getStakedAmount(uint8 _poolId) public view returns(uint256 _stakedAmount) {
        PoolConfig memory pool = pools[_poolId];
        _stakedAmount = IERC20(pool.marketToken).balanceOf(address(this)) * TokenPriceConsumer(tokenPriceConsumer).getTokenPrice(pool.marketToken);
    }

    function getPoolNumber() public view returns(uint256) {
        return pools.length;
    }

    function getUniqueTokens() public view returns (address[] memory) {
        return uniqueTokens;
    }

    function getPools() public view returns(PoolConfig[] memory) {
        return pools;
    }

    /* ========== INTERNAL FUNCTIONS ========== */
    function stake(bytes calldata _payload) internal {
        // (uint8 _poolId , uint256 longTokenAmount, uint256 shortTokenAmount) = abi.decode(_payload, (uint8, uint256, uint256));
        (uint8 _poolId, address[] memory _tokens, uint256[] memory _amounts) = abi.decode(_payload, (uint8, address[], uint256[]));

        require(poolExistsMap[_poolId] = true, "GMX: Pool with this poolId does not exist");
        require(_tokens.length == 2 && _amounts.length == 2, "GMX: Array length must be 2");
        uint256 index = getPoolIndex(_poolId);
        PoolConfig memory pool = pools[index];
        require(pool.longToken == _tokens[0] && pool.shortToken == _tokens[1], "GMX: Invalid Pool tokens");
        
        IERC20(pool.longToken).safeTransferFrom(localVault, address(this), _amounts[0]);
        IERC20(pool.shortToken).safeTransferFrom(localVault, address(this), _amounts[1]);
        createDeposit(_poolId, _amounts[0], _amounts[1]);
    }

    function unstake(bytes calldata _payload) internal {
        (uint8 _poolId , uint256 marketAmount) = abi.decode(_payload, (uint8, uint256));
        createWithdrawal(_poolId, marketAmount);
    }

    // Internal function to get the index of a pool in the array by poolId
    function getPoolIndex(uint256 _poolId) public view returns (uint256) {
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i].poolId == _poolId) {
                return i;
            }
        }
        revert("GMX: Pool not found");
    }

    function isTokenAdded(address _token) internal view returns(bool) {
        for(uint256 i; i < uniqueTokens.length; ++i) {
            if(uniqueTokens[i] == _token) return true;
        }
        return false;
    }
    function tokenExistsInList(address _token) internal view returns (bool) {
        for (uint256 i = 0; i < pools.length; i++) {
            if (pools[i].longToken == _token || pools[i].shortToken == _token) {
                return true;
            }
        }
        return false;
    }

    function updateUniqueTokens() public {
        for (uint256 i = uniqueTokens.length; i > 0; i--) {
            if (!tokenExistsInList(uniqueTokens[i - 1])) {
                // Remove the token from uniqueTokens
                uniqueTokens[i - 1] = uniqueTokens[uniqueTokens.length - 1];
                uniqueTokens.pop();
            }
        }
    }

    function createDeposit(uint8 _poolId , uint256 _longTokenAmount, uint256 _shortTokenAmount) internal {
        PoolConfig memory pool = pools[getPoolIndex(_poolId)];
        IExchangeRouter _exchangeRouter = IExchangeRouter(exchangeRouter);
        
        address[] memory longTokenSwapPath;
        address[] memory shortTokenSwapPath;
        uint256 executionFee = 0;

        address longToken  = pool.longToken;
        address shortToken = pool.shortToken;
        address marketAddress = pool.marketToken;

        IExchangeRouter.CreateDepositParams memory params = IExchangeRouter.CreateDepositParams(
            address(this),    // receiver
            address(this),    // callbackContract
            address(this),    // uiFeeReceiver
            marketAddress,
            longToken,
            shortToken,
            longTokenSwapPath,
            shortTokenSwapPath,
            0,             // minMarketTokens
            true,         // shouldUnwrapNativeToken
            executionFee,
            200000            // callbackGasLimit
        );
      
        bytes[] memory multicallArgs = new bytes[](4);
        
        if(_longTokenAmount > 0) IERC20(longToken).approve(router, _longTokenAmount);
        if(_shortTokenAmount > 0) IERC20(shortToken).approve(router, _shortTokenAmount);

        multicallArgs[0] = abi.encodeWithSignature("sendWnt(address,uint256)", depositVault, executionFee);
        multicallArgs[1] = abi.encodeWithSignature("sendTokens(address,address,uint256)", longToken, depositVault, _longTokenAmount);
        multicallArgs[2] = abi.encodeWithSignature("sendTokens(address,address,uint256)", shortToken, depositVault, _shortTokenAmount);
        multicallArgs[3] = abi.encodeWithSignature("createDeposit((address,address,address,address,address,address,address[],address[],uint256,bool,uint256,uint256))", params);

        _exchangeRouter.multicall{value: executionFee}(multicallArgs);
    }

    function createWithdrawal(uint8 _poolId , uint256 marketAmount) internal {        
        PoolConfig memory pool = pools[getPoolIndex(_poolId)];
        IExchangeRouter _exchangeRouter = IExchangeRouter(exchangeRouter);

        address[] memory longTokenSwapPath;
        address[] memory shortTokenSwapPath;
        uint256 executionFee = 0;
        address marketAddress = pool.marketToken;

        IExchangeRouter.CreateWithdrawalParams memory params = IExchangeRouter.CreateWithdrawalParams(
            address(this), // receiver
            address(this),    // callbackContract
            address(this), // uiFeeReceiver
            marketAddress,
            longTokenSwapPath,
            shortTokenSwapPath,
            0,             // minLongTokens
            0,             // minShortTokens
            true,         // shouldUnwrapNativeToken
            executionFee,
            200000              // callbackGasLimit
        );
        IERC20(marketAddress).approve(router, marketAmount);
        bytes[] memory multicallArgs = new bytes[](3);

        multicallArgs[0] = abi.encodeWithSignature("sendWnt(address,uint256)", withdrawVault, executionFee);
        multicallArgs[1] = abi.encodeWithSignature("sendTokens(address,address,uint256)", marketAddress, withdrawVault, marketAmount);
        multicallArgs[2] = abi.encodeWithSignature("createWithdrawal((address,address,address,address,address[],address[],uint256,uint256,bool,uint256,uint256))", params);
        _exchangeRouter.multicall{value: executionFee}(multicallArgs);
    }

    receive() external payable {}
}