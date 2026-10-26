package process

import (
	"sync"
	"time"

	"ashgate/internal/packet"
	"ashgate/internal/rules"
)

const (
	closeGrace = 15 * time.Second
	helperGap  = 50 * time.Millisecond
)

type exactKey struct {
	proto uint8
	addr  packet.Addr
}

type wildKey struct {
	proto uint8
	port  uint16
}

type entry struct {
	proc  rules.Process
	until time.Time
}

// Resolver remembers SOCKET/FLOW events and falls back to the IP Helper tables.
// A socket event wins over the helper table so a stale table cannot replace it.
type Resolver struct {
	mu         sync.Mutex
	exact      map[exactKey]entry
	wild       map[wildKey]entry
	helper     map[exactKey]uint32
	helperWild map[wildKey]uint32
	images     map[uint32]rules.Process
	helperAt   time.Time
	now        func() time.Time
	image      func(pid uint32) rules.Process
	loadHelper func() ([]Endpoint, error)
}

// New returns an empty resolver. On Windows it also queries IP Helper.
func New() *Resolver {
	r := &Resolver{
		exact:      map[exactKey]entry{},
		wild:       map[wildKey]entry{},
		helper:     map[exactKey]uint32{},
		helperWild: map[wildKey]uint32{},
		images:     map[uint32]rules.Process{},
		now:        time.Now,
		image: func(pid uint32) rules.Process {
			return rules.Process{PID: pid}
		},
	}
	configure(r)
	return r
}

// Observe records a SOCKET or FLOW event. closing keeps the entry for closeGrace.
func (r *Resolver) Observe(proto uint8, local packet.Addr, pid uint32, closing bool) {
	if r == nil || pid == 0 || local.Port == 0 || (proto != packet.ProtoTCP && proto != packet.ProtoUDP) {
		return
	}
	now := r.now()
	proc := r.resolve(pid)
	e := entry{proc: proc}
	if closing {
		e.until = now.Add(closeGrace)
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if unspecified(local) {
		r.wild[wildKey{proto, local.Port}] = e
		return
	}
	r.exact[exactKey{proto, local}] = e
}

// Lookup implements engine.Resolver.
func (r *Resolver) Lookup(proto uint8, src packet.Addr) (rules.Process, bool) {
	if r == nil || src.Port == 0 {
		return rules.Process{}, false
	}
	now := r.now()
	r.mu.Lock()
	if p, ok := r.socketLocked(proto, src, now); ok {
		r.mu.Unlock()
		return r.finish(p)
	}
	need := r.loadHelper != nil && (r.helperAt.IsZero() || now.Sub(r.helperAt) >= helperGap)
	r.mu.Unlock()

	if need {
		rows, err := r.loadHelper()
		r.mu.Lock()
		if err == nil {
			r.storeHelper(rows, now)
		} else if r.helperAt.IsZero() || now.Sub(r.helperAt) >= helperGap {
			r.helperAt = now
		}
		if p, ok := r.socketLocked(proto, src, now); ok {
			r.mu.Unlock()
			return r.finish(p)
		}
		p, ok := r.helperLocked(proto, src)
		r.mu.Unlock()
		if !ok {
			return rules.Process{}, false
		}
		return r.finish(p)
	}

	r.mu.Lock()
	p, ok := r.helperLocked(proto, src)
	r.mu.Unlock()
	if !ok {
		return rules.Process{}, false
	}
	return r.finish(p)
}

func (r *Resolver) finish(p rules.Process) (rules.Process, bool) {
	if p.Name == "" && p.Path == "" {
		p = r.resolve(p.PID)
	}
	if p.Name == "" && p.Path == "" {
		return rules.Process{}, false
	}
	return p, true
}

func (r *Resolver) socketLocked(proto uint8, src packet.Addr, now time.Time) (rules.Process, bool) {
	if e, ok := r.exact[exactKey{proto, src}]; ok {
		if alive(e, now) {
			return e.proc, true
		}
		delete(r.exact, exactKey{proto, src})
	}
	wk := wildKey{proto, src.Port}
	if e, ok := r.wild[wk]; ok {
		if alive(e, now) {
			return e.proc, true
		}
		delete(r.wild, wk)
	}
	return rules.Process{}, false
}

func (r *Resolver) helperLocked(proto uint8, src packet.Addr) (rules.Process, bool) {
	if pid, ok := r.helper[exactKey{proto, src}]; ok {
		return r.cached(pid), true
	}
	if pid, ok := r.helperWild[wildKey{proto, src.Port}]; ok {
		return r.cached(pid), true
	}
	return rules.Process{}, false
}

func (r *Resolver) cached(pid uint32) rules.Process {
	if p, ok := r.images[pid]; ok && (p.Name != "" || p.Path != "") {
		return p
	}
	return rules.Process{PID: pid}
}

func (r *Resolver) storeHelper(rows []Endpoint, now time.Time) {
	h := make(map[exactKey]uint32, len(rows))
	w := map[wildKey]uint32{}
	for _, row := range rows {
		if row.PID == 0 || row.Addr.Port == 0 {
			continue
		}
		if row.Unspecified {
			w[wildKey{row.Proto, row.Addr.Port}] = row.PID
			continue
		}
		h[exactKey{row.Proto, row.Addr}] = row.PID
	}
	r.helper = h
	r.helperWild = w
	r.helperAt = now
}

func (r *Resolver) resolve(pid uint32) rules.Process {
	r.mu.Lock()
	p, ok := r.images[pid]
	r.mu.Unlock()
	if ok && (p.Name != "" || p.Path != "") {
		return p
	}
	if r.image == nil {
		return rules.Process{PID: pid}
	}
	got := r.image(pid)
	got.PID = pid
	if got.Name == "" && got.Path != "" {
		got.Name = rules.Base(got.Path)
	}
	if got.Name == "" && got.Path == "" {
		return got
	}
	r.mu.Lock()
	r.images[pid] = got
	r.mu.Unlock()
	return got
}

func alive(e entry, now time.Time) bool {
	return e.until.IsZero() || now.Before(e.until)
}

func unspecified(a packet.Addr) bool {
	for i := uint8(0); i < a.Len; i++ {
		if a.IP[i] != 0 {
			return false
		}
	}
	return a.Len == 4 || a.Len == 16
}

// SetClock overrides the clock. Tests use it.
func (r *Resolver) SetClock(now func() time.Time) {
	if now != nil {
		r.now = now
	}
}

// SetImage overrides process-image lookup. Tests use it.
func (r *Resolver) SetImage(fn func(pid uint32) rules.Process) {
	r.image = fn
}

// SetHelper overrides the IP Helper refresh. Tests use it.
func (r *Resolver) SetHelper(fn func() ([]Endpoint, error)) {
	r.loadHelper = fn
}
