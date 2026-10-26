// Package probe checks that a configured proxy accepts a connection.
package probe

import (
	"context"
	"fmt"
	"time"

	"ashgate/internal/config"
	"ashgate/internal/httpproxy"
	"ashgate/internal/socks5"
	"ashgate/internal/vless"
)

// Report is the result of one health check.
type Report struct {
	OK     bool   `json:"ok"`
	UDP    bool   `json:"udp"`
	Millis int64  `json:"ms"`
	Label  string `json:"label"`
	Detail string `json:"detail,omitempty"`
}

// Check dials 1.1.1.1:443 through the proxy. SOCKS5 also tries UDP ASSOCIATE.
func Check(ctx context.Context, p config.Proxy) Report {
	return CheckTarget(ctx, p, "1.1.1.1", 443)
}

// CheckTarget is Check with an explicit destination. Tests point it at localhost.
func CheckTarget(ctx context.Context, p config.Proxy, host string, port uint16) Report {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	start := time.Now()
	switch p.Type {
	case "socks5":
		conn, err := socks5.Dial(ctx, p, host, port)
		if err != nil {
			return failed(err)
		}
		_ = conn.Close()
		ms := millis(start)
		rep := Report{OK: true, Millis: ms, Label: fmt.Sprintf("%d мс", ms), Detail: "TCP доступен"}
		actx, acancel := context.WithTimeout(ctx, 3*time.Second)
		assoc, err := socks5.Associate(actx, p)
		acancel()
		if err == nil {
			rep.UDP = true
			rep.Detail = "TCP и UDP"
			_ = assoc.Close()
		} else {
			rep.Detail = "TCP доступен, UDP ASSOCIATE не удался"
		}
		return rep
	case "http":
		conn, err := httpproxy.Dial(ctx, p, host, port)
		if err != nil {
			return failed(err)
		}
		_ = conn.Close()
		ms := millis(start)
		return Report{OK: true, Millis: ms, Label: fmt.Sprintf("%d мс", ms), Detail: "только TCP"}
	case "vless":
		if err := p.Prepare(); err != nil {
			return failed(err)
		}
		if p.VLESS == nil {
			return failed(fmt.Errorf("Не удалось разобрать ссылку VLESS"))
		}
		br, err := vless.Listen(ctx, p.Address, *p.VLESS, vless.Inbound{})
		if err != nil {
			return failed(vless.Explain(err))
		}
		defer br.Close()
		via := config.Proxy{Type: "socks5", Address: br.Addr}
		conn, err := socks5.Dial(ctx, via, host, port)
		if err != nil {
			return failed(vless.Explain(err))
		}
		_ = conn.Close()
		ms := millis(start)
		rep := Report{OK: true, Millis: ms, Label: fmt.Sprintf("%d мс", ms), Detail: "TCP доступен"}
		actx, acancel := context.WithTimeout(ctx, 3*time.Second)
		assoc, err := socks5.Associate(actx, via)
		acancel()
		if err == nil {
			rep.UDP = true
			rep.Detail = "TCP и UDP"
			_ = assoc.Close()
		} else {
			rep.Detail = "TCP доступен, UDP ASSOCIATE не удался"
		}
		return rep
	default:
		return Report{Label: "нет ответа", Detail: "неизвестный тип прокси"}
	}
}

func failed(err error) Report {
	detail := "нет ответа"
	if err != nil && err.Error() != "" {
		detail = err.Error()
	}
	return Report{Label: "нет ответа", Detail: detail}
}

func millis(start time.Time) int64 {
	ms := time.Since(start).Milliseconds()
	if ms < 1 {
		return 1
	}
	return ms
}
