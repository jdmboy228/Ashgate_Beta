package process

import (
	"testing"
	"time"

	"ashgate/internal/packet"
	"ashgate/internal/rules"
)

func testResolver(now time.Time) (*Resolver, *time.Time) {
	clock := now
	r := New()
	r.SetClock(func() time.Time { return clock })
	r.SetImage(func(pid uint32) rules.Process {
		return rules.Process{PID: pid, Name: "app.exe", Path: `C:\apps\app.exe`}
	})
	return r, &clock
}

func TestObserveExactAndWildcard(t *testing.T) {
	r, _ := testResolver(time.Unix(1000, 0))
	r.Observe(packet.ProtoTCP, packet.V4(10, 0, 0, 5, 40000), 9, false)
	r.Observe(packet.ProtoUDP, packet.V4(0, 0, 0, 0, 53), 4, false)

	p, ok := r.Lookup(packet.ProtoTCP, packet.V4(10, 0, 0, 5, 40000))
	if !ok || p.PID != 9 || p.Name != "app.exe" {
		t.Fatalf("%+v %v", p, ok)
	}
	p, ok = r.Lookup(packet.ProtoUDP, packet.V4(192, 168, 1, 9, 53))
	if !ok || p.PID != 4 {
		t.Fatalf("wildcard %+v %v", p, ok)
	}
	if _, ok = r.Lookup(packet.ProtoTCP, packet.V4(10, 0, 0, 5, 53)); ok {
		t.Fatal("udp wildcard matched tcp")
	}
}

func TestExactBeatsWildcard(t *testing.T) {
	r, _ := testResolver(time.Unix(1000, 0))
	r.SetImage(func(pid uint32) rules.Process {
		return rules.Process{PID: pid, Name: "p.exe"}
	})
	r.Observe(packet.ProtoTCP, packet.V4(0, 0, 0, 0, 80), 1, false)
	r.Observe(packet.ProtoTCP, packet.V4(10, 1, 1, 1, 80), 2, false)
	p, ok := r.Lookup(packet.ProtoTCP, packet.V4(10, 1, 1, 1, 80))
	if !ok || p.PID != 2 {
		t.Fatalf("%+v", p)
	}
}

func TestCloseGrace(t *testing.T) {
	start := time.Unix(1000, 0)
	r, clock := testResolver(start)
	local := packet.V4(10, 0, 0, 8, 1234)
	r.Observe(packet.ProtoTCP, local, 3, false)
	r.Observe(packet.ProtoTCP, local, 3, true)
	if _, ok := r.Lookup(packet.ProtoTCP, local); !ok {
		t.Fatal("closed socket should stay visible")
	}
	*clock = start.Add(closeGrace + time.Millisecond)
	if _, ok := r.Lookup(packet.ProtoTCP, local); ok {
		t.Fatal("grace elapsed")
	}
}

func TestHelperDoesNotOverrideSocket(t *testing.T) {
	r, _ := testResolver(time.Unix(1000, 0))
	local := packet.V4(10, 0, 0, 2, 5555)
	r.Observe(packet.ProtoUDP, local, 9, false)
	r.SetHelper(func() ([]Endpoint, error) {
		return []Endpoint{{Proto: packet.ProtoUDP, Addr: local, PID: 2}}, nil
	})
	p, ok := r.Lookup(packet.ProtoUDP, local)
	if !ok || p.PID != 9 {
		t.Fatalf("socket lost to helper: %+v", p)
	}
}

func TestHelperFallback(t *testing.T) {
	r, _ := testResolver(time.Unix(1000, 0))
	local := packet.V4(172, 16, 0, 4, 443)
	r.SetHelper(func() ([]Endpoint, error) {
		return []Endpoint{{Proto: packet.ProtoTCP, Addr: local, PID: 15}}, nil
	})
	p, ok := r.Lookup(packet.ProtoTCP, local)
	if !ok || p.PID != 15 || p.Name != "app.exe" {
		t.Fatalf("%+v %v", p, ok)
	}
}

func TestUnnamedProcessIsUnknown(t *testing.T) {
	r, _ := testResolver(time.Unix(1000, 0))
	r.SetImage(func(uint32) rules.Process { return rules.Process{} })
	r.Observe(packet.ProtoTCP, packet.V4(1, 2, 3, 4, 9), 8, false)
	if _, ok := r.Lookup(packet.ProtoTCP, packet.V4(1, 2, 3, 4, 9)); ok {
		t.Fatal("empty image should look unknown so the capture loop can retry")
	}
}
