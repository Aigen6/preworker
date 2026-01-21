package utils

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
)

// BlockScannerCommitmentChain BlockScannercommitment
type BlockScannerCommitmentChain struct {
	Commitments []string
	Count       int
}

// normalizeRootValue root
func normalizeRootValue(root string) string {
	
	root = strings.ToLower(root)
	//  0x 
	if !strings.HasPrefix(root, "0x") {
		root = "0x" + root
	}
	return root
}

// QueryBlockScannerForCommitmentChain BlockScannercommitment
// ，recursion，10000commitments
func QueryBlockScannerForCommitmentChain(fromRoot string, scannerBaseURL string) []string {
	log.Printf("🔍 Block Scanner: root %s start", fromRoot[:10]+"...")

	// root
	normalizedRoot := normalizeRootValue(fromRoot)

	// usequery APICommitmentRootUpdated
	queryURL := fmt.Sprintf("%s/api/query/events", scannerBaseURL)

	resp, err := http.Get(fmt.Sprintf("%s?chainId=56&eventType=CommitmentRootUpdated", queryURL))
	if err != nil {
		log.Printf("❌ Block Scannerfailed: %v", err)
		return make([]string, 0)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("❌ Block Scannerfailed: %v", err)
		return make([]string, 0)
	}

	// query API response
	var response struct {
		Success bool                     `json:"success"`
		Events  []map[string]interface{} `json:"events"`
	}

	if err := json.Unmarshal(body, &response); err != nil {
		log.Printf("❌ Block Scannerfailed: %v", err)
		return make([]string, 0)
	}

	if !response.Success {
		log.Printf("❌ Block Scannerfailed")
		return make([]string, 0)
	}

	//  - userecursion，
	result := make([]string, 0)
	currentRoot := normalizedRoot

	for len(result) < 10000 { // ， 10000  commitments
		found := false
		for _, event := range response.Events {
			if oldRoot, ok := event["old_root"].(string); ok && oldRoot == currentRoot {
				if commitment, ok := event["commitment"].(string); ok {
					if newRoot, ok := event["new_root"].(string); ok {
						result = append(result, commitment)
						currentRoot = newRoot
						found = true
						break
					}
				}
			}
		}
		if !found {
			
			log.Printf("✅ completed， %d  commitments", len(result))
			break
		}
	}

	return result
}
