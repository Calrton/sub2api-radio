package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/pkg/usagestats"
	middleware2 "github.com/Wei-Shaw/sub2api/internal/server/middleware"
	"github.com/Wei-Shaw/sub2api/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type rankingUsageRepoStub struct {
	service.UsageLogRepository
	rows  []usagestats.PublicUserRankingItem
	calls int
}

func (s *rankingUsageRepoStub) GetPublicUserRanking(
	context.Context, time.Time, time.Time, int,
) (*usagestats.PublicUserRankingResponse, error) {
	s.calls++
	return &usagestats.PublicUserRankingResponse{Ranking: s.rows}, nil
}

func newRankingTestRouter(repo *rankingUsageRepoStub) *gin.Engine {
	gin.SetMode(gin.TestMode)
	usageSvc := service.NewUsageService(repo, nil, nil, nil)
	handler := NewUsageHandler(usageSvc, nil, nil, nil)
	router := gin.New()
	router.Use(func(c *gin.Context) {
		c.Set(string(middleware2.ContextKeyUser), middleware2.AuthSubject{UserID: 42})
		c.Next()
	})
	router.GET("/usage/users-ranking", handler.GetUserRanking)
	return router
}

func TestParseUserRankingPeriod(t *testing.T) {
	tests := []struct {
		raw  string
		want string
		ok   bool
	}{
		{raw: "", want: "daily", ok: true},
		{raw: "daily", want: "daily", ok: true},
		{raw: " weekly ", want: "weekly", ok: true},
		{raw: "monthly", ok: false},
	}
	for _, tc := range tests {
		got, ok := parseUserRankingPeriod(tc.raw)
		require.Equal(t, tc.ok, ok, tc.raw)
		require.Equal(t, tc.want, got, tc.raw)
	}
}

func TestParseUserRankingLimit(t *testing.T) {
	tests := []struct {
		raw  string
		want int
		ok   bool
	}{
		{raw: "", want: 20, ok: true},
		{raw: "1", want: 1, ok: true},
		{raw: "20", want: 20, ok: true},
		{raw: "0", ok: false},
		{raw: "21", ok: false},
		{raw: "abc", ok: false},
	}
	for _, tc := range tests {
		got, ok := parseUserRankingLimit(tc.raw)
		require.Equal(t, tc.ok, ok, tc.raw)
		require.Equal(t, tc.want, got, tc.raw)
	}
}

func TestUserRankingWindow(t *testing.T) {
	now := time.Date(2026, 10, 19, 15, 30, 0, 0, time.FixedZone("CST", 8*3600))

	start, end := userRankingWindow(now, "daily", "Asia/Shanghai")
	require.Equal(t, "2026-10-19", start.Format("2006-01-02"))
	require.Equal(t, "2026-10-20", end.Format("2006-01-02"))

	start, end = userRankingWindow(now, "weekly", "Asia/Shanghai")
	require.Equal(t, "2026-10-13", start.Format("2006-01-02"))
	require.Equal(t, "2026-10-20", end.Format("2006-01-02"))
}

func TestMaskRankingEmail(t *testing.T) {
	require.Equal(t, "ab***@example.com", maskRankingEmail("ab@example.com"))
	require.Equal(t, "ab***@example.com", maskRankingEmail("abcdef@example.com"))
	require.Equal(t, "a***@example.com", maskRankingEmail("a@example.com"))
	require.Equal(t, "张*", maskRankingEmail("张三"))
	require.Equal(t, "匿名用户", maskRankingEmail(" "))
}

func TestGetUserRankingReturnsMaskedRankingAndCaches(t *testing.T) {
	repo := &rankingUsageRepoStub{rows: []usagestats.PublicUserRankingItem{
		{
			UserID:            1,
			Email:             "alpha@example.com",
			Requests:          10,
			InputTokens:       100,
			OutputTokens:      50,
			CacheCreateTokens: 20,
			CacheReadTokens:   30,
			TotalTokens:       200,
		},
	}}
	router := newRankingTestRouter(repo)

	for i := 0; i < 2; i++ {
		req := httptest.NewRequest(http.MethodGet, "/usage/users-ranking?period=daily&limit=20&timezone=Asia%2FShanghai", nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusOK, rec.Code)

		var body struct {
			Data publicUserRankingResponse `json:"data"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Data.Ranking, 1)
		require.Equal(t, "al***@example.com", body.Data.Ranking[0].Email)
		require.Equal(t, int64(200), body.Data.Ranking[0].TotalTokens)
		require.NotEmpty(t, body.Data.StartDate)
		require.NotEmpty(t, body.Data.EndDate)
	}
	require.Equal(t, 1, repo.calls, "second request should hit the five-minute cache")
}

func TestGetUserRankingRejectsInvalidParameters(t *testing.T) {
	router := newRankingTestRouter(&rankingUsageRepoStub{})
	for _, path := range []string{
		"/usage/users-ranking?period=monthly",
		"/usage/users-ranking?limit=0",
		"/usage/users-ranking?limit=21",
	} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		require.Equal(t, http.StatusBadRequest, rec.Code, path)
	}
}
