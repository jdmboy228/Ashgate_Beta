package gui

import "unsafe"

// Win32 layouts below match the amd64 MSVC packing used on Windows 10/11 x64.
// A Linux test locks the offsets so a field reorder cannot silently break the GUI.

const (
	wmDestroy       = 0x0002
	wmClose         = 0x0010
	wmQuit          = 0x0012
	wmSize          = 0x0005
	wmCommand       = 0x0111
	wmNotify        = 0x004E
	wmTimer         = 0x0113
	wmGetMinMaxInfo = 0x0024
	wmNcCalcSize    = 0x0083
	wmNcHitTest     = 0x0084
	wmDpiChanged    = 0x02E0
	wmExitSizeMove  = 0x0232
	wmNull          = 0x0000
	wmLButtonUp     = 0x0202
	wmLButtonDblClk = 0x0203
	wmRButtonUp     = 0x0205
	wmSetFont       = 0x0030
	wmApp           = 0x8000

	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	wsChild            = 0x40000000
	wsTabStop          = 0x00010000
	wsBorder           = 0x00800000
	wsVScroll          = 0x00200000
	wsClipSiblings     = 0x04000000
	wsClipChildren     = 0x02000000
	wsPopup            = 0x80000000
	wsCaption          = 0x00C00000
	wsSysMenu          = 0x00080000

	swHide    = 0
	swShow    = 5
	swRestore = 9

	lvsReport       = 0x0001
	lvsSingleSel    = 0x0004
	lvsShowSel      = 0x0008
	lvsNoSortHeader = 0x8000
	lvsExFullRow    = 0x00000020
	lvsExDoubleBuf  = 0x00010000

	lvmFirst          = 0x1000
	lvmGetItemCount   = lvmFirst + 4
	lvmDeleteAllItems = lvmFirst + 9
	lvmGetNextItem    = lvmFirst + 12
	lvmEnsureVisible  = lvmFirst + 19
	lvmSetExtStyle    = lvmFirst + 54
	lvmInsertItemW    = lvmFirst + 77
	lvmInsertColumnW  = lvmFirst + 97
	lvmSetItemTextW   = lvmFirst + 116
	lvifText          = 0x0001
	lvcfFmt           = 0x0001
	lvcfWidth         = 0x0002
	lvcfText          = 0x0004
	lvniSelected      = 0x0002
	lvnItemActivate   = -114

	esAutoHScroll   = 0x0080
	esPassword      = 0x0020
	cbsDropDownList = 0x0003
	cbsHasStrings   = 0x0200
	bsAutoCheckbox  = 0x0003
	ssNoPrefix      = 0x0080

	cbAddString = 0x0143
	cbSetCurSel = 0x014E
	cbGetCurSel = 0x0147
	bmGetCheck  = 0x00F0
	bmSetCheck  = 0x00F1
	bstChecked  = 1

	idOK     = 1
	idCancel = 2

	nimAdd     = 0
	nimDelete  = 2
	nifMessage = 0x1
	nifIcon    = 0x2
	nifTip     = 0x4

	mfString    = 0
	mfSeparator = 0x800
	tpmReturn   = 0x0100
	tpmRight    = 0x0002

	idiShield = 32518
	idcArrow  = 32512
	colorBtn  = 16

	idStart    = 101
	idStop     = 102
	idProxyAdd = 103
	idProxyDel = 104
	idRuleAdd  = 105
	idRuleDel  = 106
	idToggle   = 107
	idSave     = 108
	idProxies  = 201
	idRules    = 202
	idLog      = 203
	idStatus   = 204

	// Logical window size. The native minimum is applied in hostProc with the
	// window DPI, because go-webview2 HintMin is physical pixels.
	minWindowDIPW   = 760
	minWindowDIPH   = 520
	defWindowDIPW   = 1100
	defWindowDIPH   = 720
	windowMarginDIP = 32

	htLeft        = 10
	htRight       = 11
	htTop         = 12
	htTopLeft     = 13
	htTopRight    = 14
	htBottom      = 15
	htBottomLeft  = 16
	htBottomRight = 17
)

