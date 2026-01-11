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
    
    // 全局存款记录：depositId => DepositInfo（全局唯一ID）
    mapping(uint256 => DepositInfo) public deposits;
    uint256 public depositCount; // 全局存款计数器
    
    // 只维护活跃列表：recipient => depositId[]（只包含未使用的）
    mapping(address => uint256[]) public recipientDeposits;
    
    // depositor => depositId[]（只包含未使用的）
    mapping(address => uint256[]) public depositorDeposits;
    
    // 可选：地址B白名单（如果启用）
    mapping(address => bool) public validRecipients;
    bool public whitelistEnabled;
    
    // 可选：取回时间锁（默认3天）
    uint256 public recoveryDelay = 3 days;
    
    struct DepositInfo {
        address depositor;          // 存款人地址（源地址）
        address token;              // 底层代币地址
        address yieldToken;         // 凭证代币地址
        uint256 yieldAmount;        // 凭证代币数量
        address intendedRecipient;  // 预期的接收地址B（中转地址）
        uint256 depositTime;        // 存款时间
        bool used;                  // 是否已被使用（领取或取回）
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
    error AlreadyUsed(); // 已被使用（领取或取回）
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
     * @param intendedRecipient 预期的接收地址B（中转地址，必须指定）
     * @return depositId 存款ID
     */
    function deposit(
        address token,
        uint256 amount,
        address intendedRecipient
    ) external nonReentrant returns (uint256 depositId) {
        if (token == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        if (intendedRecipient == address(0)) revert InvalidAddress();
        
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
        
        // 9. 记录存款信息（使用全局唯一ID）
        depositId = depositCount++;
        
        deposits[depositId] = DepositInfo({
            depositor: msg.sender,
            token: token,
            yieldToken: yieldToken,
            yieldAmount: yieldAmount,
            intendedRecipient: intendedRecipient,
            depositTime: block.timestamp,
            used: false
        });
        
        // 10. 添加到活跃列表（只记录未使用的）
        depositorDeposits[msg.sender].push(depositId);
        recipientDeposits[intendedRecipient].push(depositId);
        
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
     * @param depositId 全局存款ID
     * @notice 只能领取 intendedRecipient 指向自己的存款
     * @notice 前端通过 getClaimableDeposits(msg.sender) 查询可领取的存款列表，然后调用此函数领取
     */
    function claim(uint256 depositId) external nonReentrant {
        address recipient = msg.sender;
        
        DepositInfo storage depositInfo = deposits[depositId];
        
        // 验证存款是否存在
        if (depositInfo.yieldAmount == 0) revert DepositNotFound();
        
        // 验证：不能重复使用（已领取或已取回）
        if (depositInfo.used) revert AlreadyUsed();
        
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
        
        depositInfo.used = true;
        
        // 从活跃列表中移除
        _removeFromList(depositorDeposits[depositInfo.depositor], depositId);
        _removeFromList(recipientDeposits[depositInfo.intendedRecipient], depositId);
        
        emit Claimed(
            depositInfo.depositor,
            depositId,
            recipient,
            depositInfo.yieldToken,
            depositInfo.yieldAmount
        );
    }
    
    /**
     * @dev 地址A取回凭证代币（如果地址B输入错误或没来取）
     * @param depositId 全局存款ID
     */
    function recover(uint256 depositId) external nonReentrant {
        DepositInfo storage depositInfo = deposits[depositId];
        if (depositInfo.yieldAmount == 0) revert DepositNotFound();
        
        // 验证：必须是存款人本人才能取回
        if (depositInfo.depositor != msg.sender) {
            revert InvalidRecipient(); // 不是存款人
        }
        
        // 验证：不能重复使用（已领取或已取回）
        if (depositInfo.used) revert AlreadyUsed();
        
        // 时间锁检查
        if (block.timestamp < depositInfo.depositTime + recoveryDelay) {
            revert RecoveryNotAvailable();
        }
        
        // 转账凭证代币回地址A
        IERC20(depositInfo.yieldToken).safeTransfer(msg.sender, depositInfo.yieldAmount);
        
        depositInfo.used = true;
        
        // 从活跃列表中移除
        _removeFromList(depositorDeposits[depositInfo.depositor], depositId);
        _removeFromList(recipientDeposits[depositInfo.intendedRecipient], depositId);
        
        emit Recovered(
            msg.sender,
            depositId,
            depositInfo.yieldToken,
            depositInfo.yieldAmount
        );
    }
    
    /**
     * @dev 查询存款信息（通过全局存款ID）
     */
    function getDeposit(uint256 depositId)
        external
        view
        returns (DepositInfo memory)
    {
        return deposits[depositId];
    }
    
    /**
     * @dev 查询地址A的所有未使用存款ID（活跃列表）
     */
    function getDepositIds(address depositor) external view returns (uint256[] memory) {
        return depositorDeposits[depositor];
    }
    
    /**
     * @dev 查询地址A的未使用存款数量
     */
    function getDepositCount(address depositor) external view returns (uint256) {
        return depositorDeposits[depositor].length;
    }
    
    
    /**
     * @dev 查询接收地址可以领取的所有存款（活跃列表）
     * @param recipient 接收地址（中转地址）
     * @return depositIds 全局存款ID列表（只包含未使用的）
     */
    function getClaimableDeposits(address recipient)
        external
        view
        returns (uint256[] memory depositIds)
    {
        return recipientDeposits[recipient];
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
        return recipientDeposits[recipient].length;
    }
    
    /**
     * @dev 查询凭证代币对应的底层资产数量（折算成USDT）
     * @param depositId 全局存款ID
     * @return underlyingAmount 底层资产数量（wei）
     */
    function getUnderlyingAmount(uint256 depositId)
        external
        view
        returns (uint256 underlyingAmount)
    {
        DepositInfo memory info = deposits[depositId];
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
     * @dev 从数组中移除指定元素（简化版：查找并删除）
     * @param list 要操作的数组
     * @param value 要删除的值
     */
    function _removeFromList(uint256[] storage list, uint256 value) internal {
        uint256 length = list.length;
        for (uint256 i = 0; i < length; i++) {
            if (list[i] == value) {
                // 找到后，用最后一个元素替换，然后删除最后一个
                if (i != length - 1) {
                    list[i] = list[length - 1];
                }
                list.pop();
                return;
            }
        }
    }
    
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
