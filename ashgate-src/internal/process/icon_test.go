//go:build !windows

package process

import "testing"

func TestExeIconUnavailableOffWindows(t *testing.T) {
	if _, err := ExeIconPNG(`C:\Windows\notepad.exe`); err == nil {
		t.Fatal("expected an error off Windows")
	}
}