// WndClassEx is WNDCLASSEXW.
type WndClassEx struct {
	CbSize        uint32
	Style         uint32
	LpfnWndProc   uintptr
	CbClsExtra    int32
	CbWndExtra    int32
	HInstance     uintptr
	HIcon         uintptr
	HCursor       uintptr
	HbrBackground uintptr
	LpszMenuName  *uint16
	LpszClassName *uint16
	HIconSm       uintptr
}

// Msg is MSG.
type Msg struct {
	Hwnd    uintptr
	Message uint32
	Pad0    uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	PtX     int32
	PtY     int32
}

// Point is POINT.
type Point struct {
	X int32
	Y int32
}

// Rect is RECT.
type Rect struct {
	Left, Top, Right, Bottom int32
}

// MinMaxInfo is MINMAXINFO.
type MinMaxInfo struct {
	Reserved    Point
	MaxSize     Point
	MaxPosition Point
	MinTrack    Point
	MaxTrack    Point
}

// MonitorInfo is MONITORINFO.
type MonitorInfo struct {
	CbSize    uint32
	RcMonitor Rect
	RcWork    Rect
	DwFlags   uint32
}

// WindowPlacement is WINDOWPLACEMENT.
type WindowPlacement struct {
	Length         uint32
	Flags          uint32
	ShowCmd        uint32
	MinPosition    Point
	MaxPosition    Point
	NormalPosition Rect
}

// NcCalcSizeParams is NCCALCSIZE_PARAMS on amd64.
type NcCalcSizeParams struct {
	Rgrc  [3]Rect
	Lppos uintptr
}

// dipToPx converts a DIP length at the given DPI (96 = 100%).
func dipToPx(dip, dpi int32) int32 {
	if dpi < 96 {
		dpi = 96
	}
	return dip * dpi / 96
}

// pxToDip converts a physical length back to DIP.
func pxToDip(px, dpi int32) int32 {
	if dpi < 96 {
		dpi = 96
	}
	return px * 96 / dpi
}

// fitWindow clamps a DIP size. The result is at least minW×minH. When the
// work area is known it is also at most work−32, and the minimum wins when
// the work area itself is smaller than that.
func fitWindow(w, h, minW, minH, workW, workH int32) (int32, int32) {
	if minW < 1 {
		minW = 1
	}
	if minH < 1 {
		minH = 1
	}
	if w < minW {
		w = minW
	}
	if h < minH {
		h = minH
	}
	if workW > 0 {
		maxW := workW - windowMarginDIP
		if maxW < minW {
			maxW = minW
		}
		if w > maxW {
			w = maxW
		}
	}
	if workH > 0 {
		maxH := workH - windowMarginDIP
		if maxH < minH {
			maxH = minH
		}
		if h > maxH {
			h = maxH
		}
	}
	return w, h
}

// clampOrigin keeps a window of size w×h inside the work rectangle.
// A window larger than the work area is pinned to the work origin.
func clampOrigin(x, y, w, h, workL, workT, workR, workB int32) (int32, int32) {
	workW := workR - workL
	workH := workB - workT
	if workW <= 0 || workH <= 0 {
		return x, y
	}
	if w >= workW {
		x = workL
	} else {
		if x < workL {
			x = workL
		}
		if x+w > workR {
			x = workR - w
		}
	}
	if h >= workH {
		y = workT
	} else {
		if y < workT {
			y = workT
		}
		if y+h > workB {
			y = workB - h
		}
	}
	return x, y
}

