package service

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"
)

const (
	RadioMaxTrackBytes = int64(100 * 1024 * 1024)
	RadioMaxTracks     = 100
	RadioMaxTotalBytes = int64(1024 * 1024 * 1024)

	radioManifestVersion = 1
)

var (
	ErrRadioTrackNotFound     = errors.New("radio track not found")
	ErrRadioTrackLimit        = fmt.Errorf("radio library supports at most %d tracks", RadioMaxTracks)
	ErrRadioTrackTooLarge     = fmt.Errorf("radio track exceeds %d MB", RadioMaxTrackBytes/(1024*1024))
	ErrRadioLibraryTooLarge   = fmt.Errorf("radio library exceeds %d MB", RadioMaxTotalBytes/(1024*1024))
	ErrRadioUnsupportedFormat = errors.New("radio track must be MP3, OGG, WAV, or M4A")
	ErrRadioInvalidFile       = errors.New("radio file content does not match its format")
)

// RadioTrack is the public metadata returned to the player and admin library.
// Uploaded tracks use /api/v1/radio/files/<id>; bundled tracks use static paths.
type RadioTrack struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Mood        string `json:"mood"`
	Description string `json:"description"`
	Src         string `json:"src"`
	Size        int64  `json:"size,omitempty"`
	Format      string `json:"format,omitempty"`
	Uploaded    bool   `json:"uploaded"`
	CreatedAt   string `json:"created_at,omitempty"`
}

type radioManifest struct {
	Version int          `json:"version"`
	Tracks  []RadioTrack `json:"tracks"`
}

type RadioLibraryStats struct {
	Tracks     int   `json:"tracks"`
	TotalBytes int64 `json:"total_bytes"`
	MaxTracks  int   `json:"max_tracks"`
	MaxBytes   int64 `json:"max_bytes"`
	MaxTrack   int64 `json:"max_track_bytes"`
}

type RadioLibrary struct {
	mu      sync.Mutex
	root    string
	now     func() time.Time
	randID  func() (string, error)
	maxRead int64
}

type RadioDataDir string

func NewRadioLibrary(root string) *RadioLibrary {
	return &RadioLibrary{
		root:    root,
		now:     time.Now,
		randID:  newRadioTrackID,
		maxRead: RadioMaxTrackBytes,
	}
}

func ProvideRadioLibrary(dataDir RadioDataDir) *RadioLibrary {
	return NewRadioLibrary(filepath.Join(string(dataDir), "radio"))
}

func (l *RadioLibrary) Tracks() ([]RadioTrack, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	manifest, err := l.loadManifestLocked()
	if err != nil {
		return nil, err
	}
	return append([]RadioTrack(nil), manifest.Tracks...), nil
}

func (l *RadioLibrary) Stats() (RadioLibraryStats, error) {
	tracks, err := l.Tracks()
	if err != nil {
		return RadioLibraryStats{}, err
	}
	return radioStats(tracks), nil
}

func (l *RadioLibrary) Track(id string) (RadioTrack, error) {
	if !validRadioID(id) {
		return RadioTrack{}, ErrRadioTrackNotFound
	}
	tracks, err := l.Tracks()
	if err != nil {
		return RadioTrack{}, err
	}
	for _, track := range tracks {
		if track.ID == id && track.Uploaded {
			return track, nil
		}
	}
	return RadioTrack{}, ErrRadioTrackNotFound
}

// Open returns the persisted file and its metadata. The caller owns the file.
func (l *RadioLibrary) Open(id string) (*os.File, RadioTrack, error) {
	track, err := l.Track(id)
	if err != nil {
		return nil, RadioTrack{}, err
	}
	path := filepath.Join(l.root, "tracks", id+"."+track.Format)
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, RadioTrack{}, ErrRadioTrackNotFound
		}
		return nil, RadioTrack{}, fmt.Errorf("open radio track: %w", err)
	}
	return file, track, nil
}

type RadioUpload struct {
	Filename string
	Size     int64
	Open     func() (io.ReadCloser, error)
}

