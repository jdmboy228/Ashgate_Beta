//go:build !windows

package killswitch

func runNetsh(string) error { return ErrUnsupported }
