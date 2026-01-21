package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"log"

	"go-backend/internal/dto"
	"go-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// JWT - configuration
var jwtSecret = []byte("zkpay-jwt-secret-key-2025") // use

// AuthHandler process
type AuthHandler struct{}

// use dto 
type AuthRequest = dto.AuthRequest
type AuthResponse = dto.AuthResponse
type JWTClaims = dto.JWTClaims

// NewAuthHandler createprocess
func NewAuthHandler() *AuthHandler {
	return &AuthHandler{}
}

// AuthenticateHandler userinterface
func (h *AuthHandler) AuthenticateHandler(c *gin.Context) {
	var req AuthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, AuthResponse{
			Success: false,
			Message: fmt.Sprintf("error: %v", err),
		})
		return
	}

	// verify（，verifywallet signature）
	if !h.validateSignature(req.UserAddress, req.Message, req.Signature, req.ChainID) {
		c.JSON(http.StatusUnauthorized, AuthResponse{
			Success: false,
			Message: "verifyfailed",
		})
		return
	}

	// Universal Address
	universalAddress, err := h.convertToUniversalAddress(req.UserAddress, req.ChainID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, AuthResponse{
			Success: false,
			Message: fmt.Sprintf("addressfailed: %v", err),
		})
		return
	}

	// Convert EVM chain ID to SLIP-44 chain ID for JWT token
	// JWT should store SLIP-44 chain ID for consistency with database
	slip44ChainID := h.evmToSlip44(req.ChainID)
	log.Printf("🔐 Auth chain ID conversion: EVM=%d -> SLIP-44=%d", req.ChainID, slip44ChainID)

	// JWT token - use SLIP-44 chain ID
	token, err := h.generateJWTToken(req.UserAddress, universalAddress, slip44ChainID)
	if err != nil {
		log.Printf("❌ JWTfailed: %v", err)
		c.JSON(http.StatusInternalServerError, AuthResponse{
			Success: false,
			Message: "Tokenfailed",
		})
		return
	}

	log.Printf("✅ usersuccess: user=%s, universal=%s", req.UserAddress, universalAddress)

	c.JSON(http.StatusOK, AuthResponse{
		Success: true,
		Token:   token,
		Message: "success",
	})
}

// verifywallet signature
func (h *AuthHandler) validateSignature(userAddress, message, signature string, chainID int) bool {
	// verify：check
	if len(userAddress) < 10 || len(signature) < 10 {
		return false
	}

	// ，：
	// 1. chainIDverify
	// 2. EVM（BSC），useecrecoververify
	// 3. TRON，useTRONverify
	// 4. verifymessagewhether

	log.Printf("🔐 verify: user=%s, chain=%d, message_len=%d, sig_len=%d",
		userAddress, chainID, len(message), len(signature))

	// returntrue，verify
	return true
}

// Universal Address
func (h *AuthHandler) convertToUniversalAddress(userAddress string, chainID int) (string, error) {
	// useraddress32
	var addressData string

	// Normalize address (add 0x prefix if missing, lowercase)
	var normalizedAddress string
	if strings.HasPrefix(strings.ToLower(userAddress), "0x") {
		normalizedAddress = strings.ToLower(userAddress)
	} else {
		normalizedAddress = "0x" + strings.ToLower(userAddress)
	}

	// First check if it's already a 32-byte Universal Address
	if utils.IsUniversalAddress(normalizedAddress) {
		// Already 32-byte Universal Address format - use directly
		addressData = normalizedAddress
		log.Printf("✅ Received 32-byte Universal Address: %s", normalizedAddress)
	} else if chainID == 195 { // TRON
		// TRONaddressprocess - useBase58
		if strings.HasPrefix(userAddress, "T") {
			// useutils
			universalAddr, err := utils.TronToUniversalAddress(userAddress)
			if err != nil {
				return "", fmt.Errorf("TRONaddressfailed: %v", err)
			}
			addressData = universalAddr
		} else {
			// If not Base58 TRON address, assume it's already Universal Address
			addressData = normalizedAddress
		}
	} else { // EVM（BSC）
		// Check if it's a 20-byte EVM address
		if utils.IsEvmAddress(normalizedAddress) {
			// Convert 20-byte EVM address to 32-byte Universal Address
			universalAddr, err := utils.EvmToUniversalAddress(normalizedAddress)
			if err != nil {
				return "", fmt.Errorf("EVMaddressfailed: %v", err)
			}
			addressData = universalAddr
			log.Printf("✅ Converted EVM address to Universal Address: %s -> %s", normalizedAddress, universalAddr)
		} else {
			// Not EVM address and not Universal Address - unsupported format
			return "", fmt.Errorf("UnsupportedAddressFormat: expected 32-byte Universal Address or 20-byte EVM address, got: %s", normalizedAddress)
		}
	}

	// chainIDSLIP-44
	slip44ChainID := h.evmToSlip44(chainID)

	return fmt.Sprintf("%d:%s", slip44ChainID, addressData), nil
}

// EVM Chain IDSLIP-44
func (h *AuthHandler) evmToSlip44(evmChainID int) int {
	switch evmChainID {
	case 56, 97: // BSC Mainnet, BSC Testnet
		return 714
	case 195: // TRON
		return 195
	default:
		return evmChainID 
	}
}

// JWT Token
func (h *AuthHandler) generateJWTToken(userAddress, universalAddress string, chainID int) (string, error) {
	// Claims
	claims := JWTClaims{
		UserAddress:      userAddress,
		UniversalAddress: universalAddress,
		ChainID:          chainID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)), // 24
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "zkpay-backend",
			Subject:   userAddress,
		},
	}

	// createtoken
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)

	// token
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", fmt.Errorf("tokenfailed: %w", err)
	}

	return tokenString, nil
}

// ValidateJWTToken verifyJWT Token（use）
func ValidateJWTToken(tokenString string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		// verify
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf(": %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, fmt.Errorf("tokenfailed: %w", err)
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("token")
}

// GenerateNonceHandler nonce
func (h *AuthHandler) GenerateNonceHandler(c *gin.Context) {
	// nonce
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "noncefailed",
		})
		return
	}

	nonceStr := hex.EncodeToString(nonce)
	timestamp := time.Now().Unix()

	// message
	message := fmt.Sprintf("Enclave Authentication\nNonce: %s\nTimestamp: %d", nonceStr, timestamp)

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"nonce":     nonceStr,
		"message":   message,
		"timestamp": timestamp,
	})
}
