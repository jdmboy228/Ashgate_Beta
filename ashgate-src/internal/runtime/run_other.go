//go:build !windows

package runtime

import (
	"context"
	"errors"

	"ashgate/internal/config"
	"ashgate/internal/logbuf"
	"ashgate/internal/vless"
)

// Start reports that packet capture is only available on Windows.
func Start(context.Context, *config.Config, *logbuf.Buffer) (*Session, error) {
	return nil, errors.New("перехват трафика работает только в Windows 10/11 x64")
}

// StartWith reports that packet capture is only available on Windows.
func StartWith(context.Context, *config.Config, *logbuf.Buffer, *vless.Manager) (*Session, error) {
	return nil, errors.New("перехват трафика работает только в Windows 10/11 x64")
}
