//go:build !windows

package process

import "errors"

// ExeIconPNG is the Windows extractor. Other systems have no exe icons.
func ExeIconPNG(path string) ([]byte, error) {
	if path == "" {
		return nil, errors.New("пустой путь")
	}
	return nil, errors.New("иконка exe доступна в Windows")
}
