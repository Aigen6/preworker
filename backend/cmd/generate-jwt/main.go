package main

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// JWTClaims represents JWT claims for zkpay
type JWTClaims struct {
	UserAddress      string `json:"user_address"`
	UniversalAddress string `json:"universal_address"`
	ChainID          int    `json:"chain_id"`
	jwt.RegisteredClaims
}

func main() {
	// Configuration from auth_handler.go
	jwtSecret := []byte("zkpay-jwt-secret-key-2025")

	// Test user configuration
	userAddress := "0x742d35Cc6634C0532925a3b0F26750C66d78EB66"
	chainID := 714
	universalAddress := fmt.Sprintf("%d:%s", chainID, userAddress)

	// Create JWT claims
	now := time.Now()
	claims := JWTClaims{
		UserAddress:      userAddress,
		UniversalAddress: universalAddress,
		ChainID:          chainID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			Issuer:    "zkpay-backend",
			Subject:   userAddress,
		},
	}

	// Generate token
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtSecret)
	if err != nil {
		fmt.Printf("Error generating token: %v\n", err)
		return
	}

	fmt.Println("============================================================")
	fmt.Println("JWT Token Generated for Testing")
	fmt.Println("============================================================")
	fmt.Println()
	fmt.Println("Token:")
	fmt.Println(tokenString)
	fmt.Println()
	fmt.Println("Claims:")
	fmt.Printf("  User Address: %s\n", userAddress)
	fmt.Printf("  Chain ID: %d\n", chainID)
	fmt.Printf("  Universal Address: %s\n", universalAddress)
	fmt.Printf("  Expires: %s\n", claims.ExpiresAt.Time)
	fmt.Println()
	fmt.Println("============================================================")
	fmt.Println("Usage:")
	fmt.Println("============================================================")
	fmt.Println()
	fmt.Printf("export JWT_TOKEN='%s' && bash test-api.sh\n", tokenString)
	fmt.Println()
	fmt.Println("Or:")
	fmt.Println()
	fmt.Printf("JWT_TOKEN='%s' bash test-api.sh\n", tokenString)
	fmt.Println()
}
