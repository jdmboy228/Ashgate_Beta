package engine

import (
	"context"
	"io"
	"net"
	"strconv"
	"sync"
	"testing"
	"time"

	"ashgate/internal/config"
	"ashgate/internal/dialer"
	"ashgate/internal/logbuf"
	"ashgate/internal/packet"
	"ashgate/internal/rules"
	"ashgate/internal/testkit"
)

type fixedRes struct {
	p  rules.Process
	ok bool
}

func (f fixedRes) Lookup(uint8, packet.Addr) (rules.Process, bool) { return f.p, f.ok }

type fakeDial struct {
	target string
	got    []string
	fail   error
}

func (f *fakeDial) DialTCP(ctx context.Context, p config.Proxy, host string, port uint16) (net.Conn, error) {
	f.got = append(f.got, net.JoinHostPort(host, strconv.Itoa(int(port))))
	if f.fail != nil {
		return nil, f.fail
	}
	var d net.Dialer
	return d.DialContext(ctx, "tcp", f.target)
}

func (f *fakeDial) DialUDP(context.Context, config.Proxy) (dialer.Session, error) {
	return nil, dialer.ErrUDPUnsupported
}

type memInj struct {
	mu   sync.Mutex
	pkts [][]byte
}

func (m *memInj) InjectInbound(pkt []byte, _, _ uint32) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.pkts = append(m.pkts, append([]byte(nil), pkt...))
	return nil
}

func (m *memInj) count() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.pkts)
}

func (m *memInj) packet(i int) []byte {
	m.mu.Lock()
	defer m.mu.Unlock()
	return append([]byte(nil), m.pkts[i]...)
}

func testConfig() *config.Config {
	return &config.Config{
		Proxies: []config.Proxy{
			{Name: "socks", Type: "socks5", Address: "127.0.0.1:1080"},
			{Name: "web", Type: "http", Address: "127.0.0.1:8080"},
		},
		Rules: []config.Rule{
			{Process: "curl.exe", Action: "proxy", Proxy: "socks"},
			{Process: "direct.exe", Action: "direct"},
			{Process: `C:\Apps\browser.exe`, Action: "proxy", Proxy: "web"},
		},
		DNS: config.DNS{Mode: "proxy", Servers: []string{"1.1.1.1:53"}},
	}
}

