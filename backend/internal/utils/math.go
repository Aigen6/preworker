package utils

// Min returns the smaller of a or b
func Min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// Max returns the larger of a or b
func Max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
