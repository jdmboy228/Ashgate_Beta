package gui

import "testing"

func TestLogoImage(t *testing.T) {
	img := LogoImage(64)
	if img.Bounds().Dx() != 64 {
		t.Fatal(img.Bounds())
	}
	corner := img.NRGBAAt(0, 0)
	if corner.A != 0 {
		t.Fatalf("corner alpha %d", corner.A)
	}
	mid := img.NRGBAAt(32, 32)
	if mid.A < 200 || mid.R < mid.B {
		t.Fatalf("center %+v", mid)
	}
}
