package service

import (
	"bytes"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

func radioTestUpload(t *testing.T, name string, size int, header []byte) RadioUpload {
	t.Helper()
	content := make([]byte, size)
	copy(content, header)
	return RadioUpload{
		Filename: name,
		Size:     int64(len(content)),
		Open: func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(content)), nil
		},
	}
}

func TestRadioLibraryStartsWithSevenBundledTracks(t *testing.T) {
	library := NewRadioLibrary(t.TempDir())
	tracks, err := library.Tracks()
	require.NoError(t, err)
	require.Len(t, tracks, 7)
	require.Equal(t, "/audio/xihe-radio/bgm-01.mp3", tracks[0].Src)
	require.False(t, tracks[0].Uploaded)
}

func TestRadioLibraryPersistsAnExplicitEmptyManifest(t *testing.T) {
	root := t.TempDir()
	library := NewRadioLibrary(root)
	tracks, err := library.Tracks()
	require.NoError(t, err)
	require.Len(t, tracks, 7)
	for _, track := range tracks {
		if track.Uploaded {
			_, err = library.Delete(track.ID)
			require.NoError(t, err)
		}
	}
	require.NoError(t, os.WriteFile(filepath.Join(root, "manifest.json"), []byte(`{"version":1,"tracks":[]}`), 0o640))
	reopened := NewRadioLibrary(root)
	tracks, err = reopened.Tracks()
	require.NoError(t, err)
	require.Empty(t, tracks)
}

func TestRadioLibraryAcceptsSupportedFormats(t *testing.T) {
	tests := []struct {
		name   string
		header []byte
		format string
	}{
		{"song.mp3", []byte("ID3\x04\x00\x00\x00\x00\x00\x00\x00\x00"), "mp3"},
		{"song.ogg", []byte("OggS\x00\x02\x00\x00\x00\x00\x00\x00"), "ogg"},
		{"song.wav", []byte("RIFF\x00\x00\x00\x00WAVEfmt "), "wav"},
		{"song.m4a", []byte("\x00\x00\x00\x20ftypM4A \x00\x00\x00\x00"), "m4a"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			library := NewRadioLibrary(t.TempDir())
			track, err := library.Add(radioTestUpload(t, test.name, 64, test.header))
			require.NoError(t, err)
			require.True(t, track.Uploaded)
			require.Equal(t, test.format, track.Format)
			require.Equal(t, int64(64), track.Size)
		})
	}
}

func TestRadioLibraryRejectsForgedExtensionAndOversizedTrack(t *testing.T) {
	library := NewRadioLibrary(t.TempDir())
	_, err := library.Add(radioTestUpload(t, "fake.mp3", 64, []byte("not-an-mp3")))
	require.ErrorIs(t, err, ErrRadioInvalidFile)

	oversized := radioTestUpload(t, "large.mp3", 64, []byte("ID3\x04"))
	oversized.Size = RadioMaxTrackBytes + 1
	_, err = library.Add(oversized)
	require.ErrorIs(t, err, ErrRadioTrackTooLarge)
}

func TestRadioLibraryEnforcesTrackAndCapacityLimits(t *testing.T) {
	root := t.TempDir()
	library := NewRadioLibrary(root)
	manifest := radioManifest{Version: radioManifestVersion, Tracks: make([]RadioTrack, RadioMaxTracks)}
	require.NoError(t, os.MkdirAll(filepath.Join(root, "tracks"), 0o750))
	require.NoError(t, library.saveManifestLocked(manifest))
	_, err := library.Add(radioTestUpload(t, "song.mp3", 32, []byte("ID3\x04")))
	require.ErrorIs(t, err, ErrRadioTrackLimit)

	library = NewRadioLibrary(t.TempDir())
	tracks, err := library.Tracks()
	require.NoError(t, err)
	tracks[0].Size = RadioMaxTotalBytes
	require.NoError(t, library.saveManifestLocked(radioManifest{Version: radioManifestVersion, Tracks: tracks}))
	_, err = library.Add(radioTestUpload(t, "song.mp3", 32, []byte("ID3\x04")))
	require.ErrorIs(t, err, ErrRadioLibraryTooLarge)
}

