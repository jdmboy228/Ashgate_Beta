//go:build windows

package gui

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var pGetOpenFileName = windows.NewLazySystemDLL("comdlg32.dll").NewProc("GetOpenFileNameW")

// openExe asks for an application file. An empty path means the user cancelled.
func openExe(owner uintptr) (string, error) {
	buf := make([]uint16, 32768)
	filter := utf16Multi("Программы (*.exe)", "*.exe", "Все файлы", "*.*")
	title, err := windows.UTF16PtrFromString("Выбор приложения")
	if err != nil {
		return "", err
	}
	ofn := OpenFileName{
		StructSize: uint32(unsafe.Sizeof(OpenFileName{})),
		Owner:      owner,
		Filter:     &filter[0],
		File:       &buf[0],
		MaxFile:    uint32(len(buf)),
		Flags:      0x00080000 | 0x00001000 | 0x00000800 | 0x00000008,
		Title:      title,
	}
	r, _, callErr := pGetOpenFileName.Call(uintptr(unsafe.Pointer(&ofn)))
	if r == 0 {
		if errno, ok := callErr.(windows.Errno); ok && errno != 0 {
			return "", errno
		}
		return "", nil
	}
	return windows.UTF16ToString(buf), nil
}

func utf16Multi(parts ...string) []uint16 {
	var out []uint16
	for _, p := range parts {
		u, err := windows.UTF16FromString(p)
		if err != nil {
			continue
		}
		out = append(out, u...)
	}
	return append(out, 0)
}
