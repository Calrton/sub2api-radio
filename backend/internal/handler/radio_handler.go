package handler

import (
	"errors"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/Wei-Shaw/sub2api/internal/pkg/response"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"

	"github.com/gin-gonic/gin"
)

const radioUploadFormOverhead = int64(1 << 20)

// RadioHandler serves the public playlist and the admin-only music library.
type RadioHandler struct {
	library *service.RadioLibrary
}

func NewRadioHandler(library *service.RadioLibrary) *RadioHandler {
	return &RadioHandler{library: library}
}

// List returns the public playlist.
// GET /api/v1/radio/tracks
func (h *RadioHandler) List(c *gin.Context) {
	tracks, err := h.library.Tracks()
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	response.Success(c, tracks)
}

// AdminList returns the playlist and the limits used by the settings UI.
// GET /api/v1/admin/radio/tracks
func (h *RadioHandler) AdminList(c *gin.Context) {
	tracks, err := h.library.Tracks()
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	stats, err := h.library.Stats()
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	response.Success(c, gin.H{
		"tracks": tracks,
		"stats":  stats,
	})
}

// Upload stores one audio file. The file is streamed to a temporary file and
// only enters the manifest after its extension, signature, and size pass.
// POST /api/v1/admin/radio/tracks
func (h *RadioHandler) Upload(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(
		c.Writer,
		c.Request.Body,
		service.RadioMaxTrackBytes+radioUploadFormOverhead,
	)
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		if errors.Is(err, http.ErrMissingFile) {
			response.BadRequest(c, "请选择要上传的音乐文件")
			return
		}
		if strings.Contains(strings.ToLower(err.Error()), "too large") {
			response.Error(c, http.StatusRequestEntityTooLarge, service.ErrRadioTrackTooLarge.Error())
			return
		}
		response.BadRequest(c, "音乐文件上传失败")
		return
	}
	defer func() { _ = file.Close() }()

	track, err := h.library.Add(service.RadioUpload{
		Filename: header.Filename,
		Size:     header.Size,
		Open: func() (io.ReadCloser, error) {
			return file, nil
		},
	})
	if err != nil {
		writeRadioError(c, err)
		return
	}
	if _, ok := middleware.GetAuthSubjectFromContext(c); ok {
		middleware.SetAuditExtra(c, map[string]any{
			"track_id":   track.ID,
			"track_size": track.Size,
		})
	}
	response.Created(c, track)
}

// Delete removes an uploaded track. Bundled tracks cannot be deleted.
// DELETE /api/v1/admin/radio/tracks/:id
func (h *RadioHandler) Delete(c *gin.Context) {
	track, err := h.library.Delete(c.Param("id"))
	if err != nil {
		writeRadioError(c, err)
		return
	}
	middleware.SetAuditExtra(c, map[string]any{
		"track_id":   track.ID,
		"track_size": track.Size,
	})
	response.Success(c, gin.H{
		"id":      track.ID,
		"deleted": true,
	})
}

// File streams an uploaded track with Range support for seeking and mobile
// audio playback. Bundled tracks are served directly by the frontend.
// GET /api/v1/radio/files/:id
func (h *RadioHandler) File(c *gin.Context) {
	file, track, err := h.library.Open(c.Param("id"))
	if err != nil {
		if errors.Is(err, service.ErrRadioTrackNotFound) {
			response.NotFound(c, "音乐文件不存在")
			return
		}
		response.ErrorFrom(c, err)
		return
	}
	defer func() { _ = file.Close() }()

	info, err := file.Stat()
	if err != nil {
		response.ErrorFrom(c, err)
		return
	}
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Type", radioContentType(track.Format))
	http.ServeContent(c.Writer, c.Request, track.ID+"."+track.Format, info.ModTime(), file)
}

func writeRadioError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrRadioTrackTooLarge):
		response.Error(c, http.StatusRequestEntityTooLarge, err.Error())
	case errors.Is(err, service.ErrRadioTrackLimit),
		errors.Is(err, service.ErrRadioLibraryTooLarge):
		response.Error(c, http.StatusConflict, err.Error())
	case errors.Is(err, service.ErrRadioUnsupportedFormat),
		errors.Is(err, service.ErrRadioInvalidFile):
		response.BadRequest(c, err.Error())
	case errors.Is(err, service.ErrRadioTrackNotFound):
		response.NotFound(c, "音乐文件不存在")
	case errors.Is(err, os.ErrNotExist):
		response.NotFound(c, "音乐文件不存在")
	default:
		response.ErrorFrom(c, err)
	}
}

func radioContentType(format string) string {
	switch strings.ToLower(format) {
	case "mp3":
		return "audio/mpeg"
	case "ogg":
		return "audio/ogg"
	case "wav":
		return "audio/wav"
	case "m4a":
		return "audio/mp4"
	default:
		return "application/octet-stream"
	}
}
