package rules

import (
	"testing"

	"ashgate/internal/config"
)

func TestMatchOrderAndShape(t *testing.T) {
	off := false
	on := true
	set := Compile([]config.Rule{
		{Enabled: &off, Process: "curl.exe", Action: "direct"},
		{Enabled: &on, Process: "curl.exe", Action: "proxy", Proxy: "second"},
		{Enabled: &on, Process: `C:/Program Files/Mozilla Firefox/firefox.exe`, Action: "direct"},
	})
	curl := Process{PID: 10, Name: "curl.exe", Path: `C:\Windows\System32\curl.exe`}
	if d := set.Match(curl); d.Action != "proxy" || d.Proxy != "second" {
		t.Fatalf("disabled first rule should be skipped, got %+v", d)
	}
	full := Process{PID: 11, Name: "firefox.exe", Path: `C:\Program Files\Mozilla Firefox\firefox.exe`}
	if d := set.Match(full); d.Action != "direct" || d.RuleIndex != 2 {
		t.Fatalf("full path: %+v", d)
	}
	other := Process{PID: 12, Name: "firefox.exe", Path: `D:\firefox.exe`}
	if d := set.Match(other); d.Action != "" {
		t.Fatalf("different path must not match a full-path rule, got %+v", d)
	}
	notCurl := Process{Name: "notcurl.exe", Path: `C:\notcurl.exe`}
	if d := set.Match(notCurl); d.Action != "" {
		t.Fatalf("prefix name matched: %+v", d)
	}
	upper := Process{Name: "CURL.EXE", Path: `\\?\C:\Windows\System32\CURL.EXE`}
	if d := set.Match(upper); d.Action != "proxy" || d.Proxy != "second" {
		t.Fatalf("case/prefix: %+v", d)
	}
	if d := set.Match(Process{Path: `C:\Windows\System32\curl.exe`}); d.Proxy != "second" {
		t.Fatalf("name from path: %+v", d)
	}
}

func TestBase(t *testing.T) {
	if got := Base(`\\?\C:\Windows\System32\curl.exe`); got != "curl.exe" {
		t.Fatal(got)
	}
	if IsPath("curl.exe") {
		t.Fatal("bare name detected as path")
	}
	if !IsPath(`C:\curl.exe`) || !IsPath("bin/curl.exe") {
		t.Fatal("path not detected")
	}
	if !IsSystemDNS("svchost.exe") || IsSystemDNS("curl.exe") {
		t.Fatal("svchost")
	}
}
