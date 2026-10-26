package probe

import (
	"context"
	"net"
	"strconv"
	"testing"
	"time"

	"ashgate/internal/config"
	"ashgate/internal/testkit"
)

func TestSOCKSCheck(t *testing.T) {
	px, err := testkit.ListenSOCKS("u", "p")
	if err != nil {
		t.Fatal(err)
	}
	defer px.Close()
	ln := localEcho(t)
	host, port := split(t, ln.Addr().String())
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rep := CheckTarget(ctx, config.Proxy{Name: "s", Type: "socks5", Address: px.Addr, Username: "u", Password: "p"}, host, port)
	if !rep.OK || !rep.UDP || rep.Millis < 1 {
		t.Fatalf("%+v", rep)
	}
	bad := CheckTarget(ctx, config.Proxy{Name: "s", Type: "socks5", Address: px.Addr, Username: "u", Password: "no"}, host, port)
	if bad.OK || bad.Label != "нет ответа" {
		t.Fatalf("%+v", bad)
	}
}

func TestHTTPCheck(t *testing.T) {
	px, err := testkit.ListenHTTP("", "")
	if err != nil {
		t.Fatal(err)
	}
	defer px.Close()
	ln := localEcho(t)
	host, port := split(t, ln.Addr().String())
	rep := CheckTarget(context.Background(), config.Proxy{Name: "h", Type: "http", Address: px.Addr}, host, port)
	if !rep.OK || rep.UDP || rep.Detail != "только TCP" {
		t.Fatalf("%+v", rep)
	}
}

func localEcho(t *testing.T) net.Listener {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()
	return ln
}

func split(t *testing.T, addr string) (string, uint16) {
	t.Helper()
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	n, err := strconv.Atoi(portStr)
	if err != nil {
		t.Fatal(err)
	}
	return host, uint16(n)
}
