package repository

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Wei-Shaw/sub2api/internal/pkg/usagestats"
	"github.com/stretchr/testify/require"
)

func TestUsageLogRepositoryGetPublicUserRanking(t *testing.T) {
	db, mock := newSQLMock(t)
	repo := &usageLogRepository{sql: db}

	start := time.Date(2026, 10, 19, 0, 0, 0, 0, time.UTC)
	end := start.Add(24 * time.Hour)
	rows := sqlmock.NewRows(
		[]string{
			"user_id", "email", "requests", "input_tokens", "output_tokens",
			"cache_create_tokens", "cache_read_tokens", "total_tokens",
		},
	).AddRow(int64(7), "alpha@example.com", int64(12), int64(1000), int64(500), int64(100), int64(200), int64(1800))

	mock.ExpectQuery("WITH user_usage AS \\(").
		WithArgs(start, end, 20).
		WillReturnRows(rows)

	got, err := repo.GetPublicUserRanking(context.Background(), start, end, 50)
	require.NoError(t, err)
	require.Equal(t, &usagestats.PublicUserRankingResponse{
		Ranking: []usagestats.PublicUserRankingItem{{
			UserID:            7,
			Email:             "alpha@example.com",
			Requests:          12,
			InputTokens:       1000,
			OutputTokens:      500,
			CacheCreateTokens: 100,
			CacheReadTokens:   200,
			TotalTokens:       1800,
		}},
	}, got)
	require.NoError(t, mock.ExpectationsWereMet())
}
