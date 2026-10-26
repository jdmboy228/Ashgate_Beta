package gui

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"ashgate/internal/config"
	"ashgate/internal/logbuf"
	"ashgate/internal/probe"
	"ashgate/internal/process"
	rt "ashgate/internal/runtime"
	"ashgate/internal/version"
	"ashgate/internal/vless"
)

// hooks are filled by the Windows host. Nil hooks degrade to a clear error.
type hooks struct {
	admin        bool
	window       func(op string)
	browse       func() (string, error)
	autostart    func() (bool, error)
	setAutostart func(on bool) error
}

type controller struct {
	mu       sync.Mutex
	path     string
	cfg      *config.Config
	logs     *logbuf.Buffer
	sess     *rt.Session
	checks   map[string]probe.Report
	bridges  *vless.Manager
	bridgeSt map[string]vless.Status
	errText  string
	notice   string
	auto     bool
	autoAt   time.Time
	hooks    hooks
	// token authenticates API calls. Only the WebView window knows it, so
	// web pages and other local programs cannot drive this elevated process.
	token string
	// startMu keeps two Start clicks from opening two capture sessions.
	startMu sync.Mutex
}

// tokenHeader carries controller.token on every API request.
const tokenHeader = "X-Ashgate-Token"

func newToken() string {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}

func newController(path string, cfg *config.Config, logs *logbuf.Buffer, h hooks) *controller {
	if cfg == nil {
		cfg = config.Default()
	}
	vless.PortOwner = process.TCPOwner
	c := &controller{
		path: path, cfg: cfg, logs: logs, checks: map[string]probe.Report{},
		bridges: vless.NewManager(), bridgeSt: map[string]vless.Status{}, hooks: h,
		token: newToken(),
	}
	_ = c.syncBridges(cfg)
	return c
}

func (c *controller) setNotice(text string) {
	if c == nil || text == "" {
		return
	}
	c.mu.Lock()
	c.notice = text
	c.mu.Unlock()
}

// shutdown stops published VLESS bridges. Capture is stopped separately.
func (c *controller) shutdown() {
	if c == nil || c.bridges == nil {
		return
	}
	c.bridges.Close()
}

func (c *controller) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			if !c.authorized(r) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			c.api(w, r)
			return
		}
		static().ServeHTTP(w, r)
	})
}

// authorized accepts requests addressed to the loopback listener that carry
// the window token. The Host check stops DNS-rebinding pages; the token stops
// cross-site requests and other local programs. Image tags cannot send
// headers, so the token may also come as the "t" query parameter.
func (c *controller) authorized(r *http.Request) bool {
	host, _, err := net.SplitHostPort(r.Host)
	if err != nil {
		host = r.Host
	}
	switch strings.Trim(host, "[]") {
	case "127.0.0.1", "::1", "localhost":
	default:
		return false
	}
	got := r.Header.Get(tokenHeader)
	if got == "" {
		got = r.URL.Query().Get("t")
	}
	return c.token != "" && subtle.ConstantTimeCompare([]byte(got), []byte(c.token)) == 1
}

