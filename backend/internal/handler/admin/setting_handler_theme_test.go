//go:build unit

package admin

import (
	"net/http"
	"testing"

	"github.com/Wei-Shaw/sub2api/internal/service"

	"github.com/stretchr/testify/require"
)

func TestUpdateSettingsSiteTypographyPersistsNormalizedValues(t *testing.T) {
	h, repo := newStepUpSwitchTestHandler(t, map[string]string{})

	rec := doUpdateSettings(t, h, map[string]any{
		"site_font_family":      " GEIST ",
		"site_font_scale":       108,
		"site_text_color_light": "#223344",
		"site_text_color_dark":  "#ddeeff",
	}, nil)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "geist", repo.values[service.SettingKeySiteFontFamily])
	require.Equal(t, "108", repo.values[service.SettingKeySiteFontScale])
	require.Equal(t, "#223344", repo.values[service.SettingKeySiteTextColorLight])
	require.Equal(t, "#DDEEFF", repo.values[service.SettingKeySiteTextColorDark])
}

func TestUpdateSettingsSiteTypographyRejectsInvalidValues(t *testing.T) {
	tests := []struct {
		name string
		body map[string]any
		want string
	}{
		{
			name: "unknown font family",
			body: map[string]any{"site_font_family": "comic-sans"},
			want: "INVALID_SITE_FONT_FAMILY",
		},
		{
			name: "font scale below range",
			body: map[string]any{"site_font_scale": 84},
			want: "INVALID_SITE_FONT_SCALE",
		},
		{
			name: "font scale above range",
			body: map[string]any{"site_font_scale": 116},
			want: "INVALID_SITE_FONT_SCALE",
		},
		{
			name: "invalid light body color",
			body: map[string]any{"site_text_color_light": "red"},
			want: "INVALID_SITE_TEXT_COLOR",
		},
		{
			name: "invalid dark body color",
			body: map[string]any{"site_text_color_dark": "#12345"},
			want: "INVALID_SITE_TEXT_COLOR",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, repo := newStepUpSwitchTestHandler(t, map[string]string{
				service.SettingKeySiteFontFamily:     "system",
				service.SettingKeySiteFontScale:      "100",
				service.SettingKeySiteTextColorLight: "#111827",
				service.SettingKeySiteTextColorDark:  "#F3F4F6",
			})

			rec := doUpdateSettings(t, h, tt.body, nil)

			require.Equal(t, http.StatusBadRequest, rec.Code)
			require.Contains(t, rec.Body.String(), tt.want)
			require.Empty(t, repo.lastUpdates)
		})
	}
}

func TestUpdateSettingsSiteTypographyKeepsOmittedValues(t *testing.T) {
	h, repo := newStepUpSwitchTestHandler(t, map[string]string{
		service.SettingKeySiteFontFamily:     "microsoft-yahei",
		service.SettingKeySiteFontScale:      "112",
		service.SettingKeySiteTextColorLight: "#445566",
		service.SettingKeySiteTextColorDark:  "#AABBCC",
	})

	rec := doUpdateSettings(t, h, map[string]any{"site_name": "羲和"}, nil)

	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "microsoft-yahei", repo.values[service.SettingKeySiteFontFamily])
	require.Equal(t, "112", repo.values[service.SettingKeySiteFontScale])
	require.Equal(t, "#445566", repo.values[service.SettingKeySiteTextColorLight])
	require.Equal(t, "#AABBCC", repo.values[service.SettingKeySiteTextColorDark])
}
