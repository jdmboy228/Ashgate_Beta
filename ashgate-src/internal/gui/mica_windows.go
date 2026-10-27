//go:build windows

package gui

import (
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	dwmwaUseImmersiveDarkMode = 20
	dwmwaSystemBackdropType   = 38
	dwmsbtMainWindow          = 2 // Mica
)

var pDwmExtendFrame = windows.NewLazySystemDLL("dwmapi.dll").NewProc("DwmExtendFrameIntoClientArea")

// micaSupported reports Windows 11 22H2 (build 22621) or newer, where DWM
// draws the Mica backdrop for ordinary windows. ASHGATE_NO_MICA=1 turns
// it off, for example on a remote desktop where Mica falls back to grey.
func micaSupported() bool {
	if os.Getenv("ASHGATE_NO_MICA") != "" {
		return false
	}
	v := windows.RtlGetVersion()
	return v.MajorVersion >= 10 && v.BuildNumber >= 22621
}

type dwmMargins struct{ left, right, top, bottom int32 }

// enableMica extends the frame over the whole client area and asks DWM for
// the Mica backdrop. It reports whether DWM accepted it; only then may the
// page be transparent.
func enableMica(hwnd uintptr, dark bool) bool {
	setDarkFrame(hwnd, dark)
	m := dwmMargins{-1, -1, -1, -1}
	if hr, _, _ := pDwmExtendFrame.Call(hwnd, uintptr(unsafe.Pointer(&m))); hr != 0 {
		return false
	}
	kind := uint32(dwmsbtMainWindow)
	hr, _, _ := pDwmAttribute.Call(hwnd, dwmwaSystemBackdropType, uintptr(unsafe.Pointer(&kind)), 4)
	return hr == 0
}

// setDarkFrame switches the frame and the Mica tint between dark and light.
func setDarkFrame(hwnd uintptr, dark bool) {
	var v uint32
	if dark {
		v = 1
	}
	pDwmAttribute.Call(hwnd, dwmwaUseImmersiveDarkMode, uintptr(unsafe.Pointer(&v)), 4)
}
