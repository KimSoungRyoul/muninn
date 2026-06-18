// Package strutil 은 huginn-self 내부에서 쓰는 작은 문자열 유틸이다(순수 stdlib).
package strutil

// Truncate 는 s 를 앞에서 최대 n rune 으로 자른다. n 이하면 그대로 반환한다.
// rune 기준이라 멀티바이트(한글 등) 문자열에서도 깨진 UTF-8 을 만들지 않는다.
func Truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}
