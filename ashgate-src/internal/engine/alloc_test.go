package engine

import "sync"

// seqAlloc is a deterministic port allocator for tests.
type seqAlloc struct {
	mu sync.Mutex
	n  uint16
}

func (s *seqAlloc) Reserve(ver int) (uint16, func(), error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.n++
	if s.n < 20000 {
		s.n = 20000
	}
	return s.n, func() {}, nil
}
