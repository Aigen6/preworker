package services

import (
	"fmt"
	"log"
	"time"

	"go-backend/internal/clients"
	"go-backend/internal/models"

	"gorm.io/gorm"
)

// QueueRootManager Queue root bidirectional linked list manager
type QueueRootManager struct {
	db              *gorm.DB
	blockScannerAPI *clients.BlockScannerAPIClient // BlockScanner APIclient
}

// NewQueueRootManager Create queue root manager
func NewQueueRootManager(db *gorm.DB, blockScannerAPI *clients.BlockScannerAPIClient) *QueueRootManager {
	return &QueueRootManager{
		db:              db,
		blockScannerAPI: blockScannerAPI,
	}
}

// ProcessCommitmentRootUpdated Process CommitmentRootUpdated event, establish bidirectional linked list relationship
func (m *QueueRootManager) ProcessCommitmentRootUpdated(event *clients.EventCommitmentRootUpdatedResponse) error {
	log.Printf("🌳 Processing queue root update: OldRoot=%s, NewRoot=%s, Chain=%d",
		event.EventData.OldRoot, event.EventData.NewRoot, event.ChainID)

	// 1. First ensure OldRoot exists, backfill if not exists
	if err := m.ensureOldRootExists(event.EventData.OldRoot, event.ChainID); err != nil {
		log.Printf("❌ Failed to ensure OldRoot exists: %v", err)
		return err
	}

	// 2. Create current NewRoot record
	newRootRecord := &models.QueueRoot{
		ID:                  fmt.Sprintf("qr_%s_%d", event.EventData.NewRoot, time.Now().UnixNano()),
		Root:                event.EventData.NewRoot,
		PreviousRoot:        event.EventData.OldRoot,
		IsRecentRoot:        true, // New record is always the latest
		CreatedByCommitment: event.EventData.Commitment,
		BlockNumber:         event.BlockNumber,
		ChainID:             event.ChainID, // Set chain ID for querying
		CreatedAt:           event.BlockTimestamp,
	}

	// 3. Process bidirectional linked list update in transaction
	return m.db.Transaction(func(tx *gorm.DB) error {
		// 3.1 If OldRoot is not all zeros, find predecessor record and establish reverse link
		if event.EventData.OldRoot != "0x0000000000000000000000000000000000000000000000000000000000000000" {
			var prevRecord models.QueueRoot
			if err := tx.Where("root = ?", event.EventData.OldRoot).First(&prevRecord).Error; err != nil {
				if err == gorm.ErrRecordNotFound {
					log.Printf("⚠️ Predecessor root record does not exist: %s", event.EventData.OldRoot)
					// This case has been handled in ensureOldRootExists, if still not found it really doesn't exist
				} else {
					return fmt.Errorf("Failed to query predecessor root record: %w", err)
				}
			} else {
				// Set predecessor record's IsRecentRoot to false, because there's a new root now
				if err := tx.Model(&prevRecord).Update("is_recent_root", false).Error; err != nil {
					return fmt.Errorf("Failed to update predecessor root record: %w", err)
				}
				log.Printf("✅ Forward link established: %s -> %s", prevRecord.Root, newRootRecord.Root)
			}
		}

		// 3.2 Check if root record exists, create if not exists
		var existingRecord models.QueueRoot
		err := tx.Where("root = ?", newRootRecord.Root).First(&existingRecord).Error
		if err == gorm.ErrRecordNotFound {
			// Root record does not exist, creating new record
			if err := tx.Create(newRootRecord).Error; err != nil {
				return fmt.Errorf("Failed to create new root record: %w", err)
			}
			log.Printf("✅ Created new queue root record: %s", newRootRecord.Root)
		} else if err != nil {
			return fmt.Errorf("Failed to check if root record exists: %w", err)
		} else {
			log.Printf("⚠️ Queue root record already exists, skipping creation: %s", newRootRecord.Root)
		}

		log.Printf("✅ Queue root bidirectional linked list update completed: NewRoot=%s", event.EventData.NewRoot)
		return nil
	})
}

