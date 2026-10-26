package gui

import (
	"image"
	"image/color"
	"math"
)

// LogoImage rasterizes the Ashgate mark: an ember gate with a traffic arrow.
func LogoImage(size int) *image.NRGBA {
	if size < 8 {
		size = 8
	}
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	const ss = 2
	pix := 64 / float64(size)
	n := float64(ss * ss)
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var r, g, b, a float64
			for sy := 0; sy < ss; sy++ {
				for sx := 0; sx < ss; sx++ {
					px := (float64(x) + (float64(sx)+0.5)/float64(ss)) * 64 / float64(size)
					py := (float64(y) + (float64(sy)+0.5)/float64(ss)) * 64 / float64(size)
					sr, sg, sb, sa := logoSample(px, py, pix)
					r += sr * sa
					g += sg * sa
					b += sb * sa
					a += sa
				}
			}
			a /= n
			if a <= 0 {
				continue
			}
			img.SetNRGBA(x, y, color.NRGBA{
				R: toByte((r / n) / a),
				G: toByte((g / n) / a),
				B: toByte((b / n) / a),
				A: toByte(a),
			})
		}
	}
	return img
}

func logoSample(px, py, pix float64) (r, g, b, a float64) {
	cover := smooth(0.5 - sdRound(px, py, 64, 64, 15)/pix)
	if cover <= 0 {
		return 0, 0, 0, 0
	}
	r, g, b = ember(px, py)
	a = cover
	white := smooth(0.5 - (archDist(px, py)-2.5)/pix)
	r, g, b, a = over(r, g, b, a, 1, 1, 1, white)
	arrow := smooth(0.5-(arrowDist(px, py)-2.5)/pix) * 0.85
	r, g, b, a = over(r, g, b, a, 0x2B/255.0, 0x12/255.0, 0x08/255.0, arrow)
	return r, g, b, a
}

func ember(px, py float64) (float64, float64, float64) {
	const ax, ay, bx, by = 6.0, 2.0, 58.0, 62.0
	dx, dy := bx-ax, by-ay
	t := ((px-ax)*dx + (py-ay)*dy) / (dx*dx + dy*dy)
	t = clamp(t, 0, 1)
	return lerp(0xFF, 0xE2, t) / 255, lerp(0x9B, 0x45, t) / 255, lerp(0x5E, 0x2A, t) / 255
}

func archDist(px, py float64) float64 {
	d := distSeg(px, py, 21, 30.5, 21, 49)
	d = math.Min(d, distSeg(px, py, 43, 30.5, 43, 49))
	return math.Min(d, arcDist(px, py))
}

func arcDist(px, py float64) float64 {
	const cx, cy, r = 32.0, 30.5, 11.0
	dx, dy := px-cx, py-cy
	if dy <= 0 {
		return math.Abs(math.Hypot(dx, dy) - r)
	}
	return math.Min(math.Hypot(px-21, py-30.5), math.Hypot(px-43, py-30.5))
}

func arrowDist(px, py float64) float64 {
	d := distSeg(px, py, 9, 40.5, 36, 40.5)
	d = math.Min(d, distSeg(px, py, 30.5, 34, 37, 40.5))
	return math.Min(d, distSeg(px, py, 37, 40.5, 30.5, 47))
}

func distSeg(px, py, x1, y1, x2, y2 float64) float64 {
	vx, vy := x2-x1, y2-y1
	wx, wy := px-x1, py-y1
	c := vx*vx + vy*vy
	t := 0.0
	if c > 0 {
		t = clamp((wx*vx+wy*vy)/c, 0, 1)
	}
	return math.Hypot(px-(x1+t*vx), py-(y1+t*vy))
}

func sdRound(px, py, w, h, rad float64) float64 {
	qx := math.Abs(px-w/2) - (w/2 - rad)
	qy := math.Abs(py-h/2) - (h/2 - rad)
	ox, oy := math.Max(qx, 0), math.Max(qy, 0)
	return math.Hypot(ox, oy) + math.Min(math.Max(qx, qy), 0) - rad
}

func over(dr, dg, db, da, sr, sg, sb, sa float64) (float64, float64, float64, float64) {
	outA := sa + da*(1-sa)
	if outA <= 0 {
		return 0, 0, 0, 0
	}
	return (sr*sa + dr*da*(1-sa)) / outA, (sg*sa + dg*da*(1-sa)) / outA, (sb*sa + db*da*(1-sa)) / outA, outA
}

func smooth(v float64) float64 { return clamp(v, 0, 1) }

func clamp(v, lo, hi float64) float64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func lerp(a, b int, t float64) float64 { return float64(a) + t*float64(b-a) }

func toByte(v float64) uint8 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 255
	}
	return uint8(v*255 + 0.5)
}
