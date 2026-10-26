package gui

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"ashgate/internal/config"
	"ashgate/internal/logbuf"
)

func TestControllerSavesBlockRule(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.json")
	logs, err := logbuf.New(8, "")
	if err != nil {
		t.Fatal(err)
	}
	c := newController(path, config.Default(), logs, hooks{})
	on := true
	next := config.Default()
	next.Rules = []config.Rule{{
		Enabled: &on,
		Process: "telemetry.exe",
		Action:  "block",
	}}
	if err := c.replace(next); err != nil {
		t.Fatal(err)
	}
	got, err := config.Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Rules) != 1 || got.Rules[0].Action != "block" || got.Rules[0].Proxy != "" {
		t.Fatalf("%+v", got.Rules)
	}
	if got.Version != 1 {
		t.Fatalf("version %d", got.Version)
	}

	bad := config.Default()
	bad.Proxies = []config.Proxy{{Name: "local", Type: "socks5", Address: "127.0.0.1:1080"}}
	bad.Rules = []config.Rule{{Process: "telemetry.exe", Action: "block", Proxy: "local"}}
	err = c.replace(bad)
	if err == nil || !strings.Contains(err.Error(), "пустым") {
		t.Fatal(err)
	}
}

func TestUIShellServed(t *testing.T) {
	c := newController(filepath.Join(t.TempDir(), "config.json"), config.Default(), nil, hooks{})
	h := c.Handler()
	for _, tc := range []struct {
		path string
		want string
	}{
		{"/", `id="app"`},
		{"/app.js", "Вставить ссылку"},
		{"/app.js", "Локальный SOCKS5-порт"},
		{"/app.js", "блокировать"},
		{"/app.css", "#FF7A45"},
		{"/logo.svg", "svg"},
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, tc.path, nil))
		if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), tc.want) {
			t.Fatalf("%s: %d %q", tc.path, rr.Code, rr.Body.String()[:min(80, rr.Body.Len())])
		}
	}
}

func TestParseVLESSAPI(t *testing.T) {
	c := newController(filepath.Join(t.TempDir(), "config.json"), config.Default(), nil, hooks{})
	h := c.Handler()
	const link = "vless://b7e2c1a0-4f3a-4c2b-9a11-111111111111@203.0.113.10:443?encryption=none&security=reality&type=xhttp&path=%2Fxhttp&mode=auto&sni=www.microsoft.com&fp=chrome&pbk=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&sid=ab12#aeza-se"
	req := httptest.NewRequest(http.MethodPost, "/api/vless/parse", strings.NewReader(`{"link":"`+link+`"}`))
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"network":"xhttp"`) || !strings.Contains(rr.Body.String(), "203.0.113.10:443") {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
	bad := httptest.NewRequest(http.MethodPost, "/api/vless/parse", strings.NewReader(`{"link":"https://example"}`))
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, bad)
	if rr.Code == http.StatusOK || !strings.Contains(rr.Body.String(), "Не удалось разобрать ссылку VLESS") {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
