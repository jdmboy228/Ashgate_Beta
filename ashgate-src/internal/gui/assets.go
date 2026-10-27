package gui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed ui
var uiFS embed.FS

// uiTypes pins the media types of the window files. The window loads ES
// modules, which browsers refuse unless they come as JavaScript; Windows can
// map .js to text/plain in the registry, so the type must not depend on it.
var uiTypes = map[string]string{
	".html":  "text/html; charset=utf-8",
	".js":    "text/javascript; charset=utf-8",
	".css":   "text/css; charset=utf-8",
	".svg":   "image/svg+xml",
	".png":   "image/png",
	".woff2": "font/woff2",
}

func static() http.Handler {
	sub, err := fs.Sub(uiFS, "ui")
	if err != nil {
		panic(err)
	}
	files := http.FileServer(http.FS(sub))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ext := strings.ToLower(path.Ext(r.URL.Path))
		if r.URL.Path == "/" || r.URL.Path == "" {
			ext = ".html"
		}
		if t, ok := uiTypes[ext]; ok {
			w.Header().Set("Content-Type", t)
		}
		// Embedded files have no modification time, so the WebView could keep
		// scripts from an older exe. Revalidating costs nothing on loopback.
		if ext == ".html" || ext == ".js" || ext == ".css" {
			w.Header().Set("Cache-Control", "no-cache")
		}
		files.ServeHTTP(w, r)
	})
}
