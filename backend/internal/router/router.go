package router

import (
	"go-backend/internal/config"
	"go-backend/internal/handlers"
	"go-backend/internal/middleware"
	"go-backend/internal/services"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

// corsMiddleware CORS middleware
// Priority: Environment Variable > YAML Config > Default (*)
func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Log all incoming requests for debugging
		origin := c.GetHeader("Origin")
		logrus.WithFields(logrus.Fields{
			"path":        c.Request.URL.Path,
			"method":      c.Request.Method,
			"origin":      origin,
			"remote_addr": c.ClientIP(),
			"user_agent":  c.GetHeader("User-Agent"),
		}).Info("🌐 CORS: Request received")

		var allowedOrigins []string
		var allowCredentials bool = true
		var maxAge int = 3600

		// Priority 1: Check environment variable (highest priority)
		envOrigins := os.Getenv("CORS_ALLOWED_ORIGINS")
		if envOrigins != "" {
			// Parse comma-separated origins from environment variable
			origins := strings.Split(envOrigins, ",")
			allowedOrigins = make([]string, 0, len(origins))
			for _, o := range origins {
				trimmed := strings.TrimSpace(o)
				if trimmed != "" {
					allowedOrigins = append(allowedOrigins, trimmed)
				}
			}
			logrus.WithFields(logrus.Fields{
				"source":          "environment_variable",
				"allowed_origins": allowedOrigins,
			}).Debug("CORS: Using origins from environment variable")
		} else if config.AppConfig != nil && len(config.AppConfig.CORS.AllowedOrigins) > 0 {
			// Priority 2: Read from YAML config
			allowedOrigins = config.AppConfig.CORS.AllowedOrigins
			allowCredentials = config.AppConfig.CORS.AllowCredentials
			if config.AppConfig.CORS.MaxAge > 0 {
				maxAge = config.AppConfig.CORS.MaxAge
			}
			logrus.WithFields(logrus.Fields{
				"source":          "yaml_config",
				"allowed_origins": allowedOrigins,
			}).Debug("CORS: Using origins from YAML config")
		} else {
			// Priority 3: Default - allow all origins
			allowedOrigins = []string{"*"}
			logrus.Debug("CORS: Using default allow-all origins (*)")
		}

		// Handle origin validation
		// origin already retrieved above for logging
		if len(allowedOrigins) == 1 && allowedOrigins[0] == "*" {
			// Allow all origins
			c.Header("Access-Control-Allow-Origin", "*")
		} else if origin != "" {
			// Check if the request origin is in the allowed list
			allowed := false
			for _, allowedOrigin := range allowedOrigins {
				if strings.TrimSpace(allowedOrigin) == origin {
					allowed = true
					break
				}
			}
			if allowed {
				c.Header("Access-Control-Allow-Origin", origin)
				logrus.WithFields(logrus.Fields{
					"origin": origin,
					"path":   c.Request.URL.Path,
					"method": c.Request.Method,
				}).Debug("CORS: Origin allowed")
			} else {
				// Log rejected origin with detailed information
				logrus.WithFields(logrus.Fields{
					"request_origin":  origin,
					"allowed_origins": allowedOrigins,
					"path":            c.Request.URL.Path,
					"method":          c.Request.Method,
					"remote_addr":     c.ClientIP(),
					"user_agent":      c.GetHeader("User-Agent"),
				}).Warn("🚫 CORS: Request blocked - Origin not in whitelist")
			}
		} else {
			// No Origin header (same-origin request or direct access)
			logrus.WithFields(logrus.Fields{
				"path":        c.Request.URL.Path,
				"method":      c.Request.Method,
				"remote_addr": c.ClientIP(),
			}).Debug("CORS: No Origin header in request")
		}

		// Handle OPTIONS preflight requests FIRST (before setting headers)
		// This is critical for Cloudflare and other proxies
		if c.Request.Method == "OPTIONS" {
			// For preflight requests, we must set CORS headers even if origin validation happens later
			// This ensures Cloudflare and other proxies can see the CORS headers

			// Set CORS headers for preflight
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, Cache-Control, Accept")
			if allowCredentials {
				c.Header("Access-Control-Allow-Credentials", "true")
			}
			c.Header("Access-Control-Max-Age", strconv.Itoa(maxAge))

			// Handle origin for preflight request
			if len(allowedOrigins) == 1 && allowedOrigins[0] == "*" {
				c.Header("Access-Control-Allow-Origin", "*")
			} else if origin != "" {
				// Check if the request origin is in the allowed list
				allowed := false
				for _, allowedOrigin := range allowedOrigins {
					if strings.TrimSpace(allowedOrigin) == origin {
						allowed = true
						break
					}
				}
				if allowed {
					c.Header("Access-Control-Allow-Origin", origin)
					logrus.WithFields(logrus.Fields{
						"origin": origin,
						"path":   c.Request.URL.Path,
					}).Info("✅ CORS: Preflight request allowed")
				} else {
					// Even if not allowed, we should still respond to preflight
					// But don't set Access-Control-Allow-Origin
					logrus.WithFields(logrus.Fields{
						"request_origin":  origin,
						"allowed_origins": allowedOrigins,
						"path":            c.Request.URL.Path,
					}).Warn("🚫 CORS: Preflight request blocked - Origin not in whitelist")
				}
			}

			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		// Set CORS headers for actual requests (non-OPTIONS)
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, Cache-Control, Accept")
		if allowCredentials {
			c.Header("Access-Control-Allow-Credentials", "true")
		}
		c.Header("Access-Control-Expose-Headers", "Content-Length, Content-Type")
		c.Header("Access-Control-Max-Age", strconv.Itoa(maxAge))

		c.Next()
	}
}

