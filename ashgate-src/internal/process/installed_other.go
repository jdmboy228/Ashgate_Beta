//go:build !windows

package process

import "os"

func scanInstalled() []Installed { return nil }

func windowsDir() string { return `C:\Windows` }

var fileExists = func(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
