package logbuf

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileRotatesBySize(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ashgate.log")
	b, err := New(4, path)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()
	big := strings.Repeat("x", 64<<10)
	for b.size < maxLogBytes {
		b.Add(Event{Process: "curl.exe", Error: big})
	}
	b.Add(Event{Process: "after.exe"})
	if _, err := os.Stat(path + ".1"); err != nil {
		t.Fatalf("no rotated file: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(data, utf8BOM) || !bytes.Contains(data, []byte("after.exe")) {
		t.Fatalf("fresh log: %q", data)
	}
	if b.size != int64(len(data)) {
		t.Fatalf("tracked size %d, file %d", b.size, len(data))
	}
}