func (c *controller) api(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	switch r.URL.Path {
	case "/api/state":
		if r.Method != http.MethodGet {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		// The window polls several times a second. When it already has the
		// newest log generation, skip re-sending up to 300 events.
		since, _ := strconv.ParseUint(r.URL.Query().Get("gen"), 10, 64)
		writeJSON(w, http.StatusOK, c.snapshotSince(since))
	case "/api/start":
		c.post(w, r, func() (any, error) { return nil, c.start() })
	case "/api/stop":
		c.post(w, r, func() (any, error) { return nil, c.stop() })
	case "/api/config":
		c.post(w, r, func() (any, error) {
			var body struct {
				Config    config.Config `json:"config"`
				Autostart *bool         `json:"autostart"`
			}
			if err := readJSON(r, &body); err != nil {
				return nil, err
			}
			if err := c.replace(&body.Config); err != nil {
				return nil, err
			}
			if body.Autostart != nil {
				if err := c.applyAutostart(*body.Autostart); err != nil {
					return nil, err
				}
			}
			return nil, nil
		})
	case "/api/vless/parse":
		c.post(w, r, func() (any, error) {
			var body struct {
				Link string `json:"link"`
			}
			if err := readJSON(r, &body); err != nil {
				return nil, err
			}
			parsed, err := vless.ParseLink(body.Link)
			if err != nil {
				return nil, err
			}
			return parsed, nil
		})
	case "/api/probe":
		c.post(w, r, func() (any, error) {
			var body struct {
				Name  string        `json:"name"`
				Proxy *config.Proxy `json:"proxy"`
			}
			if err := readJSON(r, &body); err != nil {
				return nil, err
			}
			p, err := c.proxyForProbe(body.Name, body.Proxy)
			if err != nil {
				return nil, err
			}
			return c.probeOne(p), nil
		})
	case "/api/probe-all":
		c.post(w, r, func() (any, error) {
			c.mu.Lock()
			list := append([]config.Proxy(nil), c.cfg.Proxies...)
			c.mu.Unlock()
			var wg sync.WaitGroup
			for _, p := range list {
				wg.Add(1)
				go func(p config.Proxy) {
					defer wg.Done()
					c.probeOne(p)
				}(p)
			}
			wg.Wait()
			return c.snapshot().Checks, nil
		})
	case "/api/icon":
		if r.Method != http.MethodGet {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		png, err := process.ExeIconPNG(r.URL.Query().Get("path"))
		if err != nil || len(png) == 0 {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Write(png)
	case "/api/processes":
		if r.Method != http.MethodGet {
			http.Error(w, "method", http.StatusMethodNotAllowed)
			return
		}
		apps, err := process.List()
		if err != nil {
			writeErr(w, err)
			return
		}
		if apps == nil {
			apps = []process.App{}
		}
		writeJSON(w, http.StatusOK, apps)
	case "/api/reveal":
		c.post(w, r, func() (any, error) {
			return nil, revealConfigDir(c.path)
		})
	case "/api/browse":
		c.post(w, r, func() (any, error) {
			if c.hooks.browse == nil {
				return nil, errors.New("выбор файла доступен в окне Windows")
			}
			path, err := c.hooks.browse()
			if err != nil {
				return nil, err
			}
			return map[string]string{"path": path}, nil
		})
	case "/api/log/clear":
		c.post(w, r, func() (any, error) {
			if c.logs != nil {
				c.logs.Clear()
			}
			return nil, nil
		})
	case "/api/window":
		c.post(w, r, func() (any, error) {
			var body struct {
				Op string `json:"op"`
			}
			if err := readJSON(r, &body); err != nil {
				return nil, err
			}
			if c.hooks.window != nil {
				c.hooks.window(body.Op)
			}
			return nil, nil
		})
	default:
		http.NotFound(w, r)
	}
}

func (c *controller) post(w http.ResponseWriter, r *http.Request, fn func() (any, error)) {
	if r.Method != http.MethodPost {
		http.Error(w, "method", http.StatusMethodNotAllowed)
		return
	}
	body, err := fn()
	if err != nil {
		writeErr(w, err)
		return
	}
	if body == nil {
		body = map[string]bool{"ok": true}
	}
	writeJSON(w, http.StatusOK, body)
}

type stateView struct {
	Version    string                  `json:"version"`
	Path       string                  `json:"path"`
	Running    bool                    `json:"running"`
	Active     int64                   `json:"active"`
	TCP        int                     `json:"tcp"`
	UDP        int                     `json:"udp"`
	BytesUp    int64                   `json:"bytesUp"`
	BytesDown  int64                   `json:"bytesDown"`
	Admin      bool                    `json:"admin"`
	Driver     bool                    `json:"driver"`
	Error      string                  `json:"error"`
	Notice     string                  `json:"notice,omitempty"`
	Theme      string                  `json:"theme"`
	Autostart  bool                    `json:"autostart"`
	Config     *config.Config          `json:"config"`
	Checks     map[string]probe.Report `json:"checks"`
	Bridges    map[string]vless.Status `json:"bridges"`
	Events     []eventView             `json:"events"`
	EventsSame bool                    `json:"eventsSame,omitempty"`
	Generation uint64                  `json:"generation"`
}

type eventView struct {
	Time      string `json:"time"`
	Process   string `json:"process"`
	PID       uint32 `json:"pid"`
	Proto     string `json:"proto"`
	Dest      string `json:"dest"`
	Via       string `json:"via"`
	Status    string `json:"status"`
	BytesUp   int64  `json:"bytesUp"`
	BytesDown int64  `json:"bytesDown"`
	Error     string `json:"error,omitempty"`
}

func (c *controller) snapshot() stateView {
	return c.snapshotSince(0)
}

// snapshotSince leaves Events out and sets EventsSame when the caller
// already saw log generation since.
func (c *controller) snapshotSince(since uint64) stateView {
	c.refreshAuto()
	c.mu.Lock()
	defer c.mu.Unlock()
	cfg := cloneCfg(c.cfg)
	running := c.sess != nil && c.sess.Running()
	var tcp, udp int
	var up, down int64
	var active int64
	errText := c.errText
	if c.sess != nil {
		active = c.sess.Active()
		tcp, udp = c.sess.FlowCounts()
		up, down = c.sess.Traffic()
		if e := c.sess.Err(); e != nil && !running {
			errText = e.Error()
		}
	}
	theme := cfg.UI.Theme
	if theme == "" {
		theme = "dark"
	}
	notice := c.notice
	c.notice = ""
	checks := map[string]probe.Report{}
	for k, v := range c.checks {
		checks[k] = v
	}
	bridges := map[string]vless.Status{}
	for k, v := range c.bridgeSt {
		bridges[k] = v
	}
	g := gen(c.logs)
	var events []eventView
	same := since != 0 && since == g
	if !same {
		events = eventViews(c.logs)
	}
	return stateView{
		Version:    version.Version,
		Path:       c.path,
		Running:    running,
		Active:     active,
		TCP:        tcp,
		UDP:        udp,
		BytesUp:    up,
		BytesDown:  down,
		Admin:      c.hooks.admin,
		Driver:     running,
		Error:      errText,
		Notice:     notice,
		Theme:      theme,
		Autostart:  c.auto,
		Config:     cfg,
		Checks:     checks,
		Bridges:    bridges,
		Events:     events,
		EventsSame: same,
		Generation: g,
	}
}

func (c *controller) refreshAuto() {
	if c.hooks.autostart == nil {
		return
	}
	c.mu.Lock()
	fresh := time.Since(c.autoAt) < 3*time.Second
	c.mu.Unlock()
	if fresh {
		return
	}
	on, err := c.hooks.autostart()
	c.mu.Lock()
	defer c.mu.Unlock()
	c.autoAt = time.Now()
	if err == nil {
		c.auto = on
	}
}

func (c *controller) running() (bool, int64, string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.sess == nil || !c.sess.Running() {
		return false, 0, c.errText
	}
	return true, c.sess.Active(), ""
}

func (c *controller) start() error {
	c.startMu.Lock()
	defer c.startMu.Unlock()
	c.mu.Lock()
	if c.sess != nil && c.sess.Running() {
		c.mu.Unlock()
		return nil
	}
	cfg := cloneCfg(c.cfg)
	logs := c.logs
	c.mu.Unlock()
	sess, err := rt.StartWith(context.Background(), cfg, logs, c.bridges)
	c.mu.Lock()
	defer c.mu.Unlock()
	if err != nil {
		c.errText = err.Error()
		return err
	}
	c.sess = sess
	c.errText = ""
	go func() {
		<-sess.Done()
		c.mu.Lock()
		if c.sess == sess {
			if e := sess.Err(); e != nil {
				c.errText = e.Error()
			}
		}
		c.mu.Unlock()
	}()
	return nil
}

func (c *controller) stop() error {
	c.mu.Lock()
	sess := c.sess
	c.mu.Unlock()
	if sess == nil {
		return nil
	}
	sess.Stop()
	select {
	case <-sess.Done():
	case <-time.After(8 * time.Second):
		return errors.New("движок не остановился за 8 секунд")
	}
	return nil
}

func (c *controller) replace(next *config.Config) error {
	c.mu.Lock()
	old := c.cfg
	c.mu.Unlock()
	if next != nil && next.Extra == nil && old != nil {
		next.Extra = old.Extra
	}
	cp := cloneCfg(next)
	cp.ApplyDefaults()
	if err := cp.Validate(); err != nil {
		return errors.New(ruConfig(err))
	}
	if err := cp.CheckDNSServers(); err != nil {
		return errors.New(ruConfig(err))
	}
	if err := config.Save(c.path, cp); err != nil {
		return err
	}
	c.mu.Lock()
	c.cfg = cp
	sess := c.sess
	running := sess != nil && sess.Running()
	c.mu.Unlock()
	syncErr := c.syncBridges(cp)
	if running {
		if err := sess.Apply(cp); err != nil && syncErr == nil {
			syncErr = err
		}
	}
	if syncErr != nil {
		return errors.New(ruConfig(syncErr))
	}
	return nil
}

func (c *controller) syncBridges(cfg *config.Config) error {
	if c == nil || c.bridges == nil || cfg == nil {
		return nil
	}
	cp := cloneCfg(cfg)
	c.mu.Lock()
	before := map[string]vless.Status{}
	for k, v := range c.bridgeSt {
		before[k] = v
	}
	logs := c.logs
	c.mu.Unlock()
	st, err := rt.WireVLESS(context.Background(), c.bridges, cp)
	if st == nil {
		st = map[string]vless.Status{}
	}
	c.mu.Lock()
	c.bridgeSt = st
	c.mu.Unlock()
	for name, s := range st {
		prev := before[name]
		if s.Err != "" && s.Err != prev.Err {
			if logs != nil {
				logs.Add(logbuf.Event{Process: "ashgate", Proto: "TCP", Via: name, Status: "error", Error: s.Err})
			}
			continue
		}
		if s.Up && s.SOCKS != "" && s.SOCKS != prev.SOCKS && logs != nil {
			logs.Add(logbuf.Event{Process: "ashgate", Proto: "TCP", Dest: s.SOCKS, Via: name, Status: "open"})
		}
	}
	return err
}

func (c *controller) applyAutostart(on bool) error {
	if c.hooks.setAutostart == nil {
		return errors.New("автозапуск недоступен в этом режиме")
	}
	if err := c.hooks.setAutostart(on); err != nil {
		return err
	}
	c.mu.Lock()
	c.auto = on
	c.autoAt = time.Now()
	c.mu.Unlock()
	return nil
}

func (c *controller) proxyForProbe(name string, p *config.Proxy) (config.Proxy, error) {
	if p != nil && (strings.TrimSpace(p.Address) != "" || p.Type == "vless" || strings.TrimSpace(p.Link) != "") {
		if p.Type == "" {
			p.Type = "socks5"
		}
		if p.Type == "vless" {
			if err := p.Prepare(); err != nil {
				return config.Proxy{}, err
			}
		}
		return *p, nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	got, ok := c.cfg.ProxyByName(name)
	if !ok {
		return config.Proxy{}, errors.New("прокси не найден")
	}
	return got, nil
}

func (c *controller) probeOne(p config.Proxy) probe.Report {
	rep := probe.Check(context.Background(), p)
	if p.Name != "" {
		c.mu.Lock()
		c.checks[p.Name] = rep
		c.mu.Unlock()
	}
	return rep
}

func cloneCfg(cfg *config.Config) *config.Config {
	if cfg == nil {
		return config.Default()
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		cp := *cfg
		cp.Extra = config.CloneExtra(cfg.Extra)
		return &cp
	}
	var out config.Config
	if err := json.Unmarshal(raw, &out); err != nil {
		cp := *cfg
		cp.Extra = config.CloneExtra(cfg.Extra)
		return &cp
	}
	out.Extra = config.CloneExtra(cfg.Extra)
	return &out
}

func eventViews(logs *logbuf.Buffer) []eventView {
	if logs == nil {
		return []eventView{}
	}
	all := logs.Snapshot()
	if len(all) > 300 {
		all = all[len(all)-300:]
	}
	out := make([]eventView, 0, len(all))
	for i := len(all) - 1; i >= 0; i-- {
		e := all[i]
		out = append(out, eventView{
			Time:      e.Time.Format("15:04:05"),
			Process:   e.Process,
			PID:       e.PID,
			Proto:     e.Proto,
			Dest:      e.Dest,
			Via:       e.Via,
			Status:    e.Status,
			BytesUp:   e.BytesUp,
			BytesDown: e.BytesDown,
			Error:     e.Error,
		})
	}
	return out
}

func gen(logs *logbuf.Buffer) uint64 {
	if logs == nil {
		return 0
	}
	return logs.Generation()
}

func revealConfigDir(path string) error {
	if path == "" {
		return errors.New("путь к конфигу неизвестен")
	}
	dir := filepath.Dir(path)
	if runtime.GOOS != "windows" {
		return errors.New("папка открывается в Windows")
	}
	return exec.Command("explorer", dir).Start()
}

func ruConfig(err error) string {
	if err == nil {
		return ""
	}
	s := err.Error()
	switch {
	case strings.Contains(s, "svchost"):
		return "Не указывайте svchost.exe. Для системного DNS включите «Системный резолвер» в настройках."
	case strings.Contains(s, "unknown proxy"):
		return "В правиле указан прокси, которого нет в списке."
	case strings.Contains(s, "proxy is required"):
		return "Для действия «прокси» выберите сервер."
	case strings.Contains(s, "must be empty"):
		return "Для «напрямую» и «блокировать» поле прокси должно быть пустым."
	case strings.Contains(s, "duplicate"):
		return "Имя прокси уже занято."
	case strings.Contains(s, "invalid name"):
		return "Имя прокси: буквы, цифры, точка, _ или -."
	case strings.Contains(s, "type must be"):
		return "Тип прокси: SOCKS5, HTTP или VLESS."
	case strings.Contains(s, "Не удалось разобрать ссылку VLESS"):
		return s
	case strings.Contains(s, "systemResolverProxy"):
		return "Для системного резолвера выберите прокси."
	case strings.Contains(s, "process is required"):
		return "Укажите процесс: имя файла или полный путь."
	case strings.Contains(s, "dns.servers is required"):
		return "Укажите хотя бы один DNS-сервер, например 1.1.1.1:53."
	case strings.HasPrefix(s, "dns server "):
		return "DNS-сервер указан неверно: нужен IP и порт, например 1.1.1.1:53."
	default:
		return s
	}
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return errors.New("не удалось прочитать запрос")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func writeErr(w http.ResponseWriter, err error) {
	writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
}
