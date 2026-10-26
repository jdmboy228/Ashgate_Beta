// Package logbuf is a bounded connection log shared by the engine and the GUI.
package logbuf

import (
	"encoding/json"
	"io"
	"os"
	"sync"
	"time"
)

const (
	maxLogBytes = 5 << 20
	logKeep     = 2
)

var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// Event is one connection-log line.
type Event struct {
	Time      time.Time `json:"time"`
	Process   string    `json:"process"`
	PID       uint32    `json:"pid"`
	Proto     string    `json:"proto"`
	Dest      string    `json:"dest"`
	Via       string    `json:"via"`
	Status    string    `json:"status"`
	BytesUp   int64     `json:"bytesUp"`
	BytesDown int64     `json:"bytesDown"`
	Error     string    `json:"error,omitempty"`
}

// Buffer keeps the newest events and optionally mirrors them to a JSON-lines file.
type Buffer struct {
	mu   sync.Mutex
	ev   []Event
	cap  int
	pos  int
	full bool
	gen  uint64
	enc  *json.Encoder
	file *os.File
	path string
}

// New returns an in-memory buffer. file may be empty.
func New(capacity int, file string) (*Buffer, error) {
	if capacity < 1 {
		capacity = 2000
	}
	b := &Buffer{ev: make([]Event, capacity), cap: capacity}
	if file == "" {
		return b, nil
	}
	f, err := os.OpenFile(file, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, err
	}
	if st, statErr := f.Stat(); statErr == nil && st.Size() == 0 {
		_, _ = f.Write(utf8BOM)
	}
	b.file = f
	b.path = file
	b.enc = newEncoder(f)
	return b, nil
}

func newEncoder(f *os.File) *json.Encoder {
	enc := json.NewEncoder(f)
	enc.SetEscapeHTML(false)
	return enc
}

// Close closes the optional log file.
func (b *Buffer) Close() error {
	if b == nil || b.file == nil {
		return nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	err := b.file.Close()
	b.file = nil
	b.enc = nil
	return err
}

// Add appends an event. A zero time is replaced with the current local time.
func (b *Buffer) Add(e Event) {
	if b == nil {
		return
	}
	if e.Time.IsZero() {
		e.Time = time.Now()
	}
	b.mu.Lock()
	b.ev[b.pos] = e
	b.pos = (b.pos + 1) % b.cap
	if b.pos == 0 {
		b.full = true
	}
	b.gen++
	b.writeLocked(e)
	b.mu.Unlock()
}

func (b *Buffer) writeLocked(e Event) {
	if b.file == nil || b.enc == nil {
		return
	}
	if st, err := b.file.Stat(); err == nil && st.Size() >= maxLogBytes {
		b.rotateLocked()
	}
	if b.enc != nil {
		_ = b.enc.Encode(e)
	}
}

func (b *Buffer) rotateLocked() {
	if b.path == "" || b.file == nil {
		return
	}
	_ = b.file.Close()
	b.file = nil
	b.enc = nil
	_ = os.Remove(b.path + ".2")
	if logKeep < 2 {
		_ = os.Remove(b.path + ".1")
	} else {
		_ = os.Rename(b.path+".1", b.path+".2")
	}
	if err := os.Rename(b.path, b.path+".1"); err != nil {
		// The live file is gone only after a successful rename. Reopen it.
	}
	f, err := os.OpenFile(b.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	if st, statErr := f.Stat(); statErr == nil && st.Size() == 0 {
		_, _ = f.Write(utf8BOM)
	}
	b.file = f
	b.enc = newEncoder(f)
}

// Clear drops the in-memory events. A log file, if any, is left as history.
func (b *Buffer) Clear() {
	if b == nil {
		return
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for i := range b.ev {
		b.ev[i] = Event{}
	}
	b.pos = 0
	b.full = false
	b.gen++
}

// Generation changes every time an event is added.
func (b *Buffer) Generation() uint64 {
	if b == nil {
		return 0
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.gen
}

// Snapshot returns events from oldest to newest.
func (b *Buffer) Snapshot() []Event {
	if b == nil {
		return nil
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.full && b.pos == 0 {
		return nil
	}
	if !b.full {
		out := make([]Event, b.pos)
		copy(out, b.ev[:b.pos])
		return out
	}
	out := make([]Event, b.cap)
	n := copy(out, b.ev[b.pos:])
	copy(out[n:], b.ev[:b.pos])
	return out
}

// WriteTo writes the snapshot as JSON lines.
func (b *Buffer) WriteTo(w io.Writer) (int64, error) {
	enc := json.NewEncoder(w)
	var n int64
	for _, e := range b.Snapshot() {
		if err := enc.Encode(e); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}
