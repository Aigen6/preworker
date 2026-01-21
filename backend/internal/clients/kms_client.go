package clients

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go-backend/internal/config"
)

// KMSClient KMS service client
type KMSClient struct {
	baseURL    string
	authToken  string
	httpClient *http.Client
}

// KMSSignRequest KMS dual-layer decryption signature request
type KMSSignRequest struct {
	KeyAlias string `json:"key_alias"`
	ChainID  int    `json:"chain_id"`
	Data     string `json:"data"` // data to sign(Hex)
	K1       string `json:"k1"`   // transport keyK1 (Base64)
}

// KMSSignResponse KMS dual-layer decryption signature response
type KMSSignResponse struct {
	Success   bool   `json:"success"`
	Signature string `json:"signature,omitempty"`
	Error     string `json:"error,omitempty"`
}

// KMSGetKeysResponse KMSGetkeyresponse
type KMSGetKeysResponse struct {
	Success bool         `json:"success"`
	Count   int          `json:"count"`
	Keys    []KMSKeyInfo `json:"keys"`
	Error   string       `json:"error,omitempty"`
}

// KMSKeyInfo KMSkeyInfo
type KMSKeyInfo struct {
	KeyAlias      string    `json:"key_alias"`
	ChainID       int       `json:"chain_id"`
	PublicAddress string    `json:"public_address"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

// KMSEncryptRequest KMSrequest
type KMSEncryptRequest struct {
	PrivateKey string `json:"private_key"`
	KeyAlias   string `json:"key_alias"`
	ChainID    int    `json:"chain_id"`
}

// KMSEncryptResponse KMSresponse
type KMSEncryptResponse struct {
	Success       bool   `json:"success"`
	K1            string `json:"k1,omitempty"`             // transport keyK1 (Base64)
	PublicAddress string `json:"public_address,omitempty"` // corresponding toaddress
	Error         string `json:"error,omitempty"`
}

// NewKMSClient CreateKMSclient
func NewKMSClient(cfg config.KMSConfig) *KMSClient {
	timeout := 30 * time.Second
	if cfg.Timeout > 0 {
		timeout = time.Duration(cfg.Timeout) * time.Second
	}

	return &KMSClient{
		baseURL:   cfg.ServiceURL,
		authToken: cfg.AuthToken,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

// SignWithKMS UseKMSdata
func (c *KMSClient) SignWithKMS(keyAlias string, k1 string, dataToSign string, chainID int) (*KMSSignResponse, error) {
	// request
	req := KMSSignRequest{
		KeyAlias: keyAlias,
		ChainID:  chainID,
		Data:     dataToSign, // data to sign
		K1:       k1,         // K1transport key
	}

	// send requestAPI
	response, err := c.makeRequest("POST", "/api/v1/dual-layer/sign", req)
	if err != nil {
		return nil, fmt.Errorf("KMSrequestfailed: %w", err)
	}

	// Parseresponse
	var signResp KMSSignResponse
	if err := json.Unmarshal(response, &signResp); err != nil {
		return nil, fmt.Errorf("ParseKMSresponsefailed: %w", err)
	}

	if !signResp.Success {
		return nil, fmt.Errorf("KMSfailed: %s", signResp.Error)
	}

	return &signResp, nil
}

// GetStoredKeys GetKMSstoragekey
func (c *KMSClient) GetStoredKeys() (*KMSGetKeysResponse, error) {
	// send request
	response, err := c.makeRequest("GET", "/api/v1/keys", nil)
	if err != nil {
		return nil, fmt.Errorf("GetKMSkeyfailed: %w", err)
	}

	// Parseresponse
	var keysResp KMSGetKeysResponse
	if err := json.Unmarshal(response, &keysResp); err != nil {
		return nil, fmt.Errorf("ParseKMSkeyresponsefailed: %w", err)
	}

	if !keysResp.Success {
		return nil, fmt.Errorf("GetKMSkeyfailed: %s", keysResp.Error)
	}

	return &keysResp, nil
}

// GetKeyByAlias GetKMSkeyInfo
func (c *KMSClient) GetKeyByAlias(keyAlias string, chainID int) (*KMSKeyInfo, error) {
	keysResp, err := c.GetStoredKeys()
	if err != nil {
		return nil, err
	}

	for _, key := range keysResp.Keys {
		if key.KeyAlias == keyAlias && key.ChainID == chainID {
			return &key, nil
		}
	}

	return nil, fmt.Errorf("notkey: alias=%s, chainID=%d", keyAlias, chainID)
}

// EncryptPrivateKey UseKMS
func (c *KMSClient) EncryptPrivateKey(privateKey string, keyAlias string, chainID int) (*KMSEncryptResponse, error) {
	// request
	req := KMSEncryptRequest{
		PrivateKey: privateKey,
		KeyAlias:   keyAlias,
		ChainID:    chainID,
	}

	// send requestAPI
	response, err := c.makeRequest("POST", "/api/v1/dual-layer/encrypt", req)
	if err != nil {
		return nil, fmt.Errorf("KMSrequestfailed: %w", err)
	}

	// Parseresponse
	var encryptResp KMSEncryptResponse
	if err := json.Unmarshal(response, &encryptResp); err != nil {
		return nil, fmt.Errorf("ParseKMSresponsefailed: %w", err)
	}

	if !encryptResp.Success {
		return nil, fmt.Errorf("KMSfailed: %s", encryptResp.Error)
	}

	return &encryptResp, nil
}

// HealthCheck KMSserviceCheck
func (c *KMSClient) HealthCheck() error {
	response, err := c.makeRequest("GET", "/api/v1/health", nil)
	if err != nil {
		return fmt.Errorf("KMSCheckfailed: %w", err)
	}

	var healthResp struct {
		Status string `json:"status"`
	}

	if err := json.Unmarshal(response, &healthResp); err != nil {
		return fmt.Errorf("ParseKMSCheckresponsefailed: %w", err)
	}

	if healthResp.Status != "healthy" {
		return fmt.Errorf("KMSservicestatus: %s", healthResp.Status)
	}

	return nil
}

// makeRequest HTTPrequest
func (c *KMSClient) makeRequest(method, path string, data interface{}) ([]byte, error) {
	url := c.baseURL + path

	var body io.Reader
	if data != nil {
		jsonData, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("requestdatafailed: %w", err)
		}
		body = bytes.NewBuffer(jsonData)
	}

	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, fmt.Errorf("CreateHTTPrequestfailed: %w", err)
	}

	// Setrequest
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "zkpay-go-backend/1.0")

	// Set
	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
		req.Header.Set("X-Service-Name", "zkpay-go-backend")
	}

	// send request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTPrequestfailed: %w", err)
	}
	defer resp.Body.Close()

	// Readresponse
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("Readresponsefailed: %w", err)
	}

	// CheckHTTPstatus
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("HTTPrequestfailed: status=%d, body=%s", resp.StatusCode, string(responseBody))
	}

	return responseBody, nil
}
