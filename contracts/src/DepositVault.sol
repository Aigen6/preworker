// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ILendingDelegate.sol";

/**
 * @title DepositVault
 * @dev 多链支持的凭证代币托管合约，使用直接配置 + ILendingDelegate
 * @notice 地址A存入借贷池后，yield token托管在合约中，地址B可以自取
 *         如果地址B输入错误或没来取，地址A可以取回
 * 
 * 工作流程:
 * 1. 地址A调用 deposit() -> 存入借贷池，获得yield token，托管在合约中
 * 2. 地址B调用 claim() -> 领取yield token
 * 3. 如果地址B没来取，地址A在时间锁后调用 recover() -> 取回yield token
 * 
 * 多链支持:
 * - 直接在合约中配置借贷适配器和借贷池地址
 * - 使用 ILendingDelegate 适配器来处理不同链的借贷协议（AAVE V3, JustLend等）
 * - 可以在 BSC、Ethereum、Polygon、TRON 等链上部署
 * - 支持每个代币配置不同的借贷池
 */
contract DepositVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // 借贷适配器地址（每个代币可以配置不同的适配器）
    mapping(address => address) public lendingDelegates; // token => delegate
    
    // 借贷池地址（每个代币可以配置不同的借贷池）
    mapping(address => address) public lendingTargets; // token => lendingTarget
    
    // 代币 key 映射（用于 ILendingDelegate 接口）
    mapping(address => string) public tokenKeys; // token => tokenKey
    
    // 默认借贷适配器（如果代币没有特定配置，使用默认值）
    address public defaultLendingDelegate;
    
    // 默认借贷池（如果代币没有特定配置，使用默认值）
    address public defaultLendingTarget;
    
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
    
    // 紧急提取时间锁（默认2天）
    uint256 public emergencyWithdrawDelay = 2 days;
    
    // 最小存款金额（防止粉尘攻击，默认 10 USDT，考虑6位精度：10 * 10^6）
    // 注意：BSC 上的 USDT 是 18 位精度，其他链（Ethereum、TRON等）是 6 位精度
    uint256 public minDepositAmount = 10 * 10**6;
    
    // 紧急提取请求
    struct EmergencyWithdrawRequest {
        address token;
        uint256 amount;
        uint256 requestTime;
        bool executed;
    }
    
    // 每个代币的紧急提取请求（一次只能有一个待执行的请求）
    mapping(address => EmergencyWithdrawRequest) public emergencyWithdrawRequests;
    
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
    event LendingDelegateUpdated(address indexed token, address indexed delegate);
    event LendingTargetUpdated(address indexed token, address indexed target);
    event TokenKeyUpdated(address indexed token, string tokenKey);
    event DefaultLendingDelegateUpdated(address indexed delegate);
    event DefaultLendingTargetUpdated(address indexed target);
    event EmergencyWithdrawRequested(
        address indexed token,
        uint256 amount,
        uint256 executeAfter
    );
    event EmergencyWithdrawExecuted(
        address indexed token,
        uint256 amount
    );
    event EmergencyWithdrawDelayUpdated(uint256 newDelay);
    event DelegateWhitelistUpdated(address indexed delegate, bool valid);
    event DelegateWhitelistEnabledUpdated(bool enabled);
    event MinDepositAmountUpdated(uint256 newAmount);
    event GetUnderlyingAmountFailed(
        uint256 indexed depositId,
        address indexed delegate,
        address indexed token,
        string reason
    );
    
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
    error WithdrawFailed();
    error EmergencyWithdrawNotReady();
    error EmergencyWithdrawRequestNotFound();
    error EmergencyWithdrawAlreadyExecuted();
    error EmergencyWithdrawRequestPending(); // 已有待执行的请求
    error InvalidDelegate(); // 无效的适配器地址
    error InvalidLendingTarget(); // 无效的借贷池地址
    error DepositAmountTooSmall(); // 存款金额太小（小于最小限制）
    error DepositIdNotFoundInList(); // 存款ID不在列表中（状态不一致）
    
    // 适配器白名单（可选，如果启用，只允许白名单中的适配器）
    mapping(address => bool) public delegateWhitelist;
    bool public delegateWhitelistEnabled;
    
    constructor(
        address _initialOwner,
        address _defaultLendingDelegate,
        address _defaultLendingTarget
    ) Ownable(_initialOwner) {
        if (_initialOwner == address(0)) revert InvalidAddress();
        if (_defaultLendingDelegate == address(0)) revert InvalidAddress();
        if (_defaultLendingTarget == address(0)) revert InvalidAddress();
        
        defaultLendingDelegate = _defaultLendingDelegate;
        defaultLendingTarget = _defaultLendingTarget;
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
        
        // 检查最小存款金额（防止粉尘攻击）
        if (amount < minDepositAmount) {
            revert DepositAmountTooSmall();
        }
        
        // 1. 获取借贷配置（优先使用代币特定配置，否则使用默认配置）
        address delegate = lendingDelegates[token];
        address lendingTarget = lendingTargets[token];
        
        if (delegate == address(0)) {
            delegate = defaultLendingDelegate;
        }
        if (lendingTarget == address(0)) {
            lendingTarget = defaultLendingTarget;
        }
        
        if (delegate == address(0) || lendingTarget == address(0)) {
            revert InvalidAddress();
        }
        
        // 验证适配器地址（在使用前验证）
        _validateDelegate(delegate);
        
        // 2. 获取 tokenKey（如果未配置，使用空字符串）
        string memory tokenKey = tokenKeys[token];
        
        // 3. 获取 yield token 地址
        address yieldToken = ILendingDelegate(delegate).getYieldTokenAddress(
            token,
            tokenKey,
            lendingTarget
        );
        if (yieldToken == address(0)) revert YieldTokenNotFound();
        
        // 4. 接收代币
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        
        // 5. 记录存入前的 yield token 余额
        uint256 yieldBefore = IERC20(yieldToken).balanceOf(address(this));
        uint256 depositorYieldBefore = IERC20(yieldToken).balanceOf(msg.sender);
        
        // 6. 批准借贷池（使用 forceApprove 以处理非零 allowance 的情况）
        IERC20(token).forceApprove(lendingTarget, amount);
        
        // 7. 通过适配器存入借贷池（使用 delegatecall）
        (bool success, ) = delegate.delegatecall(
            abi.encodeWithSelector(
                ILendingDelegate.supply.selector,
                token, // tokenAddress
                tokenKey,
                amount,
                address(this), // onBehalfOf = DepositVault
                lendingTarget,
                yieldToken // yieldTokenHint
            )
        );
        
        if (!success) revert SupplyFailed();
        
        // 8. 获取存入后的 yield token 余额
        // 注意：yield token 应该已经发送到 address(this)（即 DepositVault 合约）
        // 因为 supply 函数的 onBehalfOf 参数是 address(this)
        uint256 yieldAfter = IERC20(yieldToken).balanceOf(address(this));
        uint256 yieldAmount = yieldAfter - yieldBefore;
        if (yieldAmount == 0) revert NoYieldTokenReceived();
        
        // 验证：确保 yield token 确实在合约中，而不是在 depositor 地址
        // 这是一个额外的安全检查，确保 lending delegate 正确地将 yield token 发送到合约
        uint256 depositorYieldAfter = IERC20(yieldToken).balanceOf(msg.sender);
        if (depositorYieldAfter > depositorYieldBefore) {
            // 如果 depositor 的余额增加了，说明 yield token 可能被错误地发送到了 depositor
            // 这不应该发生，因为 onBehalfOf 是 address(this)
            revert NoYieldTokenReceived(); // 使用相同的错误，避免暴露内部逻辑
        }
        
        // 9. 记录存款信息（使用全局唯一ID）
        // 注意：yield token 保留在合约中，不会转给 depositor
        // 只有 intendedRecipient 可以通过 claim() 提取，或 depositor 可以通过 recover() 取回
        // 检查 depositCount 是否接近上限（防止溢出）
        if (depositCount == type(uint256).max) {
            revert InvalidAmount(); // 使用 InvalidAmount 表示已达到上限
        }
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
        
        // 保存要转账的金额
        uint256 amountToClaim = depositInfo.yieldAmount;
        
        // 先更新状态（防止重入）
        depositInfo.used = true;
        depositInfo.yieldAmount = 0;
        
        // 从活跃列表中移除
        _removeFromList(depositorDeposits[depositInfo.depositor], depositId);
        _removeFromList(recipientDeposits[depositInfo.intendedRecipient], depositId);
        
        // 转账凭证代币给地址B
        IERC20(depositInfo.yieldToken).safeTransfer(recipient, amountToClaim);
        
        emit Claimed(
            depositInfo.depositor,
            depositId,
            recipient,
            depositInfo.yieldToken,
            amountToClaim
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
        
        // 保存要转账的金额
        uint256 amountToRecover = depositInfo.yieldAmount;
        
        // 先更新状态（防止重入）
        depositInfo.used = true;
        depositInfo.yieldAmount = 0;
        
        // 从活跃列表中移除
        _removeFromList(depositorDeposits[depositInfo.depositor], depositId);
        _removeFromList(recipientDeposits[depositInfo.intendedRecipient], depositId);
        
        // 转账凭证代币回地址A
        IERC20(depositInfo.yieldToken).safeTransfer(msg.sender, amountToRecover);
        
        emit Recovered(
            msg.sender,
            depositId,
            depositInfo.yieldToken,
            amountToRecover
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
        // 获取所有关联的存款ID（recipientDeposits 列表只包含 intendedRecipient == recipient 的存款）
        uint256[] memory allDepositIds = recipientDeposits[recipient];
        uint256 count = 0;
        
        // 先计算未使用的存款数量
        // 注意：recipientDeposits[recipient] 列表中的存款，其 intendedRecipient 应该都是 recipient
        // 但为了安全，我们仍然检查 used 状态和 yieldAmount
        for (uint256 i = 0; i < allDepositIds.length; i++) {
            uint256 depositId = allDepositIds[i];
            DepositInfo storage depositInfo = deposits[depositId];
            // 只计算未使用且有余额的存款
            // 注意：不需要检查 intendedRecipient，因为列表本身已经过滤了
            if (!depositInfo.used && depositInfo.yieldAmount > 0) {
                // 额外验证：确保 intendedRecipient 匹配（防御性检查）
                if (depositInfo.intendedRecipient == recipient) {
                    count++;
                }
            }
        }
        
        // 创建结果数组
        uint256[] memory result = new uint256[](count);
        uint256 index = 0;
        
        // 填充结果数组
        for (uint256 i = 0; i < allDepositIds.length; i++) {
            uint256 depositId = allDepositIds[i];
            DepositInfo storage depositInfo = deposits[depositId];
            // 只包含未使用且有余额的存款
            if (!depositInfo.used && depositInfo.yieldAmount > 0) {
                // 额外验证：确保 intendedRecipient 匹配（防御性检查）
                if (depositInfo.intendedRecipient == recipient) {
                    result[index] = depositId;
                    index++;
                }
            }
        }
        
        return result;
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
        uint256[] memory allDepositIds = recipientDeposits[recipient];
        for (uint256 i = 0; i < allDepositIds.length; i++) {
            uint256 depositId = allDepositIds[i];
            DepositInfo storage depositInfo = deposits[depositId];
            // 只计算未使用且有余额的存款
            if (!depositInfo.used && depositInfo.yieldAmount > 0) {
                // 额外验证：确保 intendedRecipient 匹配（防御性检查）
                if (depositInfo.intendedRecipient == recipient) {
                    count++;
                }
            }
        }
    }
    
    /**
     * @dev 查询凭证代币对应的底层资产数量（考虑利息）
     * @param depositId 全局存款ID
     * @return underlyingAmount 底层资产数量（wei）
     * @notice 这是一个 view 函数，如果调用失败会返回 0，不会发出事件
     * @notice 如果需要错误记录，请使用 getUnderlyingAmountWithLog() 函数
     */
    function getUnderlyingAmount(uint256 depositId)
        external
        view
        returns (uint256 underlyingAmount)
    {
        DepositInfo memory info = deposits[depositId];
        if (info.yieldAmount == 0) return 0;
        
        // 1. 获取借贷配置
        address delegate = lendingDelegates[info.token];
        address lendingTarget = lendingTargets[info.token];
        
        if (delegate == address(0)) {
            delegate = defaultLendingDelegate;
        }
        if (lendingTarget == address(0)) {
            lendingTarget = defaultLendingTarget;
        }
        
        if (delegate == address(0) || lendingTarget == address(0)) {
            return 0;
        }
        
        // 验证适配器地址（在使用前验证，view 函数中如果失败返回 0）
        // 注意：view 函数中不能使用 revert，所以只验证接口，不验证白名单
        // 使用 getYieldTokenAddress 来验证接口（这是一个 view 函数）
        (bool hasInterface, ) = delegate.staticcall(
            abi.encodeWithSelector(ILendingDelegate.getYieldTokenAddress.selector, info.token, "", lendingTarget)
        );
        if (!hasInterface) {
            return 0;
        }
        
        // 2. 获取 tokenKey
        string memory tokenKey = tokenKeys[info.token];
        
        // 3. 调用 lending delegate 的 estimateRedeemAmount 来获取底层资产数量
        // 直接调用 view/pure 函数（在 view 函数中可以直接调用其他合约的 view/pure 函数）
        return ILendingDelegate(delegate).estimateRedeemAmount(
            info.token, // tokenAddress
            tokenKey,
            info.yieldAmount,
            lendingTarget
        );
    }
    
    /**
     * @dev 查询凭证代币对应的底层资产数量（考虑利息），并记录错误事件
     * @param depositId 全局存款ID
     * @return underlyingAmount 底层资产数量（wei），如果失败返回 0
     * @notice 这是一个非 view 函数，如果调用失败会发出事件记录
     * @notice 前端可以使用此函数来获取值并同时记录错误
     */
    function getUnderlyingAmountWithLog(uint256 depositId)
        external
        returns (uint256 underlyingAmount)
    {
        DepositInfo memory info = deposits[depositId];
        if (info.yieldAmount == 0) return 0;
        
        // 1. 获取借贷配置
        address delegate = lendingDelegates[info.token];
        address lendingTarget = lendingTargets[info.token];
        
        if (delegate == address(0)) {
            delegate = defaultLendingDelegate;
        }
        if (lendingTarget == address(0)) {
            lendingTarget = defaultLendingTarget;
        }
        
        if (delegate == address(0) || lendingTarget == address(0)) {
            emit GetUnderlyingAmountFailed(
                depositId,
                delegate,
                info.token,
                "Missing delegate or lending target"
            );
            return 0;
        }
        
        // 验证适配器地址（在使用前验证）
        // 检查代码大小（最简单可靠的方法）
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(delegate)
        }
        if (codeSize == 0) {
            emit GetUnderlyingAmountFailed(
                depositId,
                delegate,
                info.token,
                "Delegate contract not found"
            );
            return 0;
        }
        
        // 2. 获取 tokenKey
        string memory tokenKey = tokenKeys[info.token];
        
        // 3. 调用 lending delegate 的 estimateRedeemAmount 来获取底层资产数量
        // 直接调用 view/pure 函数
        try ILendingDelegate(delegate).estimateRedeemAmount(
            info.token, // tokenAddress
            tokenKey,
            info.yieldAmount,
            lendingTarget
        ) returns (uint256 amount) {
            return amount;
        } catch Error(string memory reason) {
            // 捕获 revert 错误信息
            emit GetUnderlyingAmountFailed(
                depositId,
                delegate,
                info.token,
                reason
            );
            return 0;
        } catch (bytes memory /* lowLevelData */) {
            // 捕获低级错误（无错误信息）
            emit GetUnderlyingAmountFailed(
                depositId,
                delegate,
                info.token,
                "Low-level call failed"
            );
            return 0;
        }
    }
    
    /**
     * @dev 获取yield token地址（通过ILendingDelegate）
     * @param token 底层代币地址
     * @return yieldToken yield token地址
     */
    function getYieldTokenAddress(address token) external view returns (address yieldToken) {
        // 获取借贷配置
        address delegate = lendingDelegates[token];
        address lendingTarget = lendingTargets[token];
        
        if (delegate == address(0)) {
            delegate = defaultLendingDelegate;
        }
        if (lendingTarget == address(0)) {
            lendingTarget = defaultLendingTarget;
        }
        
        if (delegate == address(0) || lendingTarget == address(0)) {
            return address(0);
        }
        
        // 获取 tokenKey
        string memory tokenKey = tokenKeys[token];
        
        return ILendingDelegate(delegate).getYieldTokenAddress(
            token,
            tokenKey,
            lendingTarget
        );
    }
    
    // ============ Admin Functions ============
    
    /**
     * @dev 设置代币的借贷适配器地址
     * @param token 代币地址（address(0) 表示设置默认值）
     * @param delegate 借贷适配器地址
     */
    function setLendingDelegate(address token, address delegate) external onlyOwner {
        if (delegate == address(0)) revert InvalidAddress();
        
        // 验证适配器是否实现了 ILendingDelegate 接口
        _validateDelegate(delegate);
        
        if (token == address(0)) {
            defaultLendingDelegate = delegate;
            emit DefaultLendingDelegateUpdated(delegate);
        } else {
            lendingDelegates[token] = delegate;
            emit LendingDelegateUpdated(token, delegate);
        }
    }
    
    /**
     * @dev 设置代币的借贷池地址
     * @param token 代币地址（address(0) 表示设置默认值）
     * @param target 借贷池地址
     */
    function setLendingTarget(address token, address target) external onlyOwner {
        if (target == address(0)) revert InvalidAddress();
        
        if (token == address(0)) {
            defaultLendingTarget = target;
            emit DefaultLendingTargetUpdated(target);
        } else {
            lendingTargets[token] = target;
            emit LendingTargetUpdated(token, target);
        }
    }
    
    /**
     * @dev 设置代币的 tokenKey（用于 ILendingDelegate 接口）
     * @param token 代币地址
     * @param tokenKey Token key（如 "USDT", "USDC"）
     */
    function setTokenKey(address token, string calldata tokenKey) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        tokenKeys[token] = tokenKey;
        emit TokenKeyUpdated(token, tokenKey);
    }
    
    /**
     * @dev 批量设置代币配置
     * @param token 代币地址
     * @param delegate 借贷适配器地址（address(0) 表示不更新）
     * @param target 借贷池地址（address(0) 表示不更新）
     * @param tokenKey Token key（空字符串表示不更新）
     */
    function setTokenConfig(
        address token,
        address delegate,
        address target,
        string calldata tokenKey
    ) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        
        if (delegate != address(0)) {
            // 验证适配器地址
            _validateDelegate(delegate);
            lendingDelegates[token] = delegate;
            emit LendingDelegateUpdated(token, delegate);
        }
        
        if (target != address(0)) {
            lendingTargets[token] = target;
            emit LendingTargetUpdated(token, target);
        }
        
        if (bytes(tokenKey).length > 0) {
            tokenKeys[token] = tokenKey;
            emit TokenKeyUpdated(token, tokenKey);
        }
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
        emit WhitelistUpdated(address(0), enabled); // 使用现有事件表示状态变化
    }
    
    /**
     * @dev 设置/取消适配器白名单
     */
    function setDelegateWhitelist(address delegate, bool valid) external onlyOwner {
        if (delegate == address(0)) revert InvalidAddress();
        delegateWhitelist[delegate] = valid;
        emit DelegateWhitelistUpdated(delegate, valid);
    }
    
    /**
     * @dev 启用/禁用适配器白名单
     */
    function setDelegateWhitelistEnabled(bool enabled) external onlyOwner {
        delegateWhitelistEnabled = enabled;
        emit DelegateWhitelistEnabledUpdated(enabled);
    }
    
    /**
     * @dev 设置取回时间锁
     */
    function setRecoveryDelay(uint256 newDelay) external onlyOwner {
        recoveryDelay = newDelay;
        emit RecoveryDelayUpdated(newDelay);
    }
    
    /**
     * @dev 请求紧急提取（需要时间锁）
     * @param token 代币地址
     * @param amount 提取数量（0表示全部）
     * @notice 请求后需要等待 emergencyWithdrawDelay 时间才能执行
     */
    function requestEmergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        
        if (amount == 0) {
            amount = balance;
        }
        
        if (amount > balance) {
            revert InvalidAmount();
        }
        
        // 检查是否已有待执行的请求
        EmergencyWithdrawRequest storage request = emergencyWithdrawRequests[token];
        if (request.requestTime > 0 && !request.executed) {
            // 如果已有请求但未执行，需要先取消或执行
            revert EmergencyWithdrawRequestPending();
        }
        
        // 创建新的请求
        emergencyWithdrawRequests[token] = EmergencyWithdrawRequest({
            token: token,
            amount: amount,
            requestTime: block.timestamp,
            executed: false
        });
        
        uint256 executeAfter = block.timestamp + emergencyWithdrawDelay;
        emit EmergencyWithdrawRequested(token, amount, executeAfter);
    }
    
    /**
     * @dev 执行紧急提取（需要时间锁到期）
     * @param token 代币地址（必须是底层代币，不能是 yield token）
     * @notice 只能在请求后等待 emergencyWithdrawDelay 时间才能执行
     * @notice 紧急提取只能提取底层代币，不能提取活跃存款的 yield token
     */
    function executeEmergencyWithdraw(address token) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        
        EmergencyWithdrawRequest storage request = emergencyWithdrawRequests[token];
        
        // 检查请求是否存在
        if (request.requestTime == 0) {
            revert EmergencyWithdrawRequestNotFound();
        }
        
        // 检查是否已执行
        if (request.executed) {
            revert EmergencyWithdrawAlreadyExecuted();
        }
        
        // 检查时间锁是否到期
        if (block.timestamp < request.requestTime + emergencyWithdrawDelay) {
            revert EmergencyWithdrawNotReady();
        }
        
        // 安全检查：确保 token 不是活跃存款的 yield token
        // 遍历所有活跃存款，检查是否有 yield token 匹配
        // 注意：这是一个 gas 消耗较大的操作，但为了安全是必要的
        // 如果存款数量很大，可以考虑添加限制或使用不同的策略
        uint256 totalActiveYieldAmount = _getTotalActiveYieldTokenAmount(token);
        
        // 执行提取
        uint256 amount = request.amount;
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        
        // 如果请求的金额超过当前余额，revert 而不是自动调整
        // 这样可以确保用户知道实际提取的金额
        if (amount > balance) {
            revert InvalidAmount(); // 余额不足
        }
        
        // 安全检查：确保提取的金额不会影响活跃存款
        // 如果 token 是 yield token，计算可提取的最大金额（总余额 - 活跃存款金额）
        uint256 maxWithdrawable = balance;
        if (totalActiveYieldAmount > 0) {
            // token 是 yield token，只能提取超出活跃存款的部分
            if (balance < totalActiveYieldAmount) {
                revert InvalidAmount(); // 余额不足以覆盖活跃存款
            }
            maxWithdrawable = balance - totalActiveYieldAmount;
            if (amount > maxWithdrawable) {
                revert InvalidAmount(); // 提取金额超过可提取部分
            }
        }
        
        // 标记为已执行
        request.executed = true;
        
        // 转账
        tokenContract.safeTransfer(owner(), amount);
        
        emit EmergencyWithdrawExecuted(token, amount);
    }
    
    /**
     * @dev 取消紧急提取请求（仅限owner）
     * @param token 代币地址
     * @notice 可以在执行前取消请求
     */
    function cancelEmergencyWithdraw(address token) external onlyOwner {
        if (token == address(0)) revert InvalidAddress();
        
        EmergencyWithdrawRequest storage request = emergencyWithdrawRequests[token];
        
        if (request.requestTime == 0) {
            revert EmergencyWithdrawRequestNotFound();
        }
        
        if (request.executed) {
            revert EmergencyWithdrawAlreadyExecuted();
        }
        
        // 删除请求
        delete emergencyWithdrawRequests[token];
        
        // 发出事件
        emit EmergencyWithdrawRequested(token, 0, 0); // 使用 amount=0 表示取消
    }
    
    /**
     * @dev 设置紧急提取时间锁延迟
     * @param newDelay 新的延迟时间（秒）
     */
    function setEmergencyWithdrawDelay(uint256 newDelay) external onlyOwner {
        emergencyWithdrawDelay = newDelay;
        emit EmergencyWithdrawDelayUpdated(newDelay);
    }
    
    /**
     * @dev 设置最小存款金额（防止粉尘攻击）
     * @param newAmount 新的最小存款金额（考虑代币精度）
     * @notice 例如：
     *         - 10 USDT (6位精度，Ethereum/TRON等) = 10 * 10^6
     *         - 10 USDT (18位精度，BSC) = 10 * 10^18
     *         - 10 USDC (6位精度) = 10 * 10^6
     */
    function setMinDepositAmount(uint256 newAmount) external onlyOwner {
        minDepositAmount = newAmount;
        emit MinDepositAmountUpdated(newAmount);
    }
    
    /**
     * @dev 查询紧急提取请求信息
     * @param token 代币地址
     * @return request 紧急提取请求信息
     * @return canExecute 是否可以执行（时间锁是否到期）
     */
    function getEmergencyWithdrawRequest(address token)
        external
        view
        returns (
            EmergencyWithdrawRequest memory request,
            bool canExecute
        )
    {
        request = emergencyWithdrawRequests[token];
        canExecute = request.requestTime > 0 
            && !request.executed 
            && block.timestamp >= request.requestTime + emergencyWithdrawDelay;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @dev 计算指定 yield token 的总活跃存款金额
     * @param yieldToken yield token 地址
     * @return totalAmount 总活跃存款金额
     * @notice 这是一个 gas 消耗较大的操作，用于安全检查
     */
    function _getTotalActiveYieldTokenAmount(address yieldToken) internal view returns (uint256 totalAmount) {
        // 遍历所有可能的存款（通过 depositCount）
        // 注意：这是一个 O(n) 操作，如果存款数量很大，gas 消耗会很高
        // 但在紧急情况下，这是必要的安全检查
        for (uint256 i = 0; i < depositCount; i++) {
            DepositInfo storage info = deposits[i];
            if (!info.used && info.yieldToken == yieldToken && info.yieldAmount > 0) {
                totalAmount += info.yieldAmount;
            }
        }
    }
    
    /**
     * @dev 验证适配器地址是否有效
     * @param delegate 适配器地址
     */
    function _validateDelegate(address delegate) internal view {
        if (delegate == address(0)) revert InvalidAddress();
        
        // 检查适配器白名单（如果启用）
        if (delegateWhitelistEnabled) {
            if (!delegateWhitelist[delegate]) {
                revert InvalidDelegate();
            }
        }
        
        // 验证适配器是否实现了 ILendingDelegate 接口
        // 检查代码大小（最简单可靠的方法）
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(delegate)
        }
        if (codeSize == 0) {
            revert InvalidDelegate(); // 合约不存在或没有代码
        }
        
        // 注意：我们不再尝试调用函数来验证接口，因为：
        // 1. 代码大小检查已经足够（如果合约存在且有代码，说明已部署）
        // 2. 如果接口不匹配，在实际调用时会失败，这样也能发现问题
        // 3. 避免因为参数问题导致验证失败
    }
    
    /**
     * @dev 从数组中移除指定元素（简化版：查找并删除）
     * @param list 要操作的数组
     * @param value 要删除的值
     * @notice 如果元素不存在，会 revert，表示状态不一致（理论上不应该发生）
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
        // 如果元素不存在，这是一个严重的状态不一致问题
        revert DepositIdNotFoundInList();
    }
    
}
