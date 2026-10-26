//go:build windows

package config

import (
	"os"
	"path/filepath"
)

// DefaultPath prefers ProgramData so the elevated engine and the GUI share
// one file, and falls back to the user profile when ProgramData is not writable.
func DefaultPath() string {
	programData := os.Getenv("ProgramData")
	if programData == "" {
		programData = `C:\ProgramData`
	}
	shared := filepath.Join(programData, "Ashgate", "config.json")
	if dirWritable(filepath.Dir(shared)) || fileExists(shared) {
		return shared
	}
	base := os.Getenv("AppData")
	if base == "" {
		home, _ := os.UserHomeDir()
		base = filepath.Join(home, "AppData", "Roaming")
	}
	return filepath.Join(base, "Ashgate", "config.json")
}

func dirWritable(dir string) bool {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false
	}
	f, err := os.CreateTemp(dir, ".ashgate-write-*")
	if err != nil {
		return false
	}
	name := f.Name()
	f.Close()
	os.Remove(name)
	return true
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
