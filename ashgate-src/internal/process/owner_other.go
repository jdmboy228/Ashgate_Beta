//go:build !windows

package process

// TCPOwner is unavailable outside Windows.
func TCPOwner(int) (string, uint32, bool) { return "", 0, false }
