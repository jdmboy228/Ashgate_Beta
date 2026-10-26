//go:build !windows

package process

// Conflicts is empty outside Windows.
func Conflicts() []string { return nil }
