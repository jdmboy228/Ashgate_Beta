//go:build windows

package process

import (
	"syscall"
	"unsafe"

	"ashgate/internal/rules"
	"golang.org/x/sys/windows"
)

var (
	iphlp   = windows.NewLazySystemDLL("iphlpapi.dll")
	procTCP = iphlp.NewProc("GetExtendedTcpTable")
	procUDP = iphlp.NewProc("GetExtendedUdpTable")
)

func configure(r *Resolver) {
	r.image = queryImage
	r.loadHelper = loadTables
}

func queryImage(pid uint32) rules.Process {
	h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return rules.Process{PID: pid}
	}
	defer windows.CloseHandle(h)
	buf := make([]uint16, 32768)
	n := uint32(len(buf))
	if err := windows.QueryFullProcessImageName(h, 0, &buf[0], &n); err != nil {
		return rules.Process{PID: pid}
	}
	path := windows.UTF16ToString(buf[:n])
	return rules.Process{PID: pid, Name: rules.Base(path), Path: path}
}

func loadTables() ([]Endpoint, error) {
	var out []Endpoint
	specs := []struct {
		proc  *windows.LazyProc
		af    uintptr
		class uintptr
		kind  TableKind
	}{
		{procTCP, 2, 5, TableTCP4},
		{procTCP, 23, 5, TableTCP6},
		{procUDP, 2, 1, TableUDP4},
		{procUDP, 23, 1, TableUDP6},
	}
	var first error
	for _, spec := range specs {
		buf, err := readTable(spec.proc, spec.af, spec.class)
		if err != nil {
			if first == nil {
				first = err
			}
			continue
		}
		eps, err := ParseOwnerTable(buf, spec.kind)
		if err != nil {
			if first == nil {
				first = err
			}
			continue
		}
		out = append(out, eps...)
	}
	if len(out) == 0 && first != nil {
		return nil, first
	}
	return out, nil
}

func readTable(proc *windows.LazyProc, af, class uintptr) ([]byte, error) {
	size := uint32(64 * 1024)
	for size <= 4<<20 {
		buf := make([]byte, size)
		sz := size
		r, _, err := proc.Call(
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(unsafe.Pointer(&sz)),
			0,
			af,
			class,
			0,
		)
		if r == 0 {
			if sz > size {
				sz = size
			}
			return buf[:sz], nil
		}
		if r != 122 && err != windows.ERROR_INSUFFICIENT_BUFFER {
			if err != nil {
				return nil, err
			}
			return nil, syscall.Errno(r)
		}
		if sz > size {
			size = sz
		} else {
			size *= 2
		}
	}
	return nil, windows.ERROR_INSUFFICIENT_BUFFER
}