// ensureOldRootExists Ensure OldRoot exists, backfill if not exists
func (m *QueueRootManager) ensureOldRootExists(oldRoot string, chainID int64) error {
	// If all-zero root, this is the first root, no predecessor needed
	if oldRoot == "0x0000000000000000000000000000000000000000000000000000000000000000" {
		log.Printf("📍 Detected all-zero root, this is the first queue root")
		return nil
	}

	// Check if exists locally
	var existingRecord models.QueueRoot
	err := m.db.Where("root = ?", oldRoot).First(&existingRecord).Error
	if err == nil {
		log.Printf("✅ OldRoot already exists: %s", oldRoot)
		return nil
	}
	if err != gorm.ErrRecordNotFound {
		return fmt.Errorf("Failed to query OldRoot: %w", err)
	}

	// Not exists locally, need to backfill from BlockScanner
	log.Printf("🔍 OldRoot not exists locally, starting backward tracing: %s", oldRoot)
	return m.backfillQueueRootChain(oldRoot, chainID)
}

// backfillQueueRootChain Backward tracing to backfill queue root chain
func (m *QueueRootManager) backfillQueueRootChain(targetRoot string, chainID int64) error {
	log.Printf("🔄 Starting backward tracing of queue root chain: target=%s, chain=%d", targetRoot, chainID)

	currentRoot := targetRoot
	backfillCount := 0
	maxBackfill := 100 // Prevent infinite loop

	for backfillCount < maxBackfill {
		// 1. Query CommitmentRootUpdated event for this root from BlockScanner
		commitmentEvent, err := m.blockScannerAPI.GetCommitmentRootUpdatedByNewRoot(currentRoot, chainID)
		if err != nil {
			log.Printf("❌ Failed to get root event from BlockScanner: root=%s, error=%v", currentRoot, err)
			break
		}
		if commitmentEvent == nil {
			log.Printf("📍 Root not found in BlockScanner either: %s", currentRoot)
			break
		}

		// 2. Save this root record locally
		rootRecord := &models.QueueRoot{
			ID:                  fmt.Sprintf("qr_%s_%d", commitmentEvent.EventData.NewRoot, time.Now().UnixNano()),
			Root:                commitmentEvent.EventData.NewRoot,
			PreviousRoot:        commitmentEvent.EventData.OldRoot,
			IsRecentRoot:        false, // Backfilled record is not the latest
			CreatedByCommitment: commitmentEvent.EventData.Commitment,
			BlockNumber:         commitmentEvent.BlockNumber,
			ChainID:             chainID, // Set chain ID for querying
			CreatedAt:           commitmentEvent.BlockTimestamp,
		}

		if err := m.db.Create(rootRecord).Error; err != nil {
			log.Printf("❌ Failed to save backfilled root record: %v", err)
			break
		}

		log.Printf("✅ Backfilled root record: %s (previous: %s)", currentRoot, commitmentEvent.EventData.OldRoot)
		backfillCount++

		// 3. Check if reached all-zero root or existing root
		oldRoot := commitmentEvent.EventData.OldRoot
		if oldRoot == "0x0000000000000000000000000000000000000000000000000000000000000000" {
			log.Printf("📍 Reached all-zero root, tracing completed")
			break
		}

		var existingRecord models.QueueRoot
		if err := m.db.Where("root = ?", oldRoot).First(&existingRecord).Error; err == nil {
			log.Printf("✅ Reached existing root, tracing completed: %s", oldRoot)
			break
		}

		// 4. Continue backward tracing
		currentRoot = oldRoot
	}

	if backfillCount >= maxBackfill {
		log.Printf("⚠️ Reached maximum backfill limit (%d)，Stopping tracing", maxBackfill)
	}

	log.Printf("🎯 Queue root chain tracing completed: Backfilled %d records", backfillCount)
	return nil
}

// GetQueueRootChain Get complete chain starting from specified root (for debugging and verification)
func (m *QueueRootManager) GetQueueRootChain(startRoot string) ([]*models.QueueRoot, error) {
	var chain []*models.QueueRoot
	currentRoot := startRoot

	for len(chain) < 1000 { // Prevent infinite loop
		var record models.QueueRoot
		if err := m.db.Where("root = ?", currentRoot).First(&record).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				log.Printf("Chain interrupted: %s", currentRoot)
				break
			}
			return nil, err
		}

		chain = append(chain, &record)

		// If reached all-zero root, end
		if record.PreviousRoot == "0x0000000000000000000000000000000000000000000000000000000000000000" {
			break
		}

		currentRoot = record.PreviousRoot
	}

	return chain, nil
}

