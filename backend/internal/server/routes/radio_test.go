package routes

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/handler"
	"github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"
)

func newRadioRouteTestEngine(t *testing.T) (*gin.Engine, *service.RadioLibrary) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	library := service.NewRadioLibrary(t.TempDir())
	handlers := &handler.Handlers{Radio: handler.NewRadioHandler(library)}
	engine := gin.New()
	limiter := middleware.NewPanelRateLimiter(redis.NewClient(&redis.Options{Addr: "127.0.0.1:1"}), nil)
	RegisterRadioRoutes(engine.Group("/api/v1"), handlers, limiter)
	return engine, library
}

func TestRegisterRadioRoutesPublicList(t *testing.T) {
	engine, _ := newRadioRouteTestEngine(t)
	request := httptest.NewRequest(http.MethodGet, "/api/v1/radio/tracks", nil)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
}

func TestRegisterRadioRoutesFileNotFound(t *testing.T) {
	engine, _ := newRadioRouteTestEngine(t)
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/radio/files/0123456789abcdef0123456789abcdef",
		nil,
	)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	require.Equal(t, http.StatusNotFound, recorder.Code, recorder.Body.String())
}
