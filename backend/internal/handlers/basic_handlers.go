package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ============================================================================
// Basic Handlers - 
// ============================================================================
// :
// - DatabaseHealthCheckHandler: need
// - ContractHealthCheckHandler: need
// - SystemStatusHandler: need
// - GetMigrationStatusHandler: V1->V2 completed，need
// - VerifyMigrationHandler: need
// - MigrateCheckbookToHandler: need
// ============================================================================

// HealthCheckHandler V2 
// GET /api/health
func HealthCheckHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"service": "zkpay-backend",
		"version": "v2.0",
		"api":     "healthy",
	})
}
