package handlers

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"github.com/sirupsen/logrus"
)

// AdminAuthHandler 管理员认证处理器
type AdminAuthHandler struct {
	jwtSecret []byte
	// TOTP secret key (必须从环境变量读取)
	totpSecret string
}

// AdminLoginRequest 管理员登录请求
type AdminLoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
	TOTPCode string `json:"totp_code" binding:"required"`
}

// AdminLoginResponse 管理员登录响应
type AdminLoginResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token,omitempty"`
	Message string `json:"message"`
}

// AdminJWTClaims 管理员 JWT Claims
type AdminJWTClaims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// NewAdminAuthHandler 创建管理员认证处理器
func NewAdminAuthHandler() *AdminAuthHandler {
	// 从环境变量读取 TOTP secret
	// 强制要求从环境变量 ADMIN_TOTP_SECRET 读取
	totpSecret := os.Getenv("ADMIN_TOTP_SECRET")
	
	// 检查是否配置了密码
	adminPassword := os.Getenv("ADMIN_PASSWORD")

	if totpSecret == "" || adminPassword == "" {
		logrus.Warn("⚠️ 安全警告: 未设置 ADMIN_TOTP_SECRET 或 ADMIN_PASSWORD 环境变量")
		logrus.Warn("⚠️ 管理员认证功能将无法正常工作，且可能导致服务启动失败或不安全")
		// 在生产环境中应该直接 panic，但在开发环境中为了方便测试，可能会有不同的处理
		// 这里我们记录错误，但让服务继续运行，以便在登录时拒绝请求
	}

	// JWT secret 也应该从环境变量读取
	jwtSecretStr := os.Getenv("ADMIN_JWT_SECRET")
	var jwtSecret []byte
	if jwtSecretStr != "" {
		jwtSecret = []byte(jwtSecretStr)
	} else {
		jwtSecret = []byte("zkpay-admin-jwt-secret-key-2025-default-change-me")
		logrus.Warn("⚠️ 使用默认的 ADMIN_JWT_SECRET，请在生产环境中设置环境变量")
	}

	return &AdminAuthHandler{
		jwtSecret:  jwtSecret,
		totpSecret: totpSecret,
	}
}

// AdminLoginHandler 管理员登录处理
func (h *AdminAuthHandler) AdminLoginHandler(c *gin.Context) {
	// 检查是否配置了必要环境变量
	if h.totpSecret == "" {
		c.JSON(http.StatusInternalServerError, AdminLoginResponse{
			Success: false,
			Message: "Server misconfiguration: ADMIN_TOTP_SECRET not set",
		})
		return
	}

	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		c.JSON(http.StatusInternalServerError, AdminLoginResponse{
			Success: false,
			Message: "Server misconfiguration: ADMIN_PASSWORD not set",
		})
		return
	}

	var req AdminLoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, AdminLoginResponse{
			Success: false,
			Message: fmt.Sprintf("Invalid request: %v", err),
		})
		return
	}

	// 验证用户名 (目前仅支持 admin，也可以扩展为环境变量配置)
	expectedUsername := os.Getenv("ADMIN_USERNAME")
	if expectedUsername == "" {
		expectedUsername = "admin"
	}

	if req.Username != expectedUsername {
		// 故意使用通用的错误消息
		c.JSON(http.StatusUnauthorized, AdminLoginResponse{
			Success: false,
			Message: "Invalid credentials",
		})
		return
	}

	// 验证密码
	if req.Password != adminPassword {
		c.JSON(http.StatusUnauthorized, AdminLoginResponse{
			Success: false,
			Message: "Invalid credentials",
		})
		return
	}

	// 验证 TOTP
	valid := totp.Validate(req.TOTPCode, h.totpSecret)
	if !valid {
		c.JSON(http.StatusUnauthorized, AdminLoginResponse{
			Success: false,
			Message: "Invalid TOTP code",
		})
		return
	}

	// 生成 JWT token
	token, err := h.generateAdminJWTToken(req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, AdminLoginResponse{
			Success: false,
			Message: "Failed to generate token",
		})
		return
	}

	c.JSON(http.StatusOK, AdminLoginResponse{
		Success: true,
		Token:   token,
		Message: "Login successful",
	})
}

// GenerateTOTPSecretHandler 生成 TOTP secret（仅用于初始化）
func (h *AdminAuthHandler) GenerateTOTPSecretHandler(c *gin.Context) {
	// 只有在未配置 TOTP secret 时才允许生成，或者需要特殊权限
	// 为了安全起见，此接口在生产环境中应该被禁用或严格保护
	// 这里简单实现为：如果环境变量已设置，则禁止通过 API 生成新的
	if os.Getenv("ADMIN_TOTP_SECRET") != "" {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"error":   "TOTP secret already configured in environment",
		})
		return
	}

	// 生成新的 TOTP secret
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "ZKPay Admin",
		AccountName: "admin@enclave",
		Period:      30,
		Digits:      otp.DigitsSix,
		Algorithm:   otp.AlgorithmSHA1,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to generate TOTP secret",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"secret":  key.Secret(),
		"url":     key.URL(),
		"message": "Save this secret securely to ADMIN_TOTP_SECRET env var. Use it to generate TOTP codes.",
	})
}

// generateAdminJWTToken 生成管理员 JWT token
func (h *AdminAuthHandler) generateAdminJWTToken(username string) (string, error) {
	claims := AdminJWTClaims{
		Username: username,
		Role:     "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "zkpay-backend-admin",
			Subject:   username,
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(h.jwtSecret)
	if err != nil {
		return "", fmt.Errorf("failed to sign token: %w", err)
	}

	return tokenString, nil
}

// ValidateAdminJWTToken 验证管理员 JWT token
func ValidateAdminJWTToken(tokenString string) (*AdminJWTClaims, error) {
	// 获取 JWT secret，优先使用环境变量
	jwtSecretStr := os.Getenv("ADMIN_JWT_SECRET")
	var jwtSecret []byte
	if jwtSecretStr != "" {
		jwtSecret = []byte(jwtSecretStr)
	} else {
		jwtSecret = []byte("zkpay-admin-jwt-secret-key-2025-default-change-me")
	}

	token, err := jwt.ParseWithClaims(tokenString, &AdminJWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if claims, ok := token.Claims.(*AdminJWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// hashPassword 哈希密码（用于未来扩展）
func hashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}
