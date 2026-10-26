package engine

import (
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// ruleStat counts the traffic of one rule, including child processes that
// inherited it. The window shows it on the rule's row.
type ruleStat struct {
	flows    atomic.Int64
	up, down atomic.Int64
	mu       sync.Mutex
	err      string
	errAt    time.Time
}

func (s *ruleStat) fail(msg string, at time.Time) {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.err, s.errAt = msg, at
	s.mu.Unlock()
}

// RuleStat is a copy of one rule's counters.
type RuleStat struct {
	Flows int64
	Up    int64
	Down  int64
	Err   string
	ErrAt time.Time
}

// RuleKey identifies a rule for statistics: its process field, lower-case.
// It stays the same when rules are reordered.
func RuleKey(process string) string {
	return strings.ToLower(strings.Trim(strings.TrimSpace(process), `"`))
}

// statFor returns the counters for key. Callers hold e.mu.
func (e *Engine) statFor(key string) *ruleStat {
	if key == "" {
		return nil
	}
	s := e.stats[key]
	if s == nil {
		s = &ruleStat{}
		e.stats[key] = s
	}
	return s
}

// RuleStats returns every rule's counters since the engine started.
func (e *Engine) RuleStats() map[string]RuleStat {
	if e == nil {
		return nil
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make(map[string]RuleStat, len(e.stats))
	for k, s := range e.stats {
		s.mu.Lock()
		out[k] = RuleStat{Flows: s.flows.Load(), Up: s.up.Load(), Down: s.down.Load(), Err: s.err, ErrAt: s.errAt}
		s.mu.Unlock()
	}
	return out
}
