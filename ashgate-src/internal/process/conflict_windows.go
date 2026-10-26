//go:build windows

package process

import (
	"fmt"
	"os"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Conflicts lists other programs that also use WinDivert or WFP and any
// extra ashgate.exe. The current process is not included.
func Conflicts() []string {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil
	}
	defer windows.CloseHandle(snap)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	if err := windows.Process32First(snap, &entry); err != nil {
		return nil
	}
	self := map[uint32]struct{}{
		uint32(os.Getpid()):           {},
		windows.GetCurrentProcessId(): {},
	}
	var out []string
	for {
		name := windows.UTF16ToString(entry.ExeFile[:])
		_, mine := self[entry.ProcessID]
		if entry.ProcessID != 0 && !mine && conflictName(name) {
			out = append(out, fmt.Sprintf("%s (PID %d)", name, entry.ProcessID))
		}
		if err := windows.Process32Next(snap, &entry); err != nil {
			break
		}
	}
	return out
}

func conflictName(name string) bool {
	switch strings.ToLower(name) {
	case "proxifier.exe", "winws.exe", "goodbyedpi.exe", "ashgate.exe":
		return true
	default:
		return false
	}
}
