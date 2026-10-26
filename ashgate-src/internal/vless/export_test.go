package vless

// StartRaw boots an Xray instance from a JSON document. Tests use it as the VLESS server.
func StartRaw(raw []byte) (func(), error) {
	inst, err := loadAndStart(raw)
	if err != nil {
		return nil, err
	}
	return func() { _ = inst.Close() }, nil
}
