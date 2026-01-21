// File Upload Handler - Handle image/icon uploads for tokens
package handlers

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// FileUploadHandler handles file upload operations
type FileUploadHandler struct {
	uploadDir string
	baseURL   string
}

// NewFileUploadHandler creates a new FileUploadHandler
func NewFileUploadHandler(uploadDir string, baseURL string) *FileUploadHandler {
	// Create upload directory if not exists
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		panic(fmt.Sprintf("Failed to create upload directory: %v", err))
	}

	return &FileUploadHandler{
		uploadDir: uploadDir,
		baseURL:   baseURL,
	}
}

// UploadImageHandler handles image upload
// POST /api/admin/upload/image
func (h *FileUploadHandler) UploadImageHandler(c *gin.Context) {
	// Get file from form
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No file uploaded",
		})
		return
	}

	// Validate file type
	if !h.isValidImageType(file.Filename) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid file type. Only jpg, jpeg, png, gif, svg, webp are allowed",
		})
		return
	}

	// Validate file size (max 5MB)
	if file.Size > 5*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "File size exceeds 5MB limit",
		})
		return
	}

	// Open uploaded file
	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to open uploaded file",
		})
		return
	}
	defer src.Close()

	// Generate unique filename
	filename := h.generateUniqueFilename(file.Filename)
	filepath := filepath.Join(h.uploadDir, filename)

	// Create destination file
	dst, err := os.Create(filepath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to save file",
		})
		return
	}
	defer dst.Close()

	// Copy file content
	if _, err = io.Copy(dst, src); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to save file",
		})
		return
	}

	// Generate URL
	url := fmt.Sprintf("%s/uploads/%s", h.baseURL, filename)

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"filename": filename,
		"url":      url,
		"size":     file.Size,
	})
}

// DeleteImageHandler deletes an uploaded image
// DELETE /api/admin/upload/image/:filename
func (h *FileUploadHandler) DeleteImageHandler(c *gin.Context) {
	filename := c.Param("filename")

	// Validate filename (prevent directory traversal)
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid filename",
		})
		return
	}

	filepath := filepath.Join(h.uploadDir, filename)

	// Check if file exists
	if _, err := os.Stat(filepath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "File not found",
		})
		return
	}

	// Delete file
	if err := os.Remove(filepath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete file",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "File deleted successfully",
	})
}

// ListImagesHandler lists all uploaded images
// GET /api/admin/upload/images
func (h *FileUploadHandler) ListImagesHandler(c *gin.Context) {
	files, err := os.ReadDir(h.uploadDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to read upload directory",
		})
		return
	}

	var images []gin.H
	for _, file := range files {
		if file.IsDir() {
			continue
		}

		if h.isValidImageType(file.Name()) {
			info, _ := file.Info()
			images = append(images, gin.H{
				"filename": file.Name(),
				"url":      fmt.Sprintf("%s/uploads/%s", h.baseURL, file.Name()),
				"size":     info.Size(),
				"modified": info.ModTime(),
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"images": images,
		"total":  len(images),
	})
}

// Helper functions

func (h *FileUploadHandler) isValidImageType(filename string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	validExts := []string{".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp"}

	for _, validExt := range validExts {
		if ext == validExt {
			return true
		}
	}
	return false
}

func (h *FileUploadHandler) generateUniqueFilename(originalFilename string) string {
	ext := filepath.Ext(originalFilename)
	nameWithoutExt := strings.TrimSuffix(originalFilename, ext)

	// Generate hash from original name + timestamp
	hash := md5.Sum([]byte(nameWithoutExt + time.Now().String()))
	hashStr := hex.EncodeToString(hash[:])

	// Use first 12 characters of hash + timestamp + extension
	timestamp := time.Now().Unix()
	return fmt.Sprintf("%s_%d%s", hashStr[:12], timestamp, ext)
}
