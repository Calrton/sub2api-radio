package routes

import (
	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"

	"github.com/gin-gonic/gin"
)

// RegisterRadioRoutes registers the public playlist and audio files.
func RegisterRadioRoutes(v1 *gin.RouterGroup, h *handler.Handlers, panelRateLimiter *middleware.PanelRateLimiter) {
	radio := v1.Group("/radio")
	radio.Use(panelRateLimiter.PublicIP())
	{
		radio.GET("/tracks", h.Radio.List)
		radio.GET("/files/:id", h.Radio.File)
	}
}

// registerAdminRadioRoutes registers the admin library management endpoints.
func registerAdminRadioRoutes(admin *gin.RouterGroup, h *handler.Handlers) {
	radio := admin.Group("/radio")
	{
		radio.GET("/tracks", h.Radio.AdminList)
		radio.POST("/tracks", h.Radio.Upload)
		radio.DELETE("/tracks/:id", h.Radio.Delete)
	}
}