// applyMinTrack sets only the drag minimum. MaxSize, MaxPosition and MaxTrack
// are left alone: MaxTrack is what stops a drag, and writing it would cap the
// window. The maximized size stays the system default (the work area).
func applyMinTrack(mmi *MinMaxInfo, dpi, frameX, frameY int32) {
	if mmi == nil {
		return
	}
	if frameX < 0 {
		frameX = 0
	}
	if frameY < 0 {
		frameY = 0
	}
	mmi.MinTrack.X = dipToPx(minWindowDIPW, dpi) + frameX
	mmi.MinTrack.Y = dipToPx(minWindowDIPH, dpi) + frameY
}

// hitTestResize reports a WM_NCHITTEST edge code when the pointer is inside
// the window and within border physical pixels of an edge. The interior and
// anything outside the window return 0 so the caller can defer to DefWindowProc.
func hitTestResize(wr Rect, x, y, border int32) int32 {
	if border < 1 || x < wr.Left || y < wr.Top || x >= wr.Right || y >= wr.Bottom {
		return 0
	}
	left := x < wr.Left+border
	right := x >= wr.Right-border
	top := y < wr.Top+border
	bottom := y >= wr.Bottom-border
	switch {
	case top && left:
		return htTopLeft
	case top && right:
		return htTopRight
	case bottom && left:
		return htBottomLeft
	case bottom && right:
		return htBottomRight
	case left:
		return htLeft
	case right:
		return htRight
	case top:
		return htTop
	case bottom:
		return htBottom
	default:
		return 0
	}
}

// NMHdr is NMHDR.
type NMHdr struct {
	HwndFrom uintptr
	IDFrom   uintptr
	Code     uint32
}

// LVItem is the prefix of LVITEMW consulted for LVIF_TEXT.
type LVItem struct {
	Mask       uint32
	IItem      int32
	ISubItem   int32
	State      uint32
	StateMask  uint32
	PszText    uintptr
	CchTextMax int32
	IImage     int32
	LParam     uintptr
}

// LVColumn is the prefix of LVCOLUMNW consulted for text and width.
type LVColumn struct {
	Mask       uint32
	Fmt        int32
	Cx         int32
	PszText    uintptr
	CchTextMax int32
	ISubItem   int32
}

// GUID is a Windows GUID.
type GUID struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

// NotifyIconData is NOTIFYICONDATAW for Windows 10 x64.
type NotifyIconData struct {
	CbSize           uint32
	Pad0             uint32
	HWnd             uintptr
	UID              uint32
	UFlags           uint32
	UCallbackMessage uint32
	Pad1             uint32
	HIcon            uintptr
	SzTip            [128]uint16
	DwState          uint32
	DwStateMask      uint32
	SzInfo           [256]uint16
	UTimeout         uint32
	SzInfoTitle      [64]uint16
	DwInfoFlags      uint32
	GuidItem         GUID
	HBalloonIcon     uintptr
}

// OpenFileName is OPENFILENAMEW on amd64, including FlagsEx.
type OpenFileName struct {
	StructSize      uint32
	Owner           uintptr
	Instance        uintptr
	Filter          *uint16
	CustomFilter    *uint16
	MaxCustomFilter uint32
	FilterIndex     uint32
	File            *uint16
	MaxFile         uint32
	FileTitle       *uint16
	MaxFileTitle    uint32
	InitialDir      *uint16
	Title           *uint16
	Flags           uint32
	FileOffset      uint16
	FileExtension   uint16
	DefExt          *uint16
	CustData        uintptr
	Hook            uintptr
	TemplateName    *uint16
	Reserved        uintptr
	Reserved2       uint32
	FlagsEx         uint32
}

// IconInfo is ICONINFO on amd64.
type IconInfo struct {
	Icon  uint32
	XHot  uint32
	YHot  uint32
	Mask  uintptr
	Color uintptr
}

// InitCommonControlsEx is INITCOMMONCONTROLSEX.
type InitCommonControlsEx struct {
	Size uint32
	ICC  uint32
}

func init() {
	// Keep the compiler from dropping the layout types on non-Windows builds
	// that only compile the test. The size check lives in layout_test.go.
	_ = unsafe.Sizeof(NotifyIconData{})
}
