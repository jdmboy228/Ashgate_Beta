package gui

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"ashgate/internal/config"
	"ashgate/internal/killswitch"
	"ashgate/internal/logbuf"
	"ashgate/internal/probe"
	"ashgate/internal/process"
	rt "ashgate/internal/runtime"
	"ashgate/internal/vless"
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
		{"/", `id="board"`},
		{"/", `src="js/main.js"`},
		{"/js/views/board.js", "Вставить ссылку vless://"},
		{"/js/views/board.js", "Перетащите приложение сюда"},
		{"/js/views/dialogs.js", "Локальный SOCKS5 для других программ"},
		{"/js/views/common.js", "Блокировать"},
		{"/js/views/dnd.js", "drop-target"},
		{"/css/app.css", "--lane-0"},
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
	if st := c.snapshotSince(g, true); !st.EventsSame || st.Events != nil {
		t.Fatalf("same generation should skip events: %+v", st.EventsSame)
	}
	logs.Add(logbuf.Event{Process: "curl.exe", Status: "closed"})
	if st := c.snapshotSince(g, true); st.EventsSame || len(st.Events) != 2 {
		t.Fatalf("new generation should send events: same=%v n=%d", st.EventsSame, len(st.Events))
	}
	if st := c.snapshotSince(0, false); !st.EventsSame || st.Events != nil {
		t.Fatalf("events=0 should leave the log out: same=%v n=%d", st.EventsSame, len(st.Events))
	}
}

// TestStateEventsParam checks the window can poll without the connection
// log while the log sheet is closed.
func TestStateEventsParam(t *testing.T) {
	logs, _ := logbuf.New(8, "")
	logs.Add(logbuf.Event{Process: "curl.exe", Status: "open"})
	c := newController(filepath.Join(t.TempDir(), "config.json"), config.Default(), logs, hooks{})
	h := c.Handler()
	get := func(q string) map[string]any {
		req := httptest.NewRequest(http.MethodGet, "/api/state"+q, nil)
		req.Host = "127.0.0.1:5000"
		req.Header.Set(tokenHeader, c.token)
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, req)
		var out map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	if st := get("?events=0"); st["events"] != nil || st["eventsSame"] != true {
		t.Fatalf("events=0: events=%v same=%v", st["events"], st["eventsSame"])
	}
	if st := get("?gen=0"); st["events"] == nil {
		t.Fatal("default request should carry events")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func TestKillSwitchBlocksWhileStopped(t *testing.T) {
	dir := t.TempDir()
	var lines []string
	fw := killswitch.NewWithRunner(filepath.Join(dir, "killswitch.json"), func(l string) error {
		lines = append(lines, l)
		return nil
	})
	cfg := config.Default()
	cfg.KillSwitch = true
	cfg.Proxies = []config.Proxy{{Name: "p", Type: "socks5", Address: "127.0.0.1:1080"}}
	cfg.Rules = []config.Rule{
		{Process: `C:\Apps\app.exe`, Action: "proxy", Proxy: "p"},
		{Process: "nowhere", Action: "proxy", Proxy: "p"},
		{Process: `C:\Apps\direct.exe`, Action: "direct"},
	}
	c := &controller{path: filepath.Join(dir, "config.json"), cfg: cfg, checks: map[string]probe.Report{},
		bridgeSt: map[string]vless.Status{}, hooks: hooks{firewall: fw}}
	c.syncKill()
	if got := fw.Blocked(); len(got) != 1 || got[0] != `C:\Apps\app.exe` {
		t.Fatalf("blocked %v (netsh %v)", got, lines)
	}
	if v := c.ksSnapshot(true); len(v.Missing) != 1 || v.Missing[0] != "nowhere" {
		t.Fatalf("missing %+v", v)
	}
	c.cfg.KillSwitch = false
	c.syncKill()
	if got := fw.Blocked(); len(got) != 0 {
		t.Fatalf("switch off left %v", got)
	}
}

func TestIconPathResolvesNamesAndMasks(t *testing.T) {
	oldRun, oldInst := listRunning, listInstalled
	defer func() { listRunning, listInstalled = oldRun, oldInst }()
	listRunning = func() ([]process.App, error) {
		return []process.App{{Name: "Discord.exe", Path: `C:\U\Discord\app-1.0.9\Discord.exe`}}, nil
	}
	listInstalled = func() []process.Installed {
		return []process.Installed{{Name: "Telegram Desktop", Path: `C:\T\Telegram.exe`}}
	}
	for in, want := range map[string]string{
		`C:\X\a.exe`:                  `C:\X\a.exe`,
		"telegram":                    `C:\T\Telegram.exe`,
		`*\Discord\app-*\Discord.exe`: `C:\U\Discord\app-1.0.9\Discord.exe`,
		"nothere.exe":                 "",
	} {
		if got := iconPath(in); got != want {
			t.Fatalf("iconPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIconCacheRemembersMisses(t *testing.T) {
	oldPNG, oldRun, oldInst := iconPNG, listRunning, listInstalled
	defer func() { iconPNG, listRunning, listInstalled = oldPNG, oldRun, oldInst }()
	calls := 0
	iconPNG = func(string) ([]byte, error) { calls++; return nil, errors.New("no icon") }
	listRunning = func() ([]process.App, error) { return nil, nil }
	listInstalled = func() []process.Installed { return nil }
	icons = &iconCache{m: map[string]iconEntry{}}
	for i := 0; i < 5; i++ {
		if _, ok := icons.get("ghost.exe"); ok {
			t.Fatal("icon for a missing program")
		}
	}
	if calls != 1 {
		t.Fatalf("icon looked up %d times", calls)
	}
}

func TestUIOnlySaveSkipsEngine(t *testing.T) {
	a := config.Default()
	b := config.Default()
	b.UI.Theme = "light"
	b.Groups = nil
	if engineView(a) != engineView(b) {
		t.Fatal("theme change counted as an engine change")
	}
	b.KillSwitch = true
	if engineView(a) == engineView(b) {
		t.Fatal("kill switch change ignored")
	}
}

// TestStartDoesNotDeadlock guards against 0.7.1's freeze: start held the
// controller lock while lifting the kill-switch block, which takes it too.
func TestStartDoesNotDeadlock(t *testing.T) {
	dir := t.TempDir()
	fw := killswitch.NewWithRunner(filepath.Join(dir, "killswitch.json"), func(string) error { return nil })
	c := newController(filepath.Join(dir, "config.json"), config.Default(), nil, hooks{
		firewall: fw,
		guard:    func(string) (func(), error) { return func() {}, nil },
	})
	c.startSession = func(context.Context, *config.Config, *logbuf.Buffer, *vless.Manager) (*rt.Session, error) {
		return &rt.Session{}, nil
	}
	done := make(chan error, 1)
	go func() { done <- c.start() }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("start did not return: controller deadlocked")
	}
	snap := make(chan struct{})
	go func() { c.snapshot(); close(snap) }()
	select {
	case <-snap:
	case <-time.After(3 * time.Second):
		t.Fatal("state request hangs after start")
	}
	stopped := make(chan struct{})
	go func() { _ = c.stop(); _ = c.replace(config.Default()); close(stopped) }()
	select {
	case <-stopped:
	case <-time.After(5 * time.Second):
		t.Fatal("stop or save hangs after start")
	}
}
