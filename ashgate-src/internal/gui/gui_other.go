//go:build !windows

package gui

import "errors"

// Run reports that the window is only available on Windows.
func Run(string, bool) error {
	return errors.New("графический интерфейс Ashgate доступен только в Windows")
}
