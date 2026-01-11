// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// 导入 Treasury 相关接口（与主项目保持一致）
interface ITreasuryConfigCore {
    function getTokenAddress(string memory tokenKey) external view returns (address);
    function getTokenKey(address tokenAddress) external view returns (string memory);
    function getAddressConfig(string memory key) external view returns (address);
    function getStringConfig(string memory key) external view returns (string memory);
}

interface ILendingDelegate {
    function supply(
        string calldata tokenKey,
        uint256 amount,
        address onBehalfOf,
        address lendingTarget,
        address configAddr,
        address yieldTokenHint
    ) external returns (uint256 shares);
    
    function getYieldTokenAddress(
        string calldata tokenKey,
        address lendingTarget,
        address configAddr
    ) external view returns (address yieldToken);
    
    function estimateRedeemAmount(
        string calldata tokenKey,
        uint256 yieldTokenAmount,
        address lendingTarget,
        address configAddr
    ) external view returns (uint256 underlyingAmount);
}

/**
 * @title DepositVault
 * @dev Pull模式的凭证代币托管合约
 * @notice 地址A存入借贷池后，凭证代币托管在合约中，地址B可以自取
 *         如果地址B输入错误或没来取，地址A可以取回
 * 
 * 工作流程:
 * 1. 地址A调用 deposit() -> 存入借贷池，获得凭证代币，托管在合约中
 * 2. 地址B调用 claim() -> 领取凭证代币
 * 3. 如果地址B没来取，地址A在时间锁后调用 recover() -> 取回凭证代币
 * 
 * 多链支持:
 * - 使用 TreasuryConfigCore 来获取不同链的借贷配置
 * - 使用 ILendingDelegate 适配器来处理不同链的借贷协议（AAVE V3, JustLend等）
 */
