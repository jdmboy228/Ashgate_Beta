//go:build !windows

package process

// App is one running executable.
type App struct {
	PID  uint32 `json:"pid"`
	Name string `json:"name"`
	Path string `json:"path"`
}

// List is empty outside Windows.
func List() ([]App, error) { return nil, nil }
