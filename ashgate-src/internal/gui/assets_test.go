package gui

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"path"
	"regexp"
	"strings"
	"testing"
)

// TestUIFilesResolve walks the embedded window: every file index.html links
// and every ES module import must exist, so a renamed file fails the build
// here instead of leaving a blank window.
func TestUIFilesResolve(t *testing.T) {
	ui, err := fs.Sub(uiFS, "ui")
	if err != nil {
		t.Fatal(err)
	}
	exists := func(p string) bool {
		_, err := fs.Stat(ui, p)
		return err == nil
	}
	index, err := fs.ReadFile(ui, "index.html")
	if err != nil {
		t.Fatal(err)
	}
	refs := regexp.MustCompile(`(?:src|href)="([^"#?:]+)"`).FindAllStringSubmatch(string(index), -1)
	if len(refs) < 3 {
		t.Fatalf("index.html links too few files: %v", refs)
	}
	for _, m := range refs {
		if !exists(m[1]) {
			t.Errorf("index.html links missing %s", m[1])
		}
	}
	imports := regexp.MustCompile(`(?m)(?:^import\s[^"']*|^export\s[^"']*\sfrom\s|import\()\s*["'](\.[^"']+)["']`)
	modules := 0
	err = fs.WalkDir(ui, "js", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(p, ".js") {
			return err
		}
		modules++
		src, err := fs.ReadFile(ui, p)
		if err != nil {
			return err
		}
		for _, m := range imports.FindAllStringSubmatch(string(src), -1) {
			target := path.Join(path.Dir(p), m[1])
			if !exists(target) {
				t.Errorf("%s imports missing %s", p, m[1])
			}
		}
		// Inline handlers would break under a strict CSP and hide errors.
		if strings.Contains(string(src), "onerror=") || strings.Contains(string(src), "onload=") {
			t.Errorf("%s uses an inline event handler", p)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if modules < 10 {
		t.Fatalf("found only %d modules", modules)
	}
	css, err := fs.ReadFile(ui, "css/app.css")
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range regexp.MustCompile(`url\("([^"]+)"\)`).FindAllStringSubmatch(string(css), -1) {
		if !exists(path.Join("css", m[1])) {
			t.Errorf("app.css references missing %s", m[1])
		}
	}
}

func TestStaticTypes(t *testing.T) {
	h := static()
	for p, want := range map[string]string{
		"/":                "text/html",
		"/js/main.js":      "text/javascript",
		"/css/app.css":     "text/css",
		"/logo.svg":        "image/svg+xml",
		"/js/model.js":     "text/javascript",
		"/js/views/dnd.js": "text/javascript",
	} {
		rr := httptest.NewRecorder()
		h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, p, nil))
		if rr.Code != http.StatusOK {
			t.Fatalf("%s: status %d", p, rr.Code)
		}
		if got := rr.Header().Get("Content-Type"); !strings.HasPrefix(got, want) {
			t.Errorf("%s: Content-Type %q, want %s", p, got, want)
		}
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/js/main.js", nil))
	if rr.Header().Get("Cache-Control") != "no-cache" {
		t.Errorf("scripts must be revalidated, got %q", rr.Header().Get("Cache-Control"))
	}
}
