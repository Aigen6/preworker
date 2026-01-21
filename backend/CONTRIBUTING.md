# Contributing to Enclave Backend

First off, thank you for considering contributing to Enclave Backend! It's people like you that make Enclave such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title** for the issue to identify the problem.
* **Describe the exact steps which reproduce the problem** in as many details as possible.
* **Provide specific examples to demonstrate the steps**.
* **Describe the behavior you observed after following the steps** and point out what exactly is the problem with that behavior.
* **Explain which behavior you expected to see instead and why.**
* **Include logs and error messages** if applicable.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use a clear and descriptive title** for the issue to identify the suggestion.
* **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
* **Provide specific examples to demonstrate the steps** or provide examples of how the enhancement would be used.
* **Describe the current behavior** and **explain which behavior you expected to see instead** and why.
* **Explain why this enhancement would be useful** to most Enclave Backend users.

### Pull Requests

* Fill in the required template
* Do not include issue numbers in the PR title
* Follow the Go coding style
* Include thoughtfully-worded, well-structured tests
* Document new code
* End all files with a newline

## Development Process

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/your-username/zkpay-backend.git
cd zkpay-backend
```

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `chore/` - Maintenance tasks

### 3. Set Up Development Environment

```bash
# Install dependencies
go mod download

# Copy example configuration
cp config.yaml.example config.yaml

# Set up database (PostgreSQL recommended)
createdb zkpay
./scripts/run_migration.sh

# Run the service
go run cmd/server/main.go -conf config.yaml
```

### 4. Make Your Changes

* Write clear, readable code
* Follow Go best practices
* Add tests for new functionality
* Update documentation as needed
* Keep commits atomic and well-described

### 5. Test Your Changes

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific package tests
go test -v ./internal/services/...

# Run linter
golangci-lint run
```

### 6. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
git commit -m "feat: add new blockchain adapter for Polygon"
git commit -m "fix: resolve JWT token expiration issue"
git commit -m "docs: update API documentation for v2 endpoints"
```

Commit types:

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements

### 7. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:

* Clear title and description
* Reference to related issues
* Description of changes made
* Any breaking changes highlighted

## Coding Standards

### Go Style Guide

Follow the official [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments):

* Use `gofmt` to format your code
* Use meaningful variable and function names
* Keep functions small and focused
* Add comments for exported functions and types
* Handle errors explicitly
* Avoid global variables

### Project-Specific Guidelines

#### 0. Understanding Intent Architecture

Enclave uses a two-phase withdrawal system with Intent-based execution:

**Phase 1: ZK Proof Verification (Enclave.executeWithdraw)**

- Generates and verifies zero-knowledge proof
- Consumes nullifiers on-chain (irreversible)
- Emits `WithdrawRequested` event

**Phase 2: Intent Execution (Treasury.payout)**

- Executes user's intent (RawToken/AssetToken)
- Handles cross-chain bridging via Li.Fi
- Uses Adapters for protocol-specific conversions
- Can be retried on failure

**Key Rules to Remember**:

1. **Allocation Locking**: Once an allocation is added to a WithdrawRequest, it's locked
2. **No Cancellation After Phase 1**: If Phase 1 succeeds, the request cannot be cancelled (nullifiers consumed)
3. **Phase 2 is Retryable**: Payout failures can be automatically or manually retried

**Code Example**:

```go
// ❌ Bad: Canceling after Phase 1 success
if req.ExecuteStatus == "success" {
    CancelWithdrawRequest(req.ID) // This will fail!
}

// ✅ Good: Check status before canceling
if req.ExecuteStatus == "failed" {
    CancelWithdrawRequest(req.ID) // OK, nullifiers not consumed
}

// ✅ Good: Retry payout instead
if req.ExecuteStatus == "success" && req.PayoutStatus == "failed" {
    RetryPayout(req.ID) // Correct approach
}
```

---

#### 1. Error Handling

```go
// ❌ Bad
result, _ := someFunction()