// GetCommitmentQueueInfo Get queue root info and subsequent commitment array by commitment
func (m *QueueRootManager) GetCommitmentQueueInfo(targetCommitment string) (*CommitmentQueueInfo, error) {
	log.Printf("🔍 Querying commitment queue info: %s", targetCommitment)

	// 1. Find corresponding queue root record by commitment
	var targetRecord models.QueueRoot
	err := m.db.Where("created_by_commitment = ?", targetCommitment).First(&targetRecord).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("Queue root record not found for commitment: %s", targetCommitment)
		}
		return nil, fmt.Errorf("Failed to query queue root record: %w", err)
	}

	log.Printf("✅ Found target record: Root=%s, PreviousRoot=%s", targetRecord.Root, targetRecord.PreviousRoot)

	// 2. Building return result
	result := &CommitmentQueueInfo{
		TargetCommitment: targetCommitment,
		OldRoot:          targetRecord.PreviousRoot, // The old_root corresponding to this commitment
		NewRoot:          targetRecord.Root,         // The new_root created by this commitment
		CommitmentsAfter: []string{},
	}

	// 3. Trace forward to get all subsequent commitment array
	currentRoot := targetRecord.Root
	maxTraversal := 1000 // Prevent infinite loop

	for i := 0; i < maxTraversal; i++ {
		// Find next record with currentRoot as PreviousRoot
		var nextRecord models.QueueRoot
		err := m.db.Where("previous_root = ?", currentRoot).First(&nextRecord).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				log.Printf("📍 Reached queue end, no more subsequent records: root=%s", currentRoot)
				break
			}
			log.Printf("❌ Failed to query subsequent record: %v", err)
			break
		}

		// Add to subsequent commitment array
		result.CommitmentsAfter = append(result.CommitmentsAfter, nextRecord.CreatedByCommitment)
		log.Printf("🔗 Found subsequent commitment: %s (root: %s -> %s)",
			nextRecord.CreatedByCommitment, currentRoot, nextRecord.Root)

		// Continue forward searching
		currentRoot = nextRecord.Root
	}

	log.Printf("🎯 Commitment queue info query completed: target=%s, old_root=%s, commitments_after_count=%d",
		targetCommitment, result.OldRoot, len(result.CommitmentsAfter))

	return result, nil
}

// CommitmentQueueInfo Commitment queue info
type CommitmentQueueInfo struct {
	TargetCommitment string   `json:"target_commitment"` // Target commitment
	OldRoot          string   `json:"old_root"`          // The old_root corresponding to this commitment
	NewRoot          string   `json:"new_root"`          // The new_root created by this commitment
	CommitmentsAfter []string `json:"commitments_after"` // All subsequent commitment array
}

// GetCommitmentChainFromRoot Get complete commitment chain starting from specified root (for debugging)
func (m *QueueRootManager) GetCommitmentChainFromRoot(startRoot string) ([]string, error) {
	commitmentChain := make([]string, 0) // Initialize as empty array to avoid serializing as null
	currentRoot := startRoot
	maxTraversal := 1000

	for i := 0; i < maxTraversal; i++ {
		var record models.QueueRoot
		err := m.db.Where("previous_root = ?", currentRoot).First(&record).Error
		if err != nil {
			if err == gorm.ErrRecordNotFound {
				break
			}
			return nil, err
		}

		commitmentChain = append(commitmentChain, record.CreatedByCommitment)
		currentRoot = record.Root
	}

	return commitmentChain, nil
}

// UpdateNextRootReference Update subsequent record ID (called when new root is created)
func (m *QueueRootManager) UpdateNextRootReference(oldRootID, newRootID string) error {
	// NextRoot field can be added to QueueRoot model here to implement complete bidirectional linked list
	// Current design mainly uses PreviousRoot, NextRoot can be added later if needed
	log.Printf("🔗 Update subsequent root reference: %s -> %s", oldRootID, newRootID)
	return nil
}
