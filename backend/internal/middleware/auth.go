package middleware

import (
	"net/http"
	"strings"

	"go-backend/internal/handlers"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// AuthMiddleware JWT
type AuthMiddleware struct {
	logger *logrus.Logger
}

// NewAuthMiddleware createJWT
func NewAuthMiddleware(logger *logrus.Logger) *AuthMiddleware {
	return &AuthMiddleware{
		logger: logger,
	}
}

// RequireAuth JWT
func (a *AuthMiddleware) RequireAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// getAuthorization
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
			}).Warn("JWTfailed - Authorization")

			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Authentication required",
				"message": "Missing Authorization header. Please provide a valid JWT token.",
				"code":    "MISSING_AUTH_HEADER",
			})
			c.Abort()
			return
		}

		// checkBearer
		if !strings.HasPrefix(authHeader, "Bearer ") {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
			}).Warn("JWTfailed - Authorization")

			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid authorization format",
				"message": "Authorization header must be in format: Bearer <token>",
				"code":    "INVALID_AUTH_FORMAT",
			})
			c.Abort()
			return
		}

		// token
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == "" {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
			}).Warn("JWTfailed - token")

			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Empty token",
				"message": "Token cannot be empty",
				"code":    "EMPTY_TOKEN",
			})
			c.Abort()
			return
		}

		// verifyJWT token
		claims, err := handlers.ValidateJWTToken(tokenString)
		if err != nil {
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
				"error":  err.Error(),
			}).Warn("JWTfailed - tokenverifyfailed")

			c.JSON(http.StatusUnauthorized, gin.H{
				"success": false,
				"error":   "Invalid or expired token",
				"message": err.Error(),
				"code":    "INVALID_TOKEN",
			})
			c.Abort()
			return
		}

		// Parse universal_address format: "chainId:0x..." or "0x..."
		// Extract pure address part (without chainId prefix) for consistent usage
		universalAddressData := claims.UniversalAddress
		if strings.Contains(universalAddressData, ":") {
			// Format: "chainId:0x..." - extract the address part after ":"
			parts := strings.SplitN(universalAddressData, ":", 2)
			if len(parts) == 2 {
				universalAddressData = parts[1] // Get the part after ":"
			}
		}
		// If format is "0x...", use as is

		// userstorage
		c.Set("user_address", claims.UserAddress)
		c.Set("universal_address", universalAddressData) // Store pure address (without chainId prefix)
		c.Set("chain_id", claims.ChainID)

		a.logger.WithFields(logrus.Fields{
			"path":              c.Request.URL.Path,
			"method":            c.Request.Method,
			"user_address":      claims.UserAddress,
			"universal_address": universalAddressData, // Log parsed address
			"chain_id":          claims.ChainID,
		}).Debug("JWTsuccess")

		c.Next()
	}
}

// OptionalAuth JWT（force）
func (a *AuthMiddleware) OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		// getAuthorization
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			// ，continue
			c.Next()
			return
		}

		// checkBearer
		if !strings.HasPrefix(authHeader, "Bearer ") {
			// error，continueuser
			c.Next()
			return
		}

		// token
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == "" {
			// token，continue
			c.Next()
			return
		}

		// verifyJWT token
		claims, err := handlers.ValidateJWTToken(tokenString)
		if err != nil {
			// token，continueuser
			a.logger.WithFields(logrus.Fields{
				"path":   c.Request.URL.Path,
				"method": c.Request.Method,
				"error":  err.Error(),
			}).Debug("JWTfailed - tokenverifyfailed")
			c.Next()
			return
		}

		// Parse universal_address format: "chainId:0x..." or "0x..."
		// Extract pure address part (without chainId prefix) for consistent usage
		universalAddressData := claims.UniversalAddress
		if strings.Contains(universalAddressData, ":") {
			// Format: "chainId:0x..." - extract the address part after ":"
			parts := strings.SplitN(universalAddressData, ":", 2)
			if len(parts) == 2 {
				universalAddressData = parts[1] // Get the part after ":"
			}
		}
		// If format is "0x...", use as is

		// userstorage
		c.Set("user_address", claims.UserAddress)
		c.Set("universal_address", universalAddressData) // Store pure address (without chainId prefix)
		c.Set("chain_id", claims.ChainID)

		a.logger.WithFields(logrus.Fields{
			"path":              c.Request.URL.Path,
			"method":            c.Request.Method,
			"user_address":      claims.UserAddress,
			"universal_address": universalAddressData, // Log parsed address
			"chain_id":          claims.ChainID,
		}).Debug("JWTsuccess")

		c.Next()
	}
}
