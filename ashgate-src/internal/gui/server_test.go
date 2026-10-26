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
	req.Header.Set(tokenHeader, c.token)
	req.Host = "127.0.0.1:5000"
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), `"network":"xhttp"`) || !strings.Contains(rr.Body.String(), "203.0.113.10:443") {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
	bad := httptest.NewRequest(http.MethodPost, "/api/vless/parse", strings.NewReader(`{"link":"https://example"}`))
	bad.Header.Set(tokenHeader, c.token)
	bad.Host = "127.0.0.1:5000"
	rr = httptest.NewRecorder()
	h.ServeHTTP(rr, bad)
	if rr.Code == http.StatusOK || !strings.Contains(rr.Body.String(), "Не удалось разобрать ссылку VLESS") {
		t.Fatalf("%d %s", rr.Code, rr.Body.String())
	}
}

func TestAPIRequiresToken(t *testing.T) {
	c := newController(filepath.Join(t.TempDir(), "config.json"), config.Default(), nil, hooks{})
	h := c.Handler()
	for _, tc := range []struct {
		name  string
		host  string
		token string
		query string
		want  int
	}{
		{"no token", "127.0.0.1:5000", "", "", http.StatusForbidden},
		{"wrong token", "127.0.0.1:5000", "nope", "", http.StatusForbidden},
		{"rebinding host", "evil.example:5000", c.token, "", http.StatusForbidden},
		{"header", "127.0.0.1:5000", c.token, "", http.StatusOK},
		{"query", "127.0.0.1:5000", "", "?t=" + c.token, http.StatusOK},
	} {
		req := httptest.NewRequest(http.MethodGet, "/api/state"+tc.query, nil)
		req.Host = tc.host
		if tc.token != "" {
			req.Header.Set(tokenHeader, tc.token)
		}
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		if rr.Code != tc.want {
			t.Fatalf("%s: got %d want %d", tc.name, rr.Code, tc.want)
		}
	}
}

func TestStateSkipsUnchangedEvents(t *testing.T) {
	logs, _ := logbuf.New(8, "")
	logs.Add(logbuf.Event{Process: "curl.exe", Status: "open"})
	c := newController(filepath.Join(t.TempDir(), "config.json"), config.Default(), logs, hooks{})
	g := logs.Generation()
	if st := c.snapshotSince(g); !st.EventsSame || st.Events != nil {
		t.Fatalf("same generation should skip events: %+v", st.EventsSame)
	}
	logs.Add(logbuf.Event{Process: "curl.exe", Status: "closed"})
	if st := c.snapshotSince(g); st.EventsSame || len(st.Events) != 2 {
		t.Fatalf("new generation should send events: same=%v n=%d", st.EventsSame, len(st.Events))
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
