package app

import (
	"path/filepath"
	"testing"

	"ashgate/internal/config"
)

func TestQuoteArg(t *testing.T) {
	if quoteArg("curl.exe") != "curl.exe" {
		t.Fatal(quoteArg("curl.exe"))
	}
	if quoteArg(`C:\Program Files\a.exe`) != `"C:\Program Files\a.exe"` {
		t.Fatal(quoteArg(`C:\Program Files\a.exe`))
	}
	if quoteArg("") != `""` {
		t.Fatal("empty")
	}
}

func TestCheckCommand(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ashgate.json")
	if err := config.Save(path, config.Default()); err != nil {
		t.Fatal(err)
	}
	if cmdCheck([]string{"-config", path}) != 0 {
		t.Fatal("expected valid config")
	}
	if cmdCheck([]string{"-nope"}) != 2 {
		t.Fatal("expected usage error")
	}
	if cmdCheck([]string{"-config"}) != 2 {
		t.Fatal("expected missing path")
	}
}