func (l *RadioLibrary) Add(upload RadioUpload) (RadioTrack, error) {
	if upload.Open == nil {
		return RadioTrack{}, errors.New("radio upload is empty")
	}
	if upload.Size <= 0 {
		return RadioTrack{}, errors.New("radio file is empty")
	}
	if upload.Size > RadioMaxTrackBytes {
		return RadioTrack{}, ErrRadioTrackTooLarge
	}

	extension := strings.ToLower(filepath.Ext(strings.TrimSpace(upload.Filename)))
	format, contentType, ok := radioFormat(extension)
	if !ok {
		return RadioTrack{}, ErrRadioUnsupportedFormat
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	manifest, err := l.loadManifestLocked()
	if err != nil {
		return RadioTrack{}, err
	}
	if len(manifest.Tracks) >= RadioMaxTracks {
		return RadioTrack{}, ErrRadioTrackLimit
	}
	if radioStats(manifest.Tracks).TotalBytes+upload.Size > RadioMaxTotalBytes {
		return RadioTrack{}, ErrRadioLibraryTooLarge
	}
	if err := l.ensureDirsLocked(); err != nil {
		return RadioTrack{}, err
	}

	id, err := l.randID()
	if err != nil {
		return RadioTrack{}, fmt.Errorf("create radio track id: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Join(l.root, "tracks"), ".radio-upload-*")
	if err != nil {
		return RadioTrack{}, fmt.Errorf("create radio temporary file: %w", err)
	}
	temporaryPath := temporary.Name()
	cleanup := true
	defer func() {
		_ = temporary.Close()
		if cleanup {
			_ = os.Remove(temporaryPath)
		}
	}()

	source, err := upload.Open()
	if err != nil {
		return RadioTrack{}, fmt.Errorf("read radio upload: %w", err)
	}
	defer func() { _ = source.Close() }()

	header := make([]byte, 12)
	headerCount, headerErr := io.ReadFull(source, header)
	if headerErr != nil && !errors.Is(headerErr, io.ErrUnexpectedEOF) {
		return RadioTrack{}, fmt.Errorf("read radio file header: %w", headerErr)
	}
	header = header[:headerCount]
	if !radioHeaderMatches(format, header) {
		return RadioTrack{}, ErrRadioInvalidFile
	}

	hash := sha256.New()
	if _, err := hash.Write(header); err != nil {
		return RadioTrack{}, fmt.Errorf("hash radio file: %w", err)
	}
	written, err := io.Copy(io.MultiWriter(temporary, hash), io.LimitReader(source, l.maxRead+1))
	if err != nil {
		return RadioTrack{}, fmt.Errorf("save radio file: %w", err)
	}
	written += int64(len(header))
	if written > RadioMaxTrackBytes {
		return RadioTrack{}, ErrRadioTrackTooLarge
	}
	if written != upload.Size {
		return RadioTrack{}, errors.New("radio upload size changed while reading")
	}
	if err := temporary.Sync(); err != nil {
		return RadioTrack{}, fmt.Errorf("sync radio file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return RadioTrack{}, fmt.Errorf("close radio file: %w", err)
	}

	finalName := id + extension
	finalPath := filepath.Join(l.root, "tracks", finalName)
	if err := os.Rename(temporaryPath, finalPath); err != nil {
		return RadioTrack{}, fmt.Errorf("commit radio file: %w", err)
	}
	cleanup = false

	title := radioTitle(upload.Filename)
	track := RadioTrack{
		ID:          id,
		Title:       title,
		Mood:        "本地上传",
		Description: contentType,
		Src:         "/api/v1/radio/files/" + id,
		Size:        written,
		Format:      strings.TrimPrefix(extension, "."),
		Uploaded:    true,
		CreatedAt:   l.now().UTC().Format(time.RFC3339),
	}
	manifest.Tracks = append(manifest.Tracks, track)
	if err := l.saveManifestLocked(manifest); err != nil {
		_ = os.Remove(finalPath)
		return RadioTrack{}, err
	}
	return track, nil
}

func (l *RadioLibrary) Delete(id string) (RadioTrack, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	manifest, err := l.loadManifestLocked()
	if err != nil {
		return RadioTrack{}, err
	}
	index := -1
	for i, track := range manifest.Tracks {
		if track.ID == id {
			index = i
			break
		}
	}
	if index < 0 {
		return RadioTrack{}, ErrRadioTrackNotFound
	}
	track := manifest.Tracks[index]
	moved := false
	sourcePath := ""
	trashPath := ""
	if track.Uploaded {
		if err := l.ensureDirsLocked(); err != nil {
			return RadioTrack{}, err
		}
		sourcePath = filepath.Join(l.root, "tracks", id+"."+track.Format)
		trashPath = filepath.Join(l.root, "trash", id+"."+track.Format+"."+l.now().UTC().Format("20060102150405"))
		if err := os.Rename(sourcePath, trashPath); err == nil {
			moved = true
		} else if !errors.Is(err, os.ErrNotExist) {
			return RadioTrack{}, fmt.Errorf("stage radio deletion: %w", err)
		}
	}

	manifest.Tracks = append(manifest.Tracks[:index], manifest.Tracks[index+1:]...)
	if err := l.saveManifestLocked(manifest); err != nil {
		if moved {
			_ = os.Rename(trashPath, sourcePath)
		}
		return RadioTrack{}, err
	}
	if moved {
		_ = os.Remove(trashPath)
	}
	return track, nil
}

func (l *RadioLibrary) loadManifestLocked() (radioManifest, error) {
	if err := l.ensureDirsLocked(); err != nil {
		return radioManifest{}, err
	}
	path := filepath.Join(l.root, "manifest.json")
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		manifest := radioManifest{Version: radioManifestVersion, Tracks: bundledRadioTracks()}
		if err := l.saveManifestLocked(manifest); err != nil {
			return radioManifest{}, err
		}
		return manifest, nil
	}
	if err != nil {
		return radioManifest{}, fmt.Errorf("read radio manifest: %w", err)
	}

	var manifest radioManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return radioManifest{}, fmt.Errorf("parse radio manifest: %w", err)
	}
	if manifest.Version != radioManifestVersion {
		return radioManifest{}, fmt.Errorf("unsupported radio manifest version %d", manifest.Version)
	}
	if manifest.Tracks == nil {
		manifest.Tracks = []RadioTrack{}
	}
	if len(manifest.Tracks) > RadioMaxTracks {
		return radioManifest{}, ErrRadioTrackLimit
	}
	l.cleanupOrphanedTrashLocked(manifest)
	return manifest, nil
}

func (l *RadioLibrary) cleanupOrphanedTrashLocked(manifest radioManifest) {
	active := make(map[string]struct{}, len(manifest.Tracks))
	for _, track := range manifest.Tracks {
		if track.Uploaded {
			active[track.ID] = struct{}{}
		}
	}

	trashDir := filepath.Join(l.root, "trash")
	entries, err := os.ReadDir(trashDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		id, _, _ := strings.Cut(entry.Name(), ".")
		if _, ok := active[id]; ok {
			continue
		}
		_ = os.Remove(filepath.Join(trashDir, entry.Name()))
	}
}

func (l *RadioLibrary) saveManifestLocked(manifest radioManifest) error {
	if manifest.Version == 0 {
		manifest.Version = radioManifestVersion
	}
	if manifest.Tracks == nil {
		manifest.Tracks = []RadioTrack{}
	}
	raw, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode radio manifest: %w", err)
	}
	temporary, err := os.CreateTemp(l.root, ".radio-manifest-*")
	if err != nil {
		return fmt.Errorf("create radio manifest temporary file: %w", err)
	}
	path := temporary.Name()
	cleanup := true
	defer func() {
		_ = temporary.Close()
		if cleanup {
			_ = os.Remove(path)
		}
	}()
	if _, err := temporary.Write(raw); err != nil {
		return fmt.Errorf("write radio manifest: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync radio manifest: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close radio manifest: %w", err)
	}
	if err := os.Rename(path, filepath.Join(l.root, "manifest.json")); err != nil {
		return fmt.Errorf("commit radio manifest: %w", err)
	}
	cleanup = false
	return nil
}

func (l *RadioLibrary) ensureDirsLocked() error {
	for _, dir := range []string{l.root, filepath.Join(l.root, "tracks"), filepath.Join(l.root, "trash")} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return fmt.Errorf("create radio directory: %w", err)
		}
	}
	return nil
}

