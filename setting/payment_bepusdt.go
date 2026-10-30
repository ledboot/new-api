package setting

// BEpusdt charges fixed USD orders; the gateway converts USD to the selected token.
var (
	BepusdtApiURL    string
	BepusdtApiToken  string
	BepusdtTradeType         = "usdt.trc20"
	BepusdtUnitPrice float64 = 1
	BepusdtMinTopUp  int     = 1
)
