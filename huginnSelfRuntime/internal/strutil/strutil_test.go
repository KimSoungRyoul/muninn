package strutil

import "testing"

func TestTruncate(t *testing.T) {
	tests := []struct {
		name string
		s    string
		n    int
		want string
	}{
		{"under cap", "hello", 10, "hello"},
		{"exact cap", "hello", 5, "hello"},
		{"over cap ascii", "hello", 3, "hel"},
		{"empty", "", 5, ""},
		{"zero cap", "hello", 0, ""},
		{"negative cap", "hello", -1, ""},
		// rune-based: 멀티바이트(한글)에서 깨진 UTF-8 을 만들지 않고 글자 단위로 자른다.
		// byte 슬라이스였다면 "가나다"[:2] 가 깨진 바이트를 반환했을 것이다.
		{"multibyte under cap", "가나다", 5, "가나다"},
		{"multibyte over cap", "가나다", 2, "가나"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := Truncate(tt.s, tt.n); got != tt.want {
				t.Errorf("Truncate(%q, %d) = %q, want %q", tt.s, tt.n, got, tt.want)
			}
		})
	}
}
