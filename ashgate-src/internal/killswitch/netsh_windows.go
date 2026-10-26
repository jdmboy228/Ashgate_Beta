//go:build windows

package killswitch

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"golang.org/x/sys/windows"
)

// runNetsh runs netsh with a literal command line. netsh expects
// program="C:\path with spaces\app.exe" exactly, which Go's own argument
// quoting would not produce.
func runNetsh(cmdline string) error {
	exe := filepath.Join(os.Getenv("SystemRoot"), "System32", "netsh.exe")
	cmd := exec.Command(exe)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW,
		CmdLine:       `"` + exe + `" ` + cmdline,
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("netsh: %w: %s", err, out)
	}
	return nil
}