func radioStats(tracks []RadioTrack) RadioLibraryStats {
	stats := RadioLibraryStats{
		Tracks:    len(tracks),
		MaxTracks: RadioMaxTracks,
		MaxBytes:  RadioMaxTotalBytes,
		MaxTrack:  RadioMaxTrackBytes,
	}
	for _, track := range tracks {
		if track.Size > 0 {
			stats.TotalBytes += track.Size
		}
	}
	return stats
}

func radioFormat(extension string) (format, contentType string, ok bool) {
	switch extension {
	case ".mp3":
		return "mp3", "audio/mpeg", true
	case ".ogg":
		return "ogg", "audio/ogg", true
	case ".wav":
		return "wav", "audio/wav", true
	case ".m4a":
		return "m4a", "audio/mp4", true
	default:
		return "", "", false
	}
}

func radioHeaderMatches(format string, header []byte) bool {
	switch format {
	case "mp3":
		if len(header) >= 3 && string(header[:3]) == "ID3" {
			return true
		}
		return len(header) >= 2 && header[0] == 0xff && header[1]&0xe0 == 0xe0
	case "ogg":
		return len(header) >= 4 && string(header[:4]) == "OggS"
	case "wav":
		return len(header) >= 12 && string(header[:4]) == "RIFF" && string(header[8:12]) == "WAVE"
	case "m4a":
		return len(header) >= 8 && string(header[4:8]) == "ftyp"
	default:
		return false
	}
}

