.PHONY: test build package

test:
	go test -race ./...
	node --test internal/gui/uitest/

build:
	mkdir -p dist
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o dist/ashgate.exe ./cmd/ashgate

package:
	bash scripts/package.sh
