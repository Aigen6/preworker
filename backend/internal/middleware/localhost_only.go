package middleware

import (
	"net"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// LocalhostOnly middleware - only allow localhost or whitelisted IPs access
type LocalhostOnly struct {
	logger     *logrus.Logger
	allowedIPs []string // List of allowed IP addresses or CIDR ranges
	trustedProxies []string // List of trusted proxy IPs/CIDRs
}

// NewLocalhostOnly CreatelocalhostAccessRestrictmiddleware
func NewLocalhostOnly(logger *logrus.Logger, allowedIPs []string) *LocalhostOnly {
	// 从环境变量读取受信任的代理（如果在反向代理/负载均衡器后面运行）
	trustedProxiesEnv := os.Getenv("TRUSTED_PROXIES")
	var trustedProxies []string
	if trustedProxiesEnv != "" {
		trustedProxies = strings.Split(trustedProxiesEnv, ",")
	}

	return &LocalhostOnly{
		logger:         logger,
		allowedIPs:     allowedIPs,
		trustedProxies: trustedProxies,
	}
}

	// Restrict restrict access to localhost only
	func (l *LocalhostOnly) Restrict() gin.HandlerFunc {
		return func(c *gin.Context) {
			// 配置 Gin 信任的代理，以便 ClientIP() 能正确解析 X-Forwarded-For
			// 注意：SetTrustedProxies 是 *gin.Engine 的方法，但我们在 Context 中无法直接访问 Engine
			// 然而 SetTrustedProxies 应该在初始化路由时就调用，而不是在中间件中
			// 这里我们只是为了兼容旧代码，实际上应该移除这行
			// if len(l.trustedProxies) > 0 {
			// 	c.Engine.SetTrustedProxies(l.trustedProxies)
			// }
			
			// 临时解决方案：尝试通过 Engine() 方法访问 (如果 Gin 版本支持)
			// 或者我们假设路由层已经配置好了 SetTrustedProxies

		// 获取客户端 IP
		// Gin 的 c.ClientIP() 会尝试从 X-Forwarded-For 等头部解析真实 IP，前提是 SetTrustedProxies 已正确配置
		// 如果没有配置 TrustedProxies，它可能会返回最后一跳的 IP
		clientIP := c.ClientIP()
		
		// 同时也获取直连 IP，用于审计
		remoteIP, _, _ := net.SplitHostPort(c.Request.RemoteAddr)
		
		// 获取 X-Real-IP (仅作为参考，不可完全信任，除非前面的代理已清洗)
		xRealIP := c.GetHeader("X-Real-IP")
		
		l.logger.WithFields(logrus.Fields{
			"client_ip":   clientIP,
			"remote_ip":   remoteIP,
			"x_real_ip":   xRealIP,
			"path":        c.Request.URL.Path,
			"method":      c.Request.Method,
			"allowedIPs":  l.allowedIPs,
			"remote_addr": c.Request.RemoteAddr,
			"x_forwarded": c.GetHeader("X-Forwarded-For"),
		}).Info("Check localhost access permission")

		// 检查权限
		// 注意：我们主要依赖 Gin 解析后的 clientIP，因为它是根据信任代理链推断出的最可能的真实 IP
		if !l.isAllowedIP(clientIP) {
			// 为了安全起见，如果 clientIP 被拒绝，我们也检查一下 remoteIP
			// 只有当 remoteIP 是 loopback 时才作为备选允许（防止误配置代理导致所有 localhost 请求被拒）
			if remoteIP != clientIP && isLocalhost(remoteIP) {
				l.logger.WithFields(logrus.Fields{
					"client_ip": clientIP,
					"remote_ip": remoteIP,
					"path":      c.Request.URL.Path,
				}).Warn("ClientIP denied but RemoteIP is localhost - allowing access (assuming direct local connection)")
				// 允许直接的本地连接
			} else {
				l.logger.WithFields(logrus.Fields{
					"client_ip": clientIP,
					"remote_ip": remoteIP,
					"path":      c.Request.URL.Path,
					"method":    c.Request.Method,
					"user_agent": c.GetHeader("User-Agent"),
				}).Warn("Reject non-whitelisted access to sensitive API")
	
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"success": false,
					"error":   "This API is only accessible from allowed IP addresses",
					"code":    "IP_NOT_ALLOWED",
				})
				return
			}
		}

		l.logger.WithFields(logrus.Fields{
			"client_ip": clientIP,
			"path":      c.Request.URL.Path,
		}).Debug("Localhost access permission verified")

		c.Next()
	}
}

// getRealIP Get real IP address (Deprecated: use c.ClientIP() with trusted proxies instead)
// 保留此函数用于兼容性，但建议使用 Gin 的内置机制
func getRealIP(c *gin.Context) string {
	return c.ClientIP()
}

