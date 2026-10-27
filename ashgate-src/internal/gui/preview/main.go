// Command preview serves the Ashgate window on localhost so the screens can be
// screenshotted without Windows. Open /?demo=1 (presets: #empty, #proxy,
// #off; add &theme=light or &sheet=log|proxies|settings).
package main

import (
	"flag"
	"log"
	"net/http"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:41729", "listen address")
	dir := flag.String("dir", "internal/gui/ui", "directory of the window files")
	flag.Parse()
	log.Printf("Ashgate UI preview at http://%s/?demo=1", *addr)
	log.Fatal(http.ListenAndServe(*addr, http.FileServer(http.Dir(*dir))))
}
