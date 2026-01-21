package main

import (
	"fmt"
	"os"
	"time"

	"github.com/pquerna/otp/totp"
)

func main() {
	// 默认 secret（与后端代码中的默认值一致）
	secret := os.Getenv("ADMIN_TOTP_SECRET")
	if secret == "" {
		// 默认 secret: base32 编码的 "ENCLAVE2025ADMIN"
		secret = "IVQXEZLNJVQXEZLNJVQXEZLNJVQXEZLN"
	}

	// 生成当前 TOTP code
	code, err := totp.GenerateCode(secret, time.Now())
	if err != nil {
		fmt.Printf("Error generating TOTP code: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Current TOTP Code: %s\n", code)
	fmt.Printf("Secret: %s\n", secret)
	fmt.Printf("Valid for: ~30 seconds\n")
}