// isLocalhost Check if IP is localhost
func isLocalhost(ip string) bool {
	// Normalize IP address
	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		// If unable to parse, check string format
		return ip == "localhost" || ip == "::1"
	}

	// CheckIPv4 localhost
	if parsedIP.To4() != nil {
		return parsedIP.IsLoopback()
	}

	// CheckIPv6 localhost
	return parsedIP.IsLoopback()
}

// isAllowedIP Check if IP is in the whitelist (supports CIDR)
func (l *LocalhostOnly) isAllowedIP(ip string) bool {
	// Always allow localhost
	if isLocalhost(ip) {
		return true
	}

	// If no whitelist configured, only allow localhost
	if len(l.allowedIPs) == 0 {
		l.logger.WithFields(logrus.Fields{
			"ip": ip,
		}).Debug("No allowedIPs configured, rejecting non-localhost")
		return false
	}

	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		// If unable to parse, check string format
		for _, allowed := range l.allowedIPs {
			if ip == allowed {
				l.logger.WithFields(logrus.Fields{
					"ip":      ip,
					"allowed": allowed,
				}).Debug("IP matched by string comparison")
				return true
			}
		}
		l.logger.WithFields(logrus.Fields{
			"ip": ip,
		}).Debug("IP could not be parsed and no string match found")
		return false
	}

	// Check each allowed IP or CIDR
	for _, allowed := range l.allowedIPs {
		allowed = strings.TrimSpace(allowed)
		
		// Check if it's a CIDR range
		if strings.Contains(allowed, "/") {
			_, ipNet, err := net.ParseCIDR(allowed)
			if err != nil {
				l.logger.WithFields(logrus.Fields{
					"allowed": allowed,
					"error":   err.Error(),
				}).Warn("Invalid CIDR in allowedIPs")
				continue
			}
			if ipNet.Contains(parsedIP) {
				l.logger.WithFields(logrus.Fields{
					"ip":      ip,
					"cidr":    allowed,
					"network": ipNet.String(),
				}).Info("✅ IP matched by CIDR - allowing access")
				return true
			} else {
				l.logger.WithFields(logrus.Fields{
					"ip":      ip,
					"cidr":    allowed,
					"network": ipNet.String(),
				}).Debug("IP not in this CIDR range")
			}
		} else {
			// Check exact IP match
			allowedIP := net.ParseIP(allowed)
			if allowedIP != nil && allowedIP.Equal(parsedIP) {
				l.logger.WithFields(logrus.Fields{
					"ip":      ip,
					"allowed": allowed,
				}).Info("✅ IP matched exactly - allowing access")
				return true
			} else {
				l.logger.WithFields(logrus.Fields{
					"ip":      ip,
					"allowed": allowed,
				}).Debug("IP does not match this exact IP")
			}
		}
	}

	l.logger.WithFields(logrus.Fields{
		"ip":         ip,
		"allowedIPs": l.allowedIPs,
		"parsedIP":   parsedIP.String(),
	}).Warn("❌ IP not found in whitelist - rejecting access")
	return false
}

	// RestrictWithToken Combine token verification with localhost restriction
	func (l *LocalhostOnly) RestrictWithToken(requiredToken string) gin.HandlerFunc {
		return func(c *gin.Context) {
			clientIP := c.ClientIP()
			
			// Configure trusted proxies for correct IP resolution
			// Removed: c.Engine.SetTrustedProxies(l.trustedProxies) - Engine is not accessible here

		// First check IP whitelist
		if !l.isAllowedIP(clientIP) {
			// Check remoteIP as fallback for direct connections
			remoteIP, _, _ := net.SplitHostPort(c.Request.RemoteAddr)
			if remoteIP != clientIP && isLocalhost(remoteIP) {
				// Allow direct localhost connection
			} else {
				l.logger.WithFields(logrus.Fields{
					"client_ip": clientIP,
					"remote_ip": remoteIP,
					"path":      c.Request.URL.Path,
				}).Warn("Reject non-whitelisted access - IP check failed")
	
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
					"success": false,
					"error":   "This API is only accessible from allowed IP addresses",
					"code":    "IP_NOT_ALLOWED",
				})
				return
			}
		}

		// Check token (If provided)
		if requiredToken != "" {
			authHeader := c.GetHeader("Authorization")
			token := c.GetHeader("X-Admin-Token")
			
			// Support Bearer token or X-Admin-Token
			if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}

			if token != requiredToken {
				l.logger.WithFields(logrus.Fields{
					"client_ip": clientIP,
					"path":      c.Request.URL.Path,
				}).Warn("Access denied - Token verification failed")

				c.JSON(http.StatusUnauthorized, gin.H{
					"success": false,
					"error":   "Invalid admin token",
					"code":    "INVALID_TOKEN",
				})
				c.Abort()
				return
			}
		}

		l.logger.WithFields(logrus.Fields{
			"client_ip": clientIP,
			"path":      c.Request.URL.Path,
		}).Info("Localhost + Token access permission verified")

		c.Next()
	}
}
