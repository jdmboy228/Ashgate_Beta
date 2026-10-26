package killswitch

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// GuardCommand is the hidden ashgate.exe command that runs the guard.
const GuardCommand = "killswitch-guard"

// targetsFile holds the programs the guard blocks if Ashgate dies.
func targetsFile(state string) string {
	return filepath.Join(filepath.Dir(state), "killswitch-targets.json")
}

// SaveTargets records what the guard must block. Ashgate rewrites it while
// capture runs, as rules and running children change.
func SaveTargets(state string, paths []string) error {
	data, _ := json.Marshal(paths)
	tmp := targetsFile(state) + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, targetsFile(state))
}

func loadTargets(state string) []string {
	var list []string
	if data, err := os.ReadFile(targetsFile(state)); err == nil {
		_ = json.Unmarshal(data, &list)
	}
	return list
}

// StatePath is the file that records the installed firewall rules, next to
// the config.
func StatePath(configPath string) string {
	return filepath.Join(filepath.Dir(configPath), "killswitch.json")
}
