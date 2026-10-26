package version

import (
	"runtime/debug"
	"testing"
)

func TestFromSettings(t *testing.T) {
	got := fromSettings([]debug.BuildSetting{
		{Key: "vcs.revision", Value: "912208e5c0ffee0000000000000000000000beef"},
		{Key: "vcs.time", Value: "2026-10-26T18:40:00Z"},
		{Key: "vcs.modified", Value: "false"},
	})
	if got.String() != Version+" (912208e, 2026-10-26)" {
		t.Fatalf("%q", got.String())
	}
	if s := (Info{Version: Version}).String(); s != Version {
		t.Fatalf("%q", s)
	}
}