func newEngine(t *testing.T, cfg *config.Config, res Resolver, d dialer.Dialer, inj Injector) (*Engine, *logbuf.Buffer) {
	t.Helper()
	logs, err := logbuf.New(100, "")
	if err != nil {
		t.Fatal(err)
	}
	e, err := New(cfg, Options{
		Resolver: res,
		Alloc:    &seqAlloc{},
		Dialer:   d,
		Logs:     logs,
		Injector: inj,
		SkipSelf: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	return e, logs
}

func TestTCPRedirectAndRelay(t *testing.T) {
	echo, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer echo.Close()
	go func() {
		for {
			c, err := echo.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				_, _ = io.Copy(c, c)
			}()
		}
	}()
	fd := &fakeDial{target: echo.Addr().String()}
	e, logs := newEngine(t, testConfig(), fixedRes{p: rules.Process{PID: 42, Name: "curl.exe", Path: `C:\Windows\System32\curl.exe`}, ok: true}, fd, nil)

	app := packet.V4(10, 0, 0, 8, 41000)
	dst := packet.V4(9, 9, 9, 9, 443)
	pkt, err := packet.BuildTCP(app, dst, 0x02)
	if err != nil {
		t.Fatal(err)
	}
	original := append([]byte(nil), pkt...)
	res := e.HandlePacket(pkt, Meta{IfIdx: 7}, true)
	if res.Action != ActionModified || res.Inbound {
		t.Fatalf("syn result %+v", res)
	}
	if err := packet.ValidChecksums(pkt); err != nil {
		t.Fatal(err)
	}
	var h packet.Header
	if err := packet.Parse(pkt, &h); err != nil {
		t.Fatal(err)
	}
	if h.Src.IP[0] != 127 || h.Dst.Port != 34010 || h.Src.Port < 20000 {
		t.Fatalf("rewritten header %+v", h)
	}
	alloc := h.Src.Port

	// Retransmitted SYN keeps the same allocation.
	again := append([]byte(nil), original...)
	res = e.HandlePacket(again, Meta{IfIdx: 7}, true)
	var h2 packet.Header
	if err := packet.Parse(again, &h2); err != nil {
		t.Fatal(err)
	}
	if h2.Src.Port != alloc {
		t.Fatalf("retransmit port %d want %d", h2.Src.Port, alloc)
	}

	// Return path: local stack to the allocated port becomes the real server.
	ret, err := packet.BuildTCP(packet.V4(127, 0, 0, 1, 34010), packet.V4(127, 0, 0, 1, alloc), 0x12)
	if err != nil {
		t.Fatal(err)
	}
	back := e.HandlePacket(ret, Meta{}, true)
	if back.Action != ActionModified || !back.Inbound || back.IfIdx != 7 {
		t.Fatalf("return %+v", back)
	}
	var hr packet.Header
	if err := packet.Parse(ret, &hr); err != nil {
		t.Fatal(err)
	}
	if hr.Src.Port != 443 || hr.Dst.Port != 41000 || hr.Src.IP[0] != 9 {
		t.Fatalf("restored %+v", hr)
	}
	if err := packet.ValidChecksums(ret); err != nil {
		t.Fatal(err)
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	accepted := make(chan struct{})
	go func() {
		c, err := ln.Accept()
		if err != nil {
			return
		}
		e.ServeConn(c)
		close(accepted)
	}()
	dialer := net.Dialer{LocalAddr: &net.TCPAddr{IP: net.IPv4(127, 0, 0, 1), Port: int(alloc)}, Timeout: 2 * time.Second}
	appConn, err := dialer.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer appConn.Close()
	if _, err := appConn.Write([]byte("ping")); err != nil {
		t.Fatal(err)
	}
	buf := make([]byte, 4)
	_ = appConn.SetReadDeadline(time.Now().Add(3 * time.Second))
	if _, err := io.ReadFull(appConn, buf); err != nil {
		t.Fatal(err)
	}
	if string(buf) != "ping" {
		t.Fatalf("echo %q", buf)
	}
	appConn.Close()
	select {
	case <-accepted:
	case <-time.After(3 * time.Second):
		t.Fatal("relay did not finish")
	}
	if len(fd.got) != 1 || fd.got[0] != "9.9.9.9:443" {
		t.Fatalf("dialed %v", fd.got)
	}
	deadline := time.Now().Add(2 * time.Second)
	var closed bool
	for time.Now().Before(deadline) && !closed {
		for _, ev := range logs.Snapshot() {
			if ev.Status == "closed" && ev.BytesUp == 4 && ev.BytesDown == 4 && ev.Via == "socks" {
				closed = true
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !closed {
		t.Fatalf("log %v", logs.Snapshot())
	}
}

func TestDirectOtherAndSelf(t *testing.T) {
	cfg := testConfig()
	e, logs := newEngine(t, cfg, fixedRes{p: rules.Process{PID: 7, Name: "direct.exe"}, ok: true}, &fakeDial{}, nil)
	pkt, err := packet.BuildTCP(packet.V4(10, 0, 0, 2, 3000), packet.V4(1, 2, 3, 4, 80), 0x02)
	if err != nil {
		t.Fatal(err)
	}
	raw := append([]byte(nil), pkt...)
	res := e.HandlePacket(pkt, Meta{}, true)
	if res.Action != ActionPass {
		t.Fatal(res.Action)
	}
	if string(pkt) != string(raw) {
		t.Fatal("direct packet was modified")
	}
	found := false
	for _, ev := range logs.Snapshot() {
		if ev.Status == "direct" && ev.Process == "direct.exe" {
			found = true
		}
	}
	if !found {
		t.Fatalf("log %v", logs.Snapshot())
	}

	// Second packet of the same flow does not log again.
	before := len(logs.Snapshot())
	data, err := packet.BuildTCP(packet.V4(10, 0, 0, 2, 3000), packet.V4(1, 2, 3, 4, 80), 0x18)
	if err != nil {
		t.Fatal(err)
	}
	if e.HandlePacket(data, Meta{}, true).Action != ActionPass {
		t.Fatal("data")
	}
	if len(logs.Snapshot()) != before {
		t.Fatal("duplicate direct log")
	}

	other, _ := newEngine(t, cfg, fixedRes{p: rules.Process{PID: 8, Name: "notepad.exe"}, ok: true}, &fakeDial{}, nil)
	pkt2, _ := packet.BuildTCP(packet.V4(10, 0, 0, 3, 3001), packet.V4(8, 8, 8, 8, 53), 0x02)
	if other.HandlePacket(pkt2, Meta{}, true).Action != ActionPass {
		t.Fatal("unmatched should pass")
	}
	if len(other.logs.Snapshot()) != 0 {
		t.Fatalf("unmatched logged: %v", other.logs.Snapshot())
	}

	self, _ := newEngine(t, cfg, fixedRes{p: rules.Process{PID: 99, Name: "curl.exe"}, ok: true}, &fakeDial{}, nil)
	self.selfPID = 99
	pkt3, _ := packet.BuildTCP(packet.V4(10, 0, 0, 4, 3002), packet.V4(1, 1, 1, 1, 443), 0x02)
	if self.HandlePacket(pkt3, Meta{}, true).Action != ActionPass {
		t.Fatal("self traffic must stay direct")
	}
}

func TestUnknownThenPass(t *testing.T) {
	e, _ := newEngine(t, testConfig(), fixedRes{}, &fakeDial{}, nil)
	pkt, err := packet.BuildTCP(packet.V4(10, 0, 0, 9, 2222), packet.V4(1, 1, 1, 1, 443), 0x02)
	if err != nil {
		t.Fatal(err)
	}
	if e.HandlePacket(append([]byte(nil), pkt...), Meta{}, false).Action != ActionUnknown {
		t.Fatal("expected hold")
	}
	if e.HandlePacket(pkt, Meta{}, true).Action != ActionPass {
		t.Fatal("expected pass")
	}
}

func TestLoopbackNotProxied(t *testing.T) {
	e, _ := newEngine(t, testConfig(), fixedRes{p: rules.Process{PID: 1, Name: "curl.exe"}, ok: true}, &fakeDial{}, nil)
	pkt, err := packet.BuildTCP(packet.V4(10, 0, 0, 1, 50), packet.V4(127, 0, 0, 1, 80), 0x02)
	if err != nil {
		t.Fatal(err)
	}
	if e.HandlePacket(pkt, Meta{}, true).Action != ActionPass {
		t.Fatal("loopback should pass")
	}
}

func TestHTTPUDPBlockedAndDNS(t *testing.T) {
	px, err := testkit.ListenHTTP("", "")
	if err != nil {
		t.Fatal(err)
	}
	defer px.Close()
	cfg := testConfig()
	cfg.Proxies[1].Address = px.Addr
	cfg.Rules = []config.Rule{{Process: "browser.exe", Action: "proxy", Proxy: "web"}}
	inj := &memInj{}
	e, logs := newEngine(t, cfg, fixedRes{p: rules.Process{PID: 3, Name: "browser.exe", Path: `C:\Apps\browser.exe`}, ok: true}, dialer.Net{}, inj)

	quic, err := packet.BuildUDP(packet.V4(10, 0, 0, 4, 4444), packet.V4(1, 2, 3, 4, 443), []byte("quic"))
	if err != nil {
		t.Fatal(err)
	}
	res := e.HandlePacket(quic, Meta{}, true)
	if res.Action != ActionDrop {
		t.Fatalf("quic %+v", res.Action)
	}
	again, _ := packet.BuildUDP(packet.V4(10, 0, 0, 4, 4444), packet.V4(1, 2, 3, 4, 443), []byte("quic"))
	if e.HandlePacket(again, Meta{}, true).Action != ActionDrop {
		t.Fatal("repeat block")
	}

	query := []byte{0x12, 0x34, 0x01, 0x00}
	dns, err := packet.BuildUDP(packet.V4(10, 0, 0, 4, 5353), packet.V4(192, 168, 1, 1, 53), query)
	if err != nil {
		t.Fatal(err)
	}
	res = e.HandlePacket(dns, Meta{IfIdx: 4}, true)
	if res.Action != ActionUDP || res.UDP == nil {
		t.Fatalf("dns %+v", res)
	}
	if res.UDP.RelayDst.String() != "1.1.1.1:53" || res.UDP.OrigDst.String() != "192.168.1.1:53" {
		t.Fatalf("dst relay=%s orig=%s", res.UDP.RelayDst, res.UDP.OrigDst)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := e.ForwardUDP(ctx, *res.UDP); err != nil {
		t.Fatal(err)
	}
	if inj.count() != 1 {
		t.Fatalf("injected %d", inj.count())
	}
	raw := inj.packet(0)
	var got packet.Header
	if err := packet.Parse(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got.Src.String() != "192.168.1.1:53" || got.Dst.Port != 5353 || got.PayloadLen < 3 || raw[got.PayloadOff+2]&0x80 == 0 {
		t.Fatalf("injected header %+v payload %x", got, raw[got.PayloadOff:])
	}
	_ = logs
}

func TestSOCKSUDP(t *testing.T) {
	socks, err := testkit.ListenSOCKS("", "")
	if err != nil {
		t.Fatal(err)
	}
	defer socks.Close()
	cfg := testConfig()
	cfg.Proxies[0].Address = socks.Addr
	cfg.DNS.Mode = "original"
	inj := &memInj{}
	e, _ := newEngine(t, cfg, fixedRes{p: rules.Process{Name: "curl.exe", PID: 5}, ok: true}, dialer.Net{}, inj)
	payload := []byte{0xde, 0xad}
	pkt, err := packet.BuildUDP(packet.V4(10, 9, 8, 7, 1900), packet.V4(8, 8, 8, 8, 53), payload)
	if err != nil {
		t.Fatal(err)
	}
	res := e.HandlePacket(pkt, Meta{IfIdx: 3, SubIfIdx: 1}, true)
	if res.Action != ActionUDP {
		t.Fatal(res.Action)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := e.ForwardUDP(ctx, *res.UDP); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for inj.count() == 0 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if inj.count() == 0 {
		t.Fatal("no udp reply")
	}
	raw := inj.packet(0)
	var h packet.Header
	if err := packet.Parse(raw, &h); err != nil {
		t.Fatal(err)
	}
	if h.Src.String() != "8.8.8.8:53" || h.Dst.String() != "10.9.8.7:1900" {
		t.Fatalf("reply %s -> %s", h.Src, h.Dst)
	}
	if string(raw[h.PayloadOff:h.PayloadOff+h.PayloadLen]) != string(payload) {
		t.Fatal("payload mismatch")
	}
	if err := packet.ValidChecksums(raw); err != nil {
		t.Fatal(err)
	}
}

func TestPrivateBypass(t *testing.T) {
	cfg := testConfig()
	cfg.BypassPrivate = true
	e, _ := newEngine(t, cfg, fixedRes{p: rules.Process{Name: "curl.exe", PID: 1}, ok: true}, &fakeDial{}, nil)
	pkt, err := packet.BuildTCP(packet.V4(10, 0, 0, 5, 1000), packet.V4(192, 168, 0, 1, 445), 0x02)
	if err != nil {
		t.Fatal(err)
	}
	if e.HandlePacket(pkt, Meta{}, true).Action != ActionPass {
		t.Fatal("private dest should bypass")
	}
}

func TestBlockDropsTCPAndUDP(t *testing.T) {
	cfg := testConfig()
	cfg.Rules = []config.Rule{{Process: "telemetry.exe", Action: "block"}}
	e, logs := newEngine(t, cfg, fixedRes{p: rules.Process{PID: 4, Name: "telemetry.exe"}, ok: true}, &fakeDial{}, nil)
	syn, err := packet.BuildTCP(packet.V4(10, 0, 0, 8, 4000), packet.V4(1, 2, 3, 4, 443), 0x02)
	if err != nil {
		t.Fatal(err)
	}
	raw := append([]byte(nil), syn...)
	if e.HandlePacket(syn, Meta{}, true).Action != ActionDrop {
		t.Fatal("syn should be dropped")
	}
	if string(syn) != string(raw) {
		t.Fatal("blocked packet was rewritten")
	}
	data, err := packet.BuildTCP(packet.V4(10, 0, 0, 8, 4000), packet.V4(1, 2, 3, 4, 443), 0x18)
	if err != nil {
		t.Fatal(err)
	}
	if e.HandlePacket(data, Meta{}, true).Action != ActionDrop {
		t.Fatal("payload should stay dropped")
	}
	udp, err := packet.BuildUDP(packet.V4(10, 0, 0, 8, 4001), packet.V4(1, 2, 3, 4, 443), []byte("q"))
	if err != nil {
		t.Fatal(err)
	}
	if e.HandlePacket(udp, Meta{}, true).Action != ActionDrop {
		t.Fatal("udp should be dropped")
	}
	again, _ := packet.BuildUDP(packet.V4(10, 0, 0, 8, 4001), packet.V4(1, 2, 3, 4, 443), []byte("q"))
	before := len(logs.Snapshot())
	if e.HandlePacket(again, Meta{}, true).Action != ActionDrop {
		t.Fatal("repeat udp")
	}
	if len(logs.Snapshot()) != before {
		t.Fatal("repeat udp was logged again")
	}
	n := 0
	for _, ev := range logs.Snapshot() {
		if ev.Status == "blocked" && ev.Process == "telemetry.exe" {
			n++
		}
	}
	if n != 2 {
		t.Fatalf("blocked events = %d, log %v", n, logs.Snapshot())
	}
}