// ✅ Good
result, err := someFunction()
if err != nil {
    log.Printf("Error in someFunction: %v", err)
    return nil, fmt.Errorf("failed to process: %w", err)
}
```

#### 2. Logging

```go
// Use structured logging
log.WithFields(logrus.Fields{
    "user_id": userID,
    "action": "deposit",
}).Info("Processing deposit")
```

#### 3. Configuration

```go
// Access config through AppConfig singleton
if config.AppConfig.Blockchain.Networks["bsc"].Enabled {
    // ...
}
```

#### 4. Database Operations

```go
// Use transactions for multiple operations
tx := db.DB.Begin()
defer func() {
    if r := recover(); r != nil {
        tx.Rollback()
    }
}()

if err := tx.Create(&deposit).Error; err != nil {
    tx.Rollback()
    return err
}

tx.Commit()
```

#### 5. API Handlers

```go
// Return consistent JSON responses
func HandleDeposit(c *gin.Context) {
    var req DepositRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "Invalid request format",
            "details": err.Error(),
        })
        return
    }
  
    // Process request...
  
    c.JSON(http.StatusOK, gin.H{
        "success": true,
        "data": result,
    })
}
```

### Testing Guidelines

#### Unit Tests

```go
func TestDepositService_CreateDeposit(t *testing.T) {
    // Setup
    db := setupTestDB(t)
    service := NewDepositService(db)
  
    // Test case
    deposit := &models.Deposit{
        UserID: "test-user",
        Amount: "1000000",
    }
  
    // Execute
    err := service.CreateDeposit(deposit)
  
    // Assert
    assert.NoError(t, err)
    assert.NotEmpty(t, deposit.ID)
}
```

#### Integration Tests

* Place integration tests in `*_integration_test.go` files
* Use build tags: `//go:build integration`
* Mock external services when possible

#### Test Coverage

Aim for:

* **80%+ coverage** for business logic
* **100% coverage** for critical paths (authentication, payments)
* **Edge cases** and error conditions

## Documentation

### Code Documentation

```go
// CalculateCommitment generates a Merkle tree commitment for deposits
// It takes a slice of deposit IDs and returns the root hash.
//
// Parameters:
//   - depositIDs: List of deposit identifiers to include
//
// Returns:
//   - string: Hex-encoded commitment root hash
//   - error: Error if commitment generation fails
func CalculateCommitment(depositIDs []string) (string, error) {
    // Implementation...
}
```

### API Documentation

Update `API_DOCUMENTATION.md` when adding or modifying endpoints:

```markdown
### Create Deposit

**Endpoint**: `POST /api/v2/deposits`

**Authentication**: Required

**Request Body**:
```json
{
  "chain": "bsc",
  "token_id": 1,
  "amount": "1000000"
}
```

**Response**: 200 OK

```json
{
  "success": true,
  "data": {
    "deposit_id": "abc123",
    "status": "pending"
  }
}
```

```

## Review Process

### What We Look For

1. **Code Quality**
   - Clean, readable code
   - Follows project conventions
   - Properly documented

2. **Testing**
   - Adequate test coverage
   - Tests pass locally
   - No broken tests

3. **Documentation**
   - Updated README if needed
   - API docs updated
   - Code comments added

4. **Performance**
   - No obvious performance issues
   - Database queries optimized
   - Memory usage considered

5. **Security**
   - No security vulnerabilities
   - Input validation present
   - Sensitive data handled properly

### Review Timeline

- Initial review: Within 48 hours
- Follow-up reviews: Within 24 hours
- We may request changes or ask questions

## Release Process

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality
- **PATCH** version for backwards-compatible bug fixes

## Getting Help

* **Documentation**: Check the [README](README.md) and docs folder
* **Issues**: Search existing issues or create a new one
* **Discussions**: Use GitHub Discussions for questions
* **Chat**: Join our Discord/Slack (if available)

## Recognition

Contributors will be:
* Listed in CONTRIBUTORS.md
* Mentioned in release notes
* Given credit in documentation

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Enclave Backend! 🎉

```
