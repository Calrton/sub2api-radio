package handler

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func newRadioTestContext(method, path string, body *bytes.Buffer, contentType string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	var requestBody io.Reader
	if body != nil {
		requestBody = bytes.NewReader(body.Bytes())
	}
	c.Request = httptest.NewRequest(method, path, requestBody)
	if contentType != "" {
		c.Request.Header.Set("Content-Type", contentType)
	}
	return c, recorder
}

func radioMultipartUpload(t *testing.T, filename string, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", filename)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	return body, writer.FormDataContentType()
}

func TestRadioHandlerListsPublicTracks(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewRadioHandler(service.NewRadioLibrary(t.TempDir()))
	c, recorder := newRadioTestContext(http.MethodGet, "/api/v1/radio/tracks", nil, "")

	h.List(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	require.Equal(t, "no-store", recorder.Header().Get("Cache-Control"))
	var payload struct {
		Code int                  `json:"code"`
		Data []service.RadioTrack `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Equal(t, 0, payload.Code)
	require.Len(t, payload.Data, 7)
}

func TestRadioHandlerUploadsAndServesRange(t *testing.T) {
	gin.SetMode(gin.TestMode)
	library := service.NewRadioLibrary(t.TempDir())
	h := NewRadioHandler(library)
	content := append([]byte("ID3\x04\x00\x00"), bytes.Repeat([]byte("a"), 128)...)
	body, contentType := radioMultipartUpload(t, "my song.mp3", content)
	c, recorder := newRadioTestContext(http.MethodPost, "/api/v1/admin/radio/tracks", body, contentType)

	h.Upload(c)

	require.Equal(t, http.StatusCreated, recorder.Code, recorder.Body.String())
	var payload struct {
		Data service.RadioTrack `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Equal(t, "my song", payload.Data.Title)
	require.True(t, payload.Data.Uploaded)

	fileRecorder := httptest.NewRecorder()
	fileContext, _ := gin.CreateTestContext(fileRecorder)
	fileContext.Request = httptest.NewRequest(http.MethodGet, payload.Data.Src, nil)
	fileContext.Request.Header.Set("Range", "bytes=0-9")
	fileContext.Params = gin.Params{{Key: "id", Value: payload.Data.ID}}

	h.File(fileContext)

	require.Equal(t, http.StatusPartialContent, fileRecorder.Code)
	require.Equal(t, "audio/mpeg", fileRecorder.Header().Get("Content-Type"))
	require.Equal(t, "public, max-age=31536000, immutable", fileRecorder.Header().Get("Cache-Control"))
	require.Len(t, fileRecorder.Body.Bytes(), 10)
}

func TestRadioHandlerRejectsForgedFile(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewRadioHandler(service.NewRadioLibrary(t.TempDir()))
	body, contentType := radioMultipartUpload(t, "fake.mp3", []byte("not audio"))
	c, recorder := newRadioTestContext(http.MethodPost, "/api/v1/admin/radio/tracks", body, contentType)

	h.Upload(c)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
}

func TestRadioHandlerDeleteRejectsBundledTrack(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewRadioHandler(service.NewRadioLibrary(t.TempDir()))
	c, recorder := newRadioTestContext(http.MethodDelete, "/api/v1/admin/radio/tracks/bu-shao-xin", nil, "")
	c.Params = gin.Params{{Key: "id", Value: "bu-shao-xin"}}

	h.Delete(c)

	require.Equal(t, http.StatusNotFound, recorder.Code)
}

func TestRadioHandlerStatsCountBundledTracks(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := NewRadioHandler(service.NewRadioLibrary(t.TempDir()))
	c, recorder := newRadioTestContext(http.MethodGet, "/api/v1/admin/radio/tracks", nil, "")

	h.AdminList(c)

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload struct {
		Data struct {
			Tracks []service.RadioTrack      `json:"tracks"`
			Stats  service.RadioLibraryStats `json:"stats"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &payload))
	require.Len(t, payload.Data.Tracks, 7)
	require.Equal(t, 100, payload.Data.Stats.MaxTracks)
	require.Equal(t, int64(100*1024*1024), payload.Data.Stats.MaxTrack)
	require.Equal(t, int64(1024*1024*1024), payload.Data.Stats.MaxBytes)
}

func TestRadioHandlerDoesNotWriteFileForInvalidManifest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	root := t.TempDir()
	require.NoError(t, os.MkdirAll(filepath.Join(root, "tracks"), 0o750))
	require.NoError(t, os.WriteFile(filepath.Join(root, "manifest.json"), []byte("bad"), 0o640))
	h := NewRadioHandler(service.NewRadioLibrary(root))
	body, contentType := radioMultipartUpload(t, "song.mp3", []byte("ID3\x04"))
	c, recorder := newRadioTestContext(http.MethodPost, "/api/v1/admin/radio/tracks", body, contentType)

	h.Upload(c)

	require.Equal(t, http.StatusInternalServerError, recorder.Code)
	matches, err := filepath.Glob(filepath.Join(root, "tracks", "*.mp3"))
	require.NoError(t, err)
	require.Empty(t, matches)
}
