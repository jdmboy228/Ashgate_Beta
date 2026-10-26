package process

import "ashgate/internal/rules"

// WithParents fills each process's ancestor chain from the same snapshot.
// A parent that started after its child holds a reused PID and ends the
// chain.
func WithParents(list []rules.Process) []rules.Process {
	by := make(map[uint32]rules.Process, len(list))
	for _, p := range list {
		by[p.PID] = p
	}
	out := make([]rules.Process, len(list))
	for i, p := range list {
		child := p
		seen := map[uint32]bool{p.PID: true}
		for len(p.Parents) < maxParents {
			par, ok := by[child.PPID]
			if !ok || seen[par.PID] {
				break
			}
			if par.Started != 0 && child.Started != 0 && par.Started > child.Started {
				break
			}
			seen[par.PID] = true
			par.Parents = nil
			p.Parents = append(p.Parents, par)
			child = par
		}
		out[i] = p
	}
	return out
}
