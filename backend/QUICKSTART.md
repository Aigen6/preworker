# Quick Start Guide

Get ZKPay Backend up and running in 5 minutes!

## Prerequisites

- Go 1.23+
- PostgreSQL 13+ or Docker
- NATS Server (or use Docker Compose)

## Option 1: Docker Compose (Recommended)

The fastest way to get started:

```bash
# 1. Clone the repository
git clone https://github.com/enclave-hq/backend.git
cd zkpay-backend

# 2. Create configuration
cp config.docker.yaml config.backend.yaml

# Edit config.backend.yaml and set:
# - Your BSC private key
# - Your contract addresses
nano config.backend.yaml

# 3. Start all services
docker-compose up -d

# 4. Check logs
docker-compose logs -f zkpay-backend

# 5. Test the API
curl http://localhost:3001/health
```

That's it! The backend is running on `http://localhost:3001`

## Option 2: Local Development

For development and testing:

```bash
# 1. Clone and install dependencies
git clone https://github.com/enclave-hq/backend.git && cd backend
go mod download

# 2. Start PostgreSQL (if not using Docker)
# macOS with Homebrew:
brew services start postgresql@13

# Or use Docker:
docker run -d \
  --name zkpay-postgres \
  -e POSTGRES_USER=zkpay \
  -e POSTGRES_PASSWORD=zkpay \
  -e POSTGRES_DB=zkpay \
  -p 5432:5432 \
  postgres:13-alpine

# 3. Start NATS with JetStream
docker run -d \
  --name zkpay-nats \
  -p 4222:4222 \
  nats:latest -js

# 4. Configure the service
cp config.yaml.example config.yaml
nano config.yaml  # Edit with your settings

# 5. Run database migrations
psql -U zkpay -d zkpay -f setup-postgresql.sql

# 6. Start the service
go run cmd/server/main.go -conf config.yaml

# Or build and run:
go build -o zkpay-backend ./cmd/server
./zkpay-backend -conf config.yaml
```

## Testing the Setup

```bash
# Health check
curl http://localhost:3001/health

# Register a user
curl -X POST http://localhost:3001/api/v2/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "testpass123",
    "email": "test@example.com"
  }'

# Login
curl -X POST http://localhost:3001/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "testpass123"
  }'

# Test withdraw with Intent (new architecture)
curl -X POST http://localhost:3001/api/v2/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "allocation_ids": ["allocation-uuid-1", "allocation-uuid-2"],
    "intent": {
      "type": "RawToken",
      "chain_id": 56,
      "token_contract": "0x55d398326f99059fF775485246999027B3197955",
      "beneficiary_address": "0x..."
    },
    "signature": "0x..."
  }'
```

## Configuration Checklist

Before running in production, make sure you've configured:

- [ ] Database connection string
- [ ] NATS server URL
- [ ] Blockchain RPC endpoints
- [ ] Private keys or KMS settings
- [ ] Contract addresses
- [ ] JWT secret
- [ ] CORS allowed origins

## Common Issues

### Database Connection Failed

```bash
# Check PostgreSQL is running
pg_isready

# Test connection
psql -U zkpay -d zkpay -c "SELECT version();"
```

### NATS Connection Error

```bash
# Check NATS is running
docker ps | grep nats

# Test connection
curl http://localhost:8222/varz
```

### Port Already in Use

```bash
# Find what's using port 3001
lsof -i :3001

# Kill the process
kill -9 <PID>
```

## Next Steps

- Read the [Full Documentation](README.md)
- Check [API Documentation](API_DOCUMENTATION.md)
- Review [Configuration Guide](config.yaml.example)
- Learn about [Contributing](CONTRIBUTING.md)

## Support

- **Issues**: [Report a bug](https://github.com/enclave-hq/backend/issues)
- **Discussions**: [Ask questions](https://github.com/enclave-hq/backend/discussions)

Happy building! 🚀

