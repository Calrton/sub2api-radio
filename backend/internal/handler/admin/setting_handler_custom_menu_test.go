//go:build unit

package admin

import (
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUpdateSettingsCustomMenuSVGSizeLimit(t *testing.T) {
	menuItem := func(size int) map[string]any {
		return map[string]any{
			"id":         "docs",
			"label":      "Docs",
			"url":        "https://example.com/docs",
			"icon_svg":   strings.Repeat("x", size),
			"visibility": "user",
			"sort_order": 0,
		}
	}

	t.Run("accepts exactly 100KB", func(t *testing.T) {
		h, _ := newStepUpSwitchTestHandler(t, map[string]string{})
		rec := doUpdateSettings(t, h, map[string]any{
			"custom_menu_items": []any{menuItem(100 * 1024)},
		}, nil)

		require.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("rejects 100KB plus one byte", func(t *testing.T) {
		h, _ := newStepUpSwitchTestHandler(t, map[string]string{})
		rec := doUpdateSettings(t, h, map[string]any{
			"custom_menu_items": []any{menuItem(100*1024 + 1)},
		}, nil)

		require.Equal(t, http.StatusBadRequest, rec.Code)
		require.Contains(t, rec.Body.String(), "max 100KB")
	})
}