func SetupRouter(db *gorm.DB, kmsHandler *handlers.KMSHandler, wsHandler *handlers.WebSocketHandler, pushService *services.WebSocketPushService) *gin.Engine {
	r := gin.Default()

	// addCORS middleware
	r.Use(corsMiddleware())

	// Create localhost/IP whitelist restrict middleware
	logger := logrus.New()
	var allowedIPs []string

	// Read allowedIPs from config
	if config.AppConfig != nil {
		if len(config.AppConfig.Admin.AllowedIPs) > 0 {
			allowedIPs = config.AppConfig.Admin.AllowedIPs
			logger.WithFields(logrus.Fields{
				"allowed_ips": allowedIPs,
				"count":       len(allowedIPs),
			}).Info("Admin API IP whitelist configured")
		} else {
			logger.WithFields(logrus.Fields{
				"admin_config_exists": config.AppConfig.Admin.AllowedIPs != nil,
			}).Info("No admin.allowedIPs configured, using localhost-only mode")
		}
	} else {
		logger.Warn("AppConfig is nil, using localhost-only mode")
	}

	localhostOnly := middleware.NewLocalhostOnly(logger, allowedIPs)

	// ============ Check ============
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "pong",
		})
	})

	// ============ Health Check ============
	// Support both /health and /api/health for compatibility
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "ok",
			"service": "enclave-backend",
		})
	})

	// ============ Prometheus Metrics ============
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// ============ Admin UI Page (localhost only) ============
	r.GET("/admin/config", localhostOnly.Restrict(), func(c *gin.Context) {
		filePath := "./admin-token-config.html"
		// Check if file exists before serving
		if _, err := os.Stat(filePath); os.IsNotExist(err) {
			logger.WithFields(logrus.Fields{
				"file_path": filePath,
				"error":     err.Error(),
			}).Error("Admin config HTML file not found")
			c.JSON(http.StatusNotFound, gin.H{
				"error":   "Admin config page not found",
				"message": "The admin-token-config.html file is missing",
			})
			return
		}
		c.File(filePath)
	})

	// ============ Static Files (uploaded images) ============
	r.Static("/uploads", "./uploads")

	// ============ API Routes ============
	SetupZKPayRoutes(r, db, kmsHandler, wsHandler, pushService, localhostOnly)

	// ============ NoRoute handler for 404 ============
	// V1 API（）
	r.NoRoute(func(c *gin.Context) {
		path := c.Request.URL.Path

		// APIreturn404
		if len(path) >= 4 && path[:4] != "/api" {
			c.JSON(http.StatusNotFound, gin.H{
				"message":    "Endpoint not found",
				"path":       path,
				"suggestion": "Check /api endpoints for available APIs",
			})
			return
		}

		// APIexists
		c.JSON(http.StatusNotFound, gin.H{
			"message":    "API endpoint not found",
			"path":       path,
			"suggestion": "Check documentation for available /api endpoints",
		})
	})

	return r
}
