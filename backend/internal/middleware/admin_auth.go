package middleware

import (
	"net/http"
	"strings"

	"go-backend/internal/handlers"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// AdminAuthMiddleware 管理员认证中间件
type AdminAuthMiddleware struct {
	logger *logrus.Logger
}

// NewAdminAuthMiddleware 创建管理员认证中间件
func NewAdminAuthMiddleware(logger *logrus.Logger) *AdminAuthMiddleware {
	return &AdminAuthMiddleware{
		logger: logger,
	}
}

// RequireAdminAuth 要求管理员认证
func (a *AdminAuthMiddleware) RequireAdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 获取 Authorization header
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
			}).Warn("Admin auth failed - missing Authorization header")

			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Authentication required",
				"code":    "MISSING_AUTH_HEADER",
			})
			c.Abort()
			return
		}

		// 检查 Bearer 格式
		if !strings.HasPrefix(authHeader, "Bearer ") {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
			}).Warn("Admin auth failed - invalid Authorization format")

			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid authorization format, need Bearer token",
				"code":    "INVALID_AUTH_FORMAT",
			})
			c.Abort()
			return
		}

		// 提取 token
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == "" {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
			}).Warn("Admin auth failed - empty token")

			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Empty token",
				"code":    "EMPTY_TOKEN",
			})
			c.Abort()
			return
		}

		// 验证管理员 JWT token
		claims, err := handlers.ValidateAdminJWTToken(tokenString)
		if err != nil {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
				"error":  err.Error(),
			}).Warn("Admin auth failed - invalid token")

			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired token",
				"code":    "INVALID_TOKEN",
			})
			c.Abort()
			return
		}

		// 检查角色
		if claims.Role != "admin" {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
				"role":   claims.Role,
			}).Warn("Admin auth failed - insufficient permissions")

			c.JSON(http.StatusForbidden, gin.H{
				"success": false,
				"error":   "Insufficient permissions",
				"code":    "INSUFFICIENT_PERMISSIONS",
			})
			c.Abort()
			return
		}

		// 将用户信息存储到上下文
		c.Set("admin_username", claims.Username)
		c.Set("admin_role", claims.Role)

		c.Next()
	}
}
















