//go:build !windows

package autostart

import "errors"

// Enabled is always false outside Windows.
func Enabled() (bool, error) { return false, nil }

// Enable is only available on Windows.
func Enable(string, string) error { return windowsOnly() }

// Disable is only available on Windows.
func Disable() error { return windowsOnly() }

func windowsOnly() error {
	return errors.New("автозапуск доступен только в Windows")
}
