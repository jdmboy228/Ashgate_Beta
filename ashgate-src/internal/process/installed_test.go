package process

import (
	"encoding/binary"
	"testing"
	"unicode/utf16"
)

// buildLNK makes a minimal shortcut with a LinkInfo local path.
func buildLNK(ansi, unicode string) []byte {
	b := make([]byte, lnkHeaderSize)
	binary.LittleEndian.PutUint32(b, lnkHeaderSize)
	binary.LittleEndian.PutUint32(b[0x14:], lnkHasLinkInfo)
	hdr := uint32(0x1C)
	if unicode != "" {
		hdr = 0x24
	}
	body := []byte{}
	ansiOff := hdr
	body = append(body, append([]byte(ansi), 0)...)
	suffixOff := hdr + uint32(len(body))
	body = append(body, 0)
	var uOff, usOff uint32
	if unicode != "" {
		uOff = hdr + uint32(len(body))
		for _, c := range utf16.Encode([]rune(unicode)) {
			body = binary.LittleEndian.AppendUint16(body, c)
		}
		body = append(body, 0, 0)
		usOff = hdr + uint32(len(body))
		body = append(body, 0, 0)
	}
	info := make([]byte, hdr)
	binary.LittleEndian.PutUint32(info[4:], hdr)
	binary.LittleEndian.PutUint32(info[8:], lnkLocalPath)
	binary.LittleEndian.PutUint32(info[16:], ansiOff)
	binary.LittleEndian.PutUint32(info[24:], suffixOff)
	if unicode != "" {
		binary.LittleEndian.PutUint32(info[28:], uOff)
		binary.LittleEndian.PutUint32(info[32:], usOff)
	}
	info = append(info, body...)
	binary.LittleEndian.PutUint32(info, uint32(len(info)))
	return append(b, info...)
}

func TestParseLNK(t *testing.T) {
	got, err := ParseLNK(buildLNK(`C:\Program Files\App\app.exe`, ""))
	if err != nil || got != `C:\Program Files\App\app.exe` {
		t.Fatalf("ansi: %q %v", got, err)
	}
	got, err = ParseLNK(buildLNK("?", `C:\Users\Вася\AppData\Roaming\Telegram Desktop\Telegram.exe`))
	if err != nil || got != `C:\Users\Вася\AppData\Roaming\Telegram Desktop\Telegram.exe` {
		t.Fatalf("unicode: %q %v", got, err)
	}
	if _, err := ParseLNK([]byte("not a shortcut")); err == nil {
		t.Fatal("garbage parsed")
	}
}

func TestMergeInstalled(t *testing.T) {
	old := fileExists
	fileExists = func(string) bool { return true }
	defer func() { fileExists = old }()
	got := mergeInstalled([]Installed{
		{Name: "Telegram", Path: `C:\Apps\Telegram\Telegram.exe`},
		{Name: "Telegram Desktop 5.1", Path: `"C:\Apps\Telegram\Telegram.exe",0`},
		{Name: "Uninstall Telegram", Path: `C:\Apps\Telegram\unins000.exe`},
		{Name: "Readme", Path: `C:\Apps\Telegram\readme.txt`},
		{Name: "", Path: `C:\Tools\curl.exe`},
	})
	if len(got) != 2 || got[0].Name != "curl" || got[1].Name != "Telegram" || got[1].Path != `C:\Apps\Telegram\Telegram.exe` {
		t.Fatalf("%+v", got)
	}
}
