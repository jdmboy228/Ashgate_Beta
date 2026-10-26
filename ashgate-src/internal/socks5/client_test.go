package socks5

import (
	"context"
	"io"
	"net"
	"testing"
	"time"

	"ashgate/internal/config"
	"ashgate/internal/testkit"
)

func TestDialNoAuthAndAuth(t *testing.T) {
	echo := startEcho(t)
	srv, err := testkit.ListenSOCKS("", "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { srv.Close() })

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, err := Dial(ctx, config.Proxy{Type: "socks5", Address: srv.Addr}, echo.host, echo.port)
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	if _, err := conn.Write([]byte("ping")); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 4)
	if _, err := io.ReadFull(conn, buf); err != nil {
		t.Fatal(err)
	}
	if string(buf) != "ping" {
		t.Fatalf("got %q", buf)
	}

	auth, err := testkit.ListenSOCKS("alice", "secret")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { auth.Close() })
	if _, err := Dial(ctx, config.Proxy{Type: "socks5", Address: auth.Addr, Username: "alice", Password: "nope"}, echo.host, echo.port); err == nil {
		t.Fatal("expected auth failure")
	}
	conn2, err := Dial(ctx, config.Proxy{Type: "socks5", Address: auth.Addr, Username: "alice", Password: "secret"}, echo.host, echo.port)
	if err != nil {
		t.Fatal(err)
	}
	conn2.Close()
}

func TestUDPAssociateEcho(t *testing.T) {
	srv, err := testkit.ListenSOCKS("bob", "pw")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { srv.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	a, err := Associate(ctx, config.Proxy{Type: "socks5", Address: srv.Addr, Username: "bob", Password: "pw"})
	if err != nil {
		t.Fatal(err)
	}
	defer a.Close()
	dst := &net.UDPAddr{IP: net.ParseIP("8.8.8.8"), Port: 53}
	payload := []byte{0xaa, 0xbb, 0x01, 0x00}
	if err := a.Send(ctx, dst, payload); err != nil {
		t.Fatal(err)
	}
	from, got, err := a.Recv(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if from.Port != 53 || !from.IP.Equal(dst.IP) {
		t.Fatalf("from %v", from)
	}
	if string(got) != string(payload) {
		t.Fatalf("payload %x", got)
	}
}

func TestEncodeRejectsFragment(t *testing.T) {
	_, _, err := DecodeUDP([]byte{0, 0, 1, 1, 0, 0, 0, 0, 0, 0})
	if err == nil {
		t.Fatal("expected fragment error")
	}
}

type echoAddr struct {
	host string
	port uint16
}

func startEcho(t *testing.T) echoAddr {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				_, _ = io.Copy(c, c)
			}()
		}
	}()
	ta := ln.Addr().(*net.TCPAddr)
	return echoAddr{host: "127.0.0.1", port: uint16(ta.Port)}
}