contract DepositVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // 配置合约地址（用于获取代币地址和借贷配置）
    ITreasuryConfigCore public configCore;
    
    // 存款记录：depositor => depositId => DepositInfo
    mapping(address => mapping(uint256 => DepositInfo)) public deposits;
    mapping(address => uint256) public depositCount;
    
    // 可领取存款索引：recipient => depositor => depositId[]
    // 用于快速查询某个接收地址可以领取的所有存款
    mapping(address => mapping(address => uint256[])) public claimableDeposits;
    mapping(address => mapping(address => uint256)) public claimableDepositCount;
    
    // 反向索引：recipient => (depositor, depositId)[]，用于直接查询某个接收地址的所有存款
    struct ClaimableDeposit {
        address depositor;
        uint256 depositId;
    }
    mapping(address => ClaimableDeposit[]) public recipientDeposits;
    mapping(address => uint256) public recipientDepositCount;
    
    // 可选：地址B白名单（如果启用）
    mapping(address => bool) public validRecipients;
    bool public whitelistEnabled;
    
    // 可选：取回时间锁（默认7天）
    uint256 public recoveryDelay = 7 days;
    
    struct DepositInfo {
        address token;              // 底层代币地址
        address yieldToken;         // 凭证代币地址
        uint256 yieldAmount;        // 凭证代币数量
        address intendedRecipient;  // 预期的接收地址B（仅用于记录）
        uint256 depositTime;        // 存款时间
        bool claimed;               // 是否已被地址B领取
        bool recovered;            // 是否已被地址A取回
    }
    
    event Deposited(
        address indexed depositor,
        uint256 indexed depositId,
        address indexed token,
        uint256 amount,
        address yieldToken,
        uint256 yieldAmount,
        address intendedRecipient
    );
    
    event Claimed(
        address indexed depositor,
        uint256 indexed depositId,
        address indexed recipient,
        address yieldToken,
        uint256 amount
    );
    
    event Recovered(
        address indexed depositor,
        uint256 indexed depositId,
        address yieldToken,
        uint256 amount
    );
    
    event WhitelistUpdated(address indexed recipient, bool valid);
    event RecoveryDelayUpdated(uint256 newDelay);
    event LendingDelegateUpdated(address indexed newDelegate);
    event ConfigCoreUpdated(address indexed newConfigCore);
    
    error InvalidAddress();
    error InvalidAmount();
    error DepositNotFound();
    error AlreadyClaimed();
    error AlreadyRecovered();
    error RecoveryNotAvailable();
    error RecipientNotWhitelisted();
    error InvalidRecipient(); // 不是预期的接收地址
    error YieldTokenNotFound();
    error NoYieldTokenReceived();
    error SupplyFailed();
    
    constructor(
        address _configCore,
        address _initialOwner
    ) {
        if (_configCore == address(0)) revert InvalidAddress();
        if (_initialOwner == address(0)) revert InvalidAddress();
        
        configCore = ITreasuryConfigCore(_configCore);
        
        _transferOwnership(_initialOwner);
    }
    
    /**
     * @dev 地址A存入借贷池，凭证代币托管在合约中
     * @param token 底层代币地址
     * @param amount 存入金额
     * @param intendedRecipient 预期的接收地址B（可选，可以为 address(0)）
     * @return depositId 存款ID
     */
    function deposit(
        address token,
        uint256 amount,
        address intendedRecipient
    ) external nonReentrant returns (uint256 depositId) {
        if (token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        
        // 1. 获取 tokenKey
        string memory tokenKey = configCore.getTokenKey(token);
        if (bytes(tokenKey).length == 0) revert InvalidAddress();
        
        // 2. 解析借贷配置（从 configCore 获取）
        (address delegate, address lendingTarget) = _resolveLendingConfig(tokenKey);
        if (delegate == address(0) || lendingTarget == address(0)) {
            revert InvalidAddress();
        }
        
        // 3. 获取 yield token 地址
        address yieldToken = ILendingDelegate(delegate).getYieldTokenAddress(
            tokenKey,
            lendingTarget,
            address(configCore)
        );
        if (yieldToken == address(0)) revert YieldTokenNotFound();
        
        // 4. 接收代币
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // 5. 记录存入前的 yield token 余额
        uint256 yieldBefore = IERC20(yieldToken).balanceOf(address(this));
        
        // 6. 批准借贷池（使用 forceApprove 以处理非零 allowance 的情况）
        IERC20(token).forceApprove(lendingTarget, amount);
        
        // 7. 通过适配器存入借贷池（使用 delegatecall）
        address configCoreAddr = address(configCore);
        (bool success, bytes memory result) = delegate.delegatecall(
            abi.encodeWithSelector(
                ILendingDelegate.supply.selector,
                tokenKey,
                amount,
                address(this), // onBehalfOf = DepositVault
                lendingTarget,
                configCoreAddr,
                address(0) // yield token = 0 means auto-resolve
            )
        );
        
        if (!success) revert SupplyFailed();
        
        // 8. 获取存入后的 yield token 余额
        uint256 yieldAfter = IERC20(yieldToken).balanceOf(address(this));
        uint256 yieldAmount = yieldAfter - yieldBefore;
        if (yieldAmount == 0) revert NoYieldTokenReceived();
        
        // 9. 记录存款信息
        depositId = depositCount[msg.sender]++;
        deposits[msg.sender][depositId] = DepositInfo({
            token: token,
            yieldToken: yieldToken,
            yieldAmount: yieldAmount,
            intendedRecipient: intendedRecipient,
            depositTime: block.timestamp,
            claimed: false,
            recovered: false
        });
        
        // 10. 如果指定了接收地址，添加到可领取索引
        if (intendedRecipient != address(0)) {
            claimableDeposits[intendedRecipient][msg.sender].push(depositId);
            claimableDepositCount[intendedRecipient][msg.sender]++;
            // 同时添加到反向索引
            recipientDeposits[intendedRecipient].push(ClaimableDeposit({
                depositor: msg.sender,
                depositId: depositId
            }));
            recipientDepositCount[intendedRecipient]++;
        }
        
        emit Deposited(
            msg.sender,
            depositId,
            token,
            amount,
            yieldToken,
            yieldAmount,
            intendedRecipient
        );
    }
    
    /**
     * @dev 地址B自取凭证代币（Pull模式）
     * @param depositor 地址A（源地址）
     * @param depositId 存款ID
     * @notice 只能领取 intendedRecipient 指向自己的存款
     * @notice 前端通过 getClaimableDeposits(msg.sender) 查询可领取的存款列表，然后调用此函数领取
     */
    function claim(address depositor, uint256 depositId) external nonReentrant {
        address recipient = msg.sender;
        
        DepositInfo storage depositInfo = deposits[depositor][depositId];
        
        // 验证存款是否存在
        if (depositInfo.yieldAmount == 0) revert DepositNotFound();
        
        // 验证：不能重复领取
        if (depositInfo.claimed) revert AlreadyClaimed();
        
        // 验证：不能领取已取回的存款
        if (depositInfo.recovered) revert AlreadyRecovered();
        
        // 验证：只有 intendedRecipient 指向自己的才能领取
        if (depositInfo.intendedRecipient != recipient) {
            revert InvalidRecipient(); // 不是预期的接收地址
        }
        
        // 可选：验证白名单（如果启用）
        if (whitelistEnabled) {
            if (!validRecipients[recipient]) revert RecipientNotWhitelisted();
        }
        
        // 转账凭证代币给地址B
        IERC20(depositInfo.yieldToken).safeTransfer(recipient, depositInfo.yieldAmount);
        
        depositInfo.claimed = true;
        
        emit Claimed(
            depositor,
            depositId,
            recipient,
            depositInfo.yieldToken,
            depositInfo.yieldAmount
        );
    }
    
    /**
     * @dev 地址A取回凭证代币（如果地址B输入错误或没来取）
     * @param depositId 存款ID
     */
    function recover(uint256 depositId) external nonReentrant {
        DepositInfo storage depositInfo = deposits[msg.sender][depositId];
        if (depositInfo.yieldAmount == 0) revert DepositNotFound();
        if (depositInfo.claimed) revert AlreadyClaimed();
        if (depositInfo.recovered) revert AlreadyRecovered();
        
        // 时间锁检查
        if (block.timestamp < depositInfo.depositTime + recoveryDelay) {
            revert RecoveryNotAvailable();
        }
        
        // 转账凭证代币回地址A
        IERC20(depositInfo.yieldToken).safeTransfer(msg.sender, depositInfo.yieldAmount);
        
        depositInfo.recovered = true;
        
        emit Recovered(
            msg.sender,
            depositId,
            depositInfo.yieldToken,
            depositInfo.yieldAmount
        );
    }
    
    /**
     * @dev 查询存款信息
     */
    function getDeposit(address depositor, uint256 depositId)
        external
        view
        returns (DepositInfo memory)
    {
        return deposits[depositor][depositId];
    }
    
    /**
     * @dev 查询地址A的所有存款ID
     */
    function getDepositIds(address depositor) external view returns (uint256[] memory) {
        uint256 count = depositCount[depositor];
        uint256[] memory ids = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            ids[i] = i;
        }
        return ids;
    }
    
    /**
     * @dev 查询地址A的存款数量
     */
    function getDepositCount(address depositor) external view returns (uint256) {
        return depositCount[depositor];
    }
    
    /**
     * @dev 查询接收地址可以领取的所有存款ID（按存款人分组）
     * @param recipient 接收地址（中转地址）
     * @param depositor 存款人地址（源地址），如果为 address(0) 则返回所有存款人的
     * @return depositIds 存款ID数组
     */
    function getClaimableDepositIds(address recipient, address depositor)
        external
        view
        returns (uint256[] memory)
    {
        if (depositor == address(0)) {
            // 如果 depositor 为 0，需要遍历所有存款人（这个操作可能很昂贵）
            // 暂时返回空数组，建议前端通过事件查询
            return new uint256[](0);
        }
        return claimableDeposits[recipient][depositor];
    }
    
    /**
     * @dev 查询接收地址可以领取的存款数量（按存款人分组）
     * @param recipient 接收地址（中转地址）
     * @param depositor 存款人地址（源地址）
     * @return count 可领取的存款数量
     */
    function getClaimableDepositCount(address recipient, address depositor)
        external
        view
        returns (uint256)
    {
        return claimableDepositCount[recipient][depositor];
    }
    
    /**
     * @dev 查询接收地址可以领取的所有存款（包括所有存款人）
     * @param recipient 接收地址（中转地址）
     * @return depositors 存款人地址数组
     * @return depositIds 存款ID数组（对应 depositors）
     * @notice 返回所有未领取、未取回、且 intendedRecipient 指向 recipient 的存款
     */
    function getClaimableDeposits(address recipient)
        external
        view
        returns (
            address[] memory depositors,
            uint256[] memory depositIds
        )
    {
        uint256 count = recipientDepositCount[recipient];
        if (count == 0) {
            return (new address[](0), new uint256[](0));
        }
        
        ClaimableDeposit[] memory allDeposits = recipientDeposits[recipient];
        
        // 先计算可领取的数量（必须满足：未领取、未取回、且 intendedRecipient 指向 recipient）
        uint256 claimableCount = 0;
        for (uint256 i = 0; i < count; i++) {
            DepositInfo memory info = deposits[allDeposits[i].depositor][allDeposits[i].depositId];
            if (!info.claimed && !info.recovered && info.intendedRecipient == recipient) {
                claimableCount++;
            }
        }
        
        // 创建结果数组
        address[] memory resultDepositors = new address[](claimableCount);
        uint256[] memory resultDepositIds = new uint256[](claimableCount);
        
        uint256 index = 0;
        for (uint256 i = 0; i < count; i++) {
            DepositInfo memory info = deposits[allDeposits[i].depositor][allDeposits[i].depositId];
            if (!info.claimed && !info.recovered && info.intendedRecipient == recipient) {
                resultDepositors[index] = allDeposits[i].depositor;
                resultDepositIds[index] = allDeposits[i].depositId;
                index++;
            }
        }
        
        return (resultDepositors, resultDepositIds);
    }
    
    /**
     * @dev 查询接收地址可以领取的存款数量
     * @param recipient 接收地址（中转地址）
     * @return count 可领取的存款数量
     */
    function getClaimableDepositCount(address recipient)
        external
        view
        returns (uint256 count)
    {
        uint256 total = recipientDepositCount[recipient];
        count = 0;
        ClaimableDeposit[] memory allDeposits = recipientDeposits[recipient];
        for (uint256 i = 0; i < total; i++) {
            DepositInfo memory info = deposits[allDeposits[i].depositor][allDeposits[i].depositId];
            // 必须满足：未领取、未取回、且 intendedRecipient 指向 recipient
            if (!info.claimed && !info.recovered && info.intendedRecipient == recipient) {
                count++;
            }
        }
        return count;
    }
    
    /**
     * @dev 查询凭证代币对应的底层资产数量（折算成USDT）
     * @param depositor 存款人地址
     * @param depositId 存款ID
     * @return underlyingAmount 底层资产数量（wei）
     */
    function getUnderlyingAmount(address depositor, uint256 depositId)
        external
        view
        returns (uint256 underlyingAmount)
    {
        DepositInfo memory info = deposits[depositor][depositId];
        if (info.yieldAmount == 0) return 0;
        
        // 1. 获取 tokenKey
        string memory tokenKey = configCore.getTokenKey(info.token);
        if (bytes(tokenKey).length == 0) return 0;
        
        // 2. 解析借贷配置
        (address delegate, address lendingTarget) = _resolveLendingConfig(tokenKey);
        if (delegate == address(0) || lendingTarget == address(0)) {
            return 0;
        }
        
        // 3. 调用 lending delegate 的 estimateRedeemAmount 来获取底层资产数量
        try ILendingDelegate(delegate).estimateRedeemAmount(
            tokenKey,
            info.yieldAmount,
            lendingTarget,
            address(configCore)
        ) returns (uint256 amount) {
            return amount;
        } catch {
            // 如果调用失败，返回0
            return 0;
        }
    }
    
    // ============ Admin Functions ============
    
    /**
     * @dev 设置配置合约地址
     */
    function setConfigCore(address _configCore) external onlyOwner {
        if (_configCore == address(0)) revert InvalidAddress();
        configCore = ITreasuryConfigCore(_configCore);
        emit ConfigCoreUpdated(_configCore);
    }
    
    /**
     * @dev 设置/取消地址B白名单
     */
    function setValidRecipient(address recipient, bool valid) external onlyOwner {
        validRecipients[recipient] = valid;
        emit WhitelistUpdated(recipient, valid);
    }
    
    /**
     * @dev 启用/禁用白名单
     */
    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
    }
    
    /**
     * @dev 设置取回时间锁
     */
    function setRecoveryDelay(uint256 newDelay) external onlyOwner {
        recoveryDelay = newDelay;
        emit RecoveryDelayUpdated(newDelay);
    }
    
    // ============ Internal Functions ============
    
    /**
     * @dev 解析借贷配置（从 configCore 获取）
     * @param tokenKey Token key
     * @return delegate 借贷适配器地址
     * @return lendingTarget 借贷池地址
     */
    function _resolveLendingConfig(string memory tokenKey)
        internal
        view
        returns (address delegate, address lendingTarget)
    {
        if (address(configCore) == address(0)) return (address(0), address(0));
        
        // 获取适配器 key
        string memory delegateKey = configCore.getStringConfig("POOL_DELEGATE_KEY");
        if (bytes(delegateKey).length == 0) {
            return (address(0), address(0));
        }
        delegate = configCore.getAddressConfig(delegateKey);
        if (delegate == address(0)) return (address(0), address(0));

        // 优先使用 token 特定的配置: POOL_TARGET_TOKEN_<TOKENKEY>
        string memory tokenTargetKey = string.concat("POOL_TARGET_TOKEN_", tokenKey);
        lendingTarget = configCore.getAddressConfig(tokenTargetKey);

        if (lendingTarget == address(0)) {
            // 回退到通用配置
            string memory poolKey = configCore.getStringConfig("POOL_TARGET_KEY");
            if (bytes(poolKey).length == 0) return (delegate, address(0));
            lendingTarget = configCore.getAddressConfig(poolKey);
        }
    }
}
