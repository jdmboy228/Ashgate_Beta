//go:build !windows

package app

func prepareConsole() {}

func ensureElevated([]string) (bool, int) { return false, 0 }
