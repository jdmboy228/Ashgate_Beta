package vless

import (
	"context"
	"net"
	"strings"
	"testing"
)

func TestFixedPortBusy(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	port := ln.Addr().(*net.TCPAddr).Port
	_, err = Listen(context.Background(), "203.0.113.10:443", Params{
		UUID: sampleUUID, Network: "tcp", Security: "none",
	}, Inbound{Port: port})
	if err == nil || !strings.Contains(err.Error(), "занят") || !strings.Contains(err.Error(), "SOCKS5") {
		t.Fatalf("%v", err)
	}
}
