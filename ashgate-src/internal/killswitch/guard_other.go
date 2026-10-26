//go:build !windows

package killswitch

// StartGuard is unavailable outside Windows.
func StartGuard(string) (func(), error) { return nil, ErrUnsupported }

// RunGuard is unavailable outside Windows.
func RunGuard([]string) error { return ErrUnsupported }
