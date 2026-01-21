#!/usr/bin/env python3

import jwt
import json
from datetime import datetime, timedelta

# JWT configuration from auth_handler.go
JWT_SECRET = "zkpay-jwt-secret-key-2025"

# Test user configuration
USER_ADDRESS = "0x742d35Cc6634C0532925a3b0F26750C66d78EB66"
CHAIN_ID = 714
UNIVERSAL_ADDRESS = f"{CHAIN_ID}:{USER_ADDRESS}"

# Create JWT claims
now = datetime.utcnow()
payload = {
    "user_address": USER_ADDRESS,
    "universal_address": UNIVERSAL_ADDRESS,
    "chain_id": CHAIN_ID,
    "iss": "zkpay-backend",
    "sub": USER_ADDRESS,
    "iat": now,
    "exp": now + timedelta(hours=24),
    "nbf": now
}

# Generate token
token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")

print("=" * 60)
print("JWT Token Generated for Testing")
print("=" * 60)
print()
print("Token:")
print(token)
print()
print("Claims:")
print(json.dumps(payload, indent=2, default=str))
print()
print("=" * 60)
print("Usage:")
print("=" * 60)
print()
print("export JWT_TOKEN='{}' && bash test-api.sh".format(token))
print()
print("Or:")
print()
print("JWT_TOKEN='{}' bash test-api.sh".format(token))
print()
