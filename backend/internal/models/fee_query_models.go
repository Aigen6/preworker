package models

import (
	"database/sql/driver"
	"encoding/json"
	"time"
)

// JSONB type for storing JSON data in PostgreSQL
type JSONB map[string]interface{}

// Value implements the driver.Valuer interface
func (j JSONB) Value() (driver.Value, error) {
	if j == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

// Scan implements the sql.Scanner interface
func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}
	bytes, ok := value.([]byte)
	if !ok {
		return json.Unmarshal([]byte(value.(string)), j)
	}
	return json.Unmarshal(bytes, j)
}

// FeeQueryRecord records fee query history (DEPRECATED: no longer used, fee queries are handled by KYT Oracle)
// This model is kept for backward compatibility but is no longer actively maintained
type FeeQueryRecord struct {
	ID            uint64    `json:"id" gorm:"primaryKey;autoIncrement"`
	Address       string    `json:"address" gorm:"not null;size:66;uniqueIndex:idx_address_chain"` // Universal address (supports all chains: Ethereum 0x42, Tron Base58 34+, Bitcoin Base58 34+, etc.)
	Chain         string    `json:"chain" gorm:"not null;size:50;uniqueIndex:idx_address_chain"`   // Chain identifier (e.g., "bsc", "ethereum")
	TokenKey      string    `json:"token_key" gorm:"index;size:20"`                                // Token key (optional)
	LastQueryTime time.Time `json:"last_query_time" gorm:"index;not null"`                         // Last query timestamp
	LastDepositID *uint64   `json:"last_deposit_id" gorm:"index"`                                  // Last deposit ID (deprecated, kept for backward compatibility)
	QueryCount    int       `json:"query_count" gorm:"default:0"`                                  // Total query count
	LastRiskScore *int      `json:"last_risk_score" gorm:"default:null"`                           // Last risk score from query (0-100)
	LastRiskLevel string    `json:"last_risk_level" gorm:"size:20"`                                // Last risk level from query (low, medium, high, critical)
	// Fee information from last query
	LastBaseFee             *string  `json:"last_base_fee,omitempty" gorm:"size:78"`          // Last base fee from query
	LastFeeRateBps          *int     `json:"last_fee_rate_bps,omitempty"`                     // Last fee rate in basis points
	LastBaseFeeRatePercent  *float64 `json:"last_base_fee_rate_percent,omitempty"`            // Last base fee rate percentage
	LastRiskBasedFeePercent *float64 `json:"last_risk_based_fee_percent,omitempty"`           // Last risk-based fee percentage
	LastFinalFeeRatePercent *float64 `json:"last_final_fee_rate_percent,omitempty"`           // Last final fee rate percentage
	LastInvitationCode      *string  `json:"last_invitation_code,omitempty" gorm:"size:50"`   // Last invitation code
	LastInvitationSource    *string  `json:"last_invitation_source,omitempty" gorm:"size:50"` // Last invitation source
	// Detailed information from last query (JSON format)
	Metadata  JSONB     `json:"metadata,omitempty" gorm:"type:jsonb"` // Complete detailed information from last query
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName specifies the table name for FeeQueryRecord
func (FeeQueryRecord) TableName() string {
	return "fee_query_records"
}