func TestRadioLibrarySerializesConcurrentUploads(t *testing.T) {
	root := t.TempDir()
	library := NewRadioLibrary(root)
	tracks, err := library.Tracks()
	require.NoError(t, err)
	tracks[0].Size = RadioMaxTotalBytes - 40
	require.NoError(t, library.saveManifestLocked(radioManifest{Version: radioManifestVersion, Tracks: tracks}))

	var wait sync.WaitGroup
	results := make(chan error, 2)
	for range 2 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			_, err := library.Add(radioTestUpload(t, "song.mp3", 32, []byte("ID3\x04")))
			results <- err
		}()
	}
	wait.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else {
			require.ErrorIs(t, err, ErrRadioLibraryTooLarge)
		}
	}
	require.Equal(t, 1, successes)
}

func TestRadioLibraryDeleteRemovesSourceAndTrashFile(t *testing.T) {
	root := t.TempDir()
	library := NewRadioLibrary(root)
	track, err := library.Add(radioTestUpload(t, "song.mp3", 32, []byte("ID3\x04")))
	require.NoError(t, err)
	_, err = library.Delete(track.ID)
	require.NoError(t, err)
	_, err = os.Stat(filepath.Join(root, "tracks", track.ID+".mp3"))
	require.True(t, errors.Is(err, os.ErrNotExist))
	matches, err := filepath.Glob(filepath.Join(root, "trash", track.ID+".mp3.*"))
	require.NoError(t, err)
	require.Empty(t, matches)
}

func TestRadioLibraryDeleteBundledTrackOnlyUpdatesManifest(t *testing.T) {
	root := t.TempDir()
	library := NewRadioLibrary(root)

	track, err := library.Delete("bu-shao-xin")
	require.NoError(t, err)
	require.Equal(t, "bu-shao-xin", track.ID)
	require.False(t, track.Uploaded)

	tracks, err := library.Tracks()
	require.NoError(t, err)
	require.Len(t, tracks, 6)
	for _, remaining := range tracks {
		require.NotEqual(t, "bu-shao-xin", remaining.ID)
	}

	reopened := NewRadioLibrary(root)
	tracks, err = reopened.Tracks()
	require.NoError(t, err)
	require.Len(t, tracks, 6)
	for _, remaining := range tracks {
		require.NotEqual(t, "bu-shao-xin", remaining.ID)
	}
}

func TestRadioLibraryCleansOrphanedTrashButKeepsReferencedFiles(t *testing.T) {
	root := t.TempDir()
	library := NewRadioLibrary(root)
	track, err := library.Add(radioTestUpload(t, "song.mp3", 32, []byte("ID3\x04")))
	require.NoError(t, err)
	require.NoError(t, os.MkdirAll(filepath.Join(root, "trash"), 0o750))

	orphanPath := filepath.Join(root, "trash", strings.Repeat("a", 32)+".mp3.20261025120000")
	referencedPath := filepath.Join(root, "trash", track.ID+".mp3.20261025120001")
	require.NoError(t, os.WriteFile(orphanPath, []byte("orphan"), 0o640))
	require.NoError(t, os.WriteFile(referencedPath, []byte("referenced"), 0o640))

	_, err = library.Tracks()
	require.NoError(t, err)
	_, err = os.Stat(orphanPath)
	require.True(t, errors.Is(err, os.ErrNotExist))
	_, err = os.Stat(referencedPath)
	require.NoError(t, err)
}

func TestRadioLibraryRejectsUnsupportedExtension(t *testing.T) {
	library := NewRadioLibrary(t.TempDir())
	_, err := library.Add(radioTestUpload(t, "song.flac", 32, []byte("fLaC")))
	require.ErrorIs(t, err, ErrRadioUnsupportedFormat)
}

func TestRadioLibrarySanitizesTitles(t *testing.T) {
	library := NewRadioLibrary(t.TempDir())
	track, err := library.Add(radioTestUpload(t, "../bad\x00name.mp3", 32, []byte("ID3\x04")))
	require.NoError(t, err)
	require.Equal(t, "badname", track.Title)
	require.NotContains(t, track.Title, string(os.PathSeparator))
}

func TestRadioLibraryStoresMetadataWithoutLeakingPath(t *testing.T) {
	library := NewRadioLibrary(t.TempDir())
	track, err := library.Add(radioTestUpload(t, strings.Repeat("a", 100)+".mp3", 32, []byte("ID3\x04")))
	require.NoError(t, err)
	require.Len(t, []rune(track.Title), 80)
	require.Equal(t, "/api/v1/radio/files/"+track.ID, track.Src)
}
