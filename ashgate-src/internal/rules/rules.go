// Package rules matches a process against the configured proxy rules.
package rules

import (
	"strings"

	"ashgate/internal/config"
)

// Process is the application that owns a socket.
type Process struct {
	PID  uint32
	Name string
	Path string
}

// Decision is the first matching rule, or Action == "" when nothing matched.
type Decision struct {
	Action    string
	Proxy     string
	RuleIndex int
}

// Set is an immutable list of enabled rules in config order.
type Set struct {
	rules []compiled
}

type compiled struct {
	path   bool
	match  string
	action string
	proxy  string
	index  int
}

// Compile keeps enabled rules in order. Disabled rules are skipped.
func Compile(rules []config.Rule) *Set {
	out := &Set{rules: make([]compiled, 0, len(rules))}
	for i, r := range rules {
		if !r.IsEnabled() {
			continue
		}
		raw := strings.TrimSpace(r.Process)
		raw = strings.Trim(raw, `"`)
		c := compiled{action: r.Action, proxy: r.Proxy, index: i}
		if IsPath(raw) {
			c.path = true
			c.match = NormalizePath(raw)
		} else {
			c.match = NormalizeName(raw)
		}
		out.rules = append(out.rules, c)
	}
	return out
}

// Match returns the first matching enabled rule.
func (s *Set) Match(p Process) Decision {
	if s == nil {
		return Decision{RuleIndex: -1}
	}
	name := NormalizeName(p.Name)
	if name == "" {
		name = Base(p.Path)
	}
	path := NormalizePath(p.Path)
	for _, r := range s.rules {
		if r.path {
			if path != "" && path == r.match {
				return Decision{Action: r.action, Proxy: r.proxy, RuleIndex: r.index}
			}
			continue
		}
		if name != "" && name == r.match {
			return Decision{Action: r.action, Proxy: r.proxy, RuleIndex: r.index}
		}
	}
	return Decision{RuleIndex: -1}
}

// IsPath reports whether the rule field is a filesystem path rather than a bare exe name.
func IsPath(p string) bool {
	p = strings.TrimSpace(p)
	if strings.ContainsAny(p, `\/`) {
		return true
	}
	return len(p) >= 2 && p[1] == ':'
}

// NormalizePath lower-cases a Windows path and strips the extended-length prefix.
func NormalizePath(p string) string {
	p = strings.TrimSpace(p)
	p = strings.Trim(p, `"`)
	p = strings.ReplaceAll(p, "/", `\`)
	p = strings.ToLower(p)
	p = strings.TrimPrefix(p, `\??\`)
	p = strings.TrimPrefix(p, `\\?\`)
	return p
}

// NormalizeName returns the lower-case file name.
func NormalizeName(p string) string {
	return Base(p)
}

// Base returns the lower-case file name of a Windows path.
func Base(p string) string {
	p = NormalizePath(p)
	if i := strings.LastIndex(p, `\`); i >= 0 {
		p = p[i+1:]
	}
	return p
}

// IsSystemDNS reports the Windows DNS Client host process.
func IsSystemDNS(name string) bool {
	return Base(name) == "svchost.exe"
}
