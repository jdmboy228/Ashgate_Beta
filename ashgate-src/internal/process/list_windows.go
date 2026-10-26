//go:build windows

package process

import (
	"sort"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

// App is one running executable. Several PIDs of the same image collapse into one row.
type App struct {
	PID  uint32 `json:"pid"`
	Name string `json:"name"`
	Path string `json:"path"`
}

// List returns running applications, one row per image path.
func List() ([]App, error) {
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return nil, err
	}
	defer windows.CloseHandle(snap)
	var entry windows.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	if err := windows.Process32First(snap, &entry); err != nil {
		return nil, err
	}
	seen := map[string]struct{}{}
	var out []App
	for {
		pid := entry.ProcessID
		name := windows.UTF16ToString(entry.ExeFile[:])
		if pid > 4 && name != "" && !strings.EqualFold(name, "ashgate.exe") {
			img := queryImage(pid)
			path := img.Path
			if img.Name != "" {
				name = img.Name
			}
			key := strings.ToLower(path)
			if key == "" {
				key = strings.ToLower(name)
			}
			if _, ok := seen[key]; !ok {
				seen[key] = struct{}{}
				out = append(out, App{PID: pid, Name: name, Path: path})
			}
		}
		if err := windows.Process32Next(snap, &entry); err != nil {
			break
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return strings.ToLower(out[i].Name) < strings.ToLower(out[j].Name)
	})
	return out, nil
}
