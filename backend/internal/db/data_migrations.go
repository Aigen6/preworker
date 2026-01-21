package db

import (
	"database/sql"
	"fmt"
	"log"
	"strings"
)

// DataMigration represents a data migration
type DataMigration struct {
	Version     string
	Description string
	Up          func(*sql.DB) error
	Down        func(*sql.DB) error
}

// GetDataMigrations return all data migrations
func GetDataMigrations() []DataMigration {
	return []DataMigration{
		{
			Version:     "data_001",
			Description: "Migrate chain_id to slip44_chain_id",
			Up:          migrateChainIdToSlip44,
			Down:        rollbackChainIdToSlip44,
		},
		// can add more data migrations...
	}
}

// migrateChainIdToSlip44 migrate chain_id data to slip44_chain_id
func migrateChainIdToSlip44(db *sql.DB) error {
	log.Println("🔄 Migrating chain_id data to slip44_chain_id...")

	// event table list
	eventTables := []string{
		"event_deposit_receiveds",
		"event_deposit_recordeds",
		"event_deposit_useds",
		"event_commitment_root_updateds",
		"event_withdraw_requesteds",
		"event_withdraw_executeds",
	}

	// event - ，Default
	// 🔧 ： slip44_chain_id  chain_id（ -> ）
	for _, table := range eventTables {
		query := `
			UPDATE ` + table + ` 
			SET chain_id = slip44_chain_id 
			WHERE slip44_chain_id IS NOT NULL AND chain_id IS NULL
		`

		result, err := db.Exec(query)
		if err != nil {
			log.Printf("❌ Failed to migrate %s: %v", table, err)
			return err
		}

		rowsAffected, _ := result.RowsAffected()
		log.Printf("✅ Migrated %d rows in %s (slip44_chain_id -> chain_id)", rowsAffected, table)
	}

	//  - ，Checkdata
	// ifNULL，Faileddata
	businessTables := map[string]string{
		"checkbooks":    "chain_id",
		"deposit_infos": "chain_id", // 🔧 ：Usechain_id
	}

	for table, column := range businessTables {
		// CheckwhetherNULL
		var nullCount int
		checkQuery := `SELECT COUNT(*) FROM ` + table + ` WHERE ` + column + ` IS NULL`
		err := db.QueryRow(checkQuery).Scan(&nullCount)
		if err != nil {
			log.Printf("❌ Failed to check NULL values in %s.%s: %v", table, column, err)
			return err
		}

		if nullCount > 0 {
			log.Printf("❌ Found %d NULL values in %s.%s - migration aborted", nullCount, table, column)
			return fmt.Errorf("：%dNULL%s.%s，data", nullCount, table, column)
		}

		log.Printf("✅ No NULL values found in %s.%s", table, column)
	}

	log.Println("🎉 Chain ID data migration completed!")
	return nil
}

// rollbackChainIdToSlip44  chain_id data
func rollbackChainIdToSlip44(db *sql.DB) error {
	log.Println("🔄 Rolling back chain_id data migration...")

	
	// datastatus

	return nil
}

// RunDataMigrations data
func RunDataMigrations(db *sql.DB) error {
	migrations := GetDataMigrations()

	for _, migration := range migrations {
		// Checkwhetheralready
		var count int
		err := db.QueryRow(
			"SELECT COUNT(*) FROM schema_migrations_log WHERE version = $1",
			migration.Version,
		).Scan(&count)

		if err != nil {
			// ifexists，Create
			if strings.Contains(err.Error(), "does not exist") {
				log.Printf("📋 Creating schema_migrations_log table...")
				createTableSQL := `
					CREATE TABLE IF NOT EXISTS schema_migrations_log (
						id SERIAL PRIMARY KEY,
						version VARCHAR(50) NOT NULL UNIQUE,
						description TEXT,
						executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
						rollback_at TIMESTAMP,
						status VARCHAR(20) DEFAULT 'completed'
					)
				`
				if _, createErr := db.Exec(createTableSQL); createErr != nil {
					return createErr
				}
				count = 0 // ，record
			} else {
				return err
			}
		}

		if count > 0 {
			log.Printf("📋 Data migration %s already applied", migration.Version)
			continue
		}

		
		log.Printf("🚀 Running data migration: %s", migration.Description)
		if err := migration.Up(db); err != nil {
			return err
		}

		// record
		_, err = db.Exec(
			"INSERT INTO schema_migrations_log (version, description) VALUES ($1, $2)",
			migration.Version, migration.Description,
		)
		if err != nil {
			return err
		}

		log.Printf("✅ Data migration %s completed", migration.Version)
	}

	return nil
}