func radioTitle(filename string) string {
	base := filepath.Base(strings.TrimSpace(filename))
	base = strings.TrimSuffix(base, filepath.Ext(base))
	base = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, base)
	base = strings.TrimSpace(base)
	if base == "" {
		return "未命名歌曲"
	}
	runes := []rune(base)
	if len(runes) > 80 {
		base = string(runes[:80])
	}
	return base
}

func newRadioTrackID() (string, error) {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func validRadioID(id string) bool {
	if len(id) != 32 {
		return false
	}
	_, err := hex.DecodeString(id)
	return err == nil
}

func bundledRadioTracks() []RadioTrack {
	return []RadioTrack{
		{ID: "bu-shao-xin", Title: "不烧心", Mood: "短剧氛围", Description: "阿米toofu", Src: "/audio/xihe-radio/bgm-01.mp3", Format: "mp3"},
		{ID: "qiu-long", Title: "囚笼", Mood: "短剧氛围", Description: "马嘉义", Src: "/audio/xihe-radio/bgm-02.mp3", Format: "mp3"},
		{ID: "amazon", Title: "Amazon", Mood: "节奏氛围", Description: "KKK", Src: "/audio/xihe-radio/bgm-03.mp3", Format: "mp3"},
		{ID: "huan-zhou-4", Title: "幻昼 4.0", Mood: "情绪氛围", Description: "渡川", Src: "/audio/xihe-radio/bgm-04.mp3", Format: "mp3"},
		{ID: "life-struggle", Title: "Life struggle · 宿命", Mood: "剧情推进", Description: "Mz", Src: "/audio/xihe-radio/bgm-05.mp3", Format: "mp3"},
		{ID: "jing-shen-chuang-shang", Title: "精神创伤", Mood: "短剧氛围", Description: "完整版", Src: "/audio/xihe-radio/bgm-06.mp3", Format: "mp3"},
		{ID: "ban-shou-ren", Title: "半兽人", Mood: "热门二创", Description: "节奏氛围", Src: "/audio/xihe-radio/bgm-07.mp3", Format: "mp3"},
	}
}
