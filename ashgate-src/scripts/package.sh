#!/bin/sh
# Cross-compile ashgate.exe and stage the signed WinDivert 2.2.2 files.
set -eu
cd "$(dirname "$0")/.."

ver=2.2.2
mkdir -p build dist
zip="build/WinDivert-${ver}-A.zip"
url="https://github.com/basil00/WinDivert/releases/download/v${ver}/WinDivert-${ver}-A.zip"
if [ ! -f "$zip" ]; then
  curl -fsSL -o "$zip" "$url"
fi
rm -rf build/windivert
unzip -q "$zip" -d build/windivert
dll=$(find build/windivert -type f -path '*/x64/WinDivert.dll' | head -n 1)
sys=$(find build/windivert -type f -path '*/x64/WinDivert64.sys' | head -n 1)
if [ -z "$dll" ] || [ -z "$sys" ]; then
  echo "WinDivert x64 files not found in $zip" >&2
  exit 1
fi

if command -v go >/dev/null 2>&1; then
  if ! go run github.com/tc-hib/go-winres@v0.3.1 make --in "$PWD/winres/winres.json" --arch amd64 --out "$PWD/cmd/ashgate/rsrc"; then
    echo "warning: go-winres failed; administrator rights will be requested at runtime" >&2
  fi
fi

CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -trimpath \
  -ldflags "-s -w -H windowsgui" -o dist/ashgate.exe ./cmd/ashgate
cp "$dll" dist/WinDivert.dll
cp "$sys" dist/WinDivert64.sys
cp configs/ashgate.example.json dist/ashgate.example.json
cp README.md LICENSE THIRD_PARTY_NOTICES.md dist/
rel=$(sed -n 's/^const Version = "\([^"]*\)".*/\1/p' internal/version/version.go)
name="ashgate-${rel}-windows-amd64.zip"
rm -f "dist/$name" dist/ashgate-windows-amd64.zip
(
  cd dist
  zip -q "$name" \
    ashgate.exe WinDivert.dll WinDivert64.sys ashgate.example.json \
    README.md LICENSE THIRD_PARTY_NOTICES.md
  cp "$name" ashgate-windows-amd64.zip
)
echo "wrote dist/$name"
