package middleware

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

type turnstileSettings struct {
	enabled       bool
	siteKey       string
	secretKey     string
	serverAddress string
}

func getTurnstileSettings() turnstileSettings {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	return turnstileSettings{
		enabled:       common.TurnstileCheckEnabled,
		siteKey:       common.TurnstileSiteKey,
		secretKey:     common.TurnstileSecretKey,
		serverAddress: system_setting.ServerAddress,
	}
}

type turnstileCheckResponse struct {
	Success  bool   `json:"success"`
	Action   string `json:"action"`
	Hostname string `json:"hostname"`
}

var turnstileClient = &http.Client{
	Timeout: 10 * time.Second,
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

func verifyTurnstile(ctx context.Context, secret, token, remoteIP string) (turnstileCheckResponse, error) {
	var result turnstileCheckResponse
	if secret == "" || token == "" || len(token) > 2048 {
		return result, nil
	}
	form := url.Values{"secret": {secret}, "response": {token}, "remoteip": {remoteIP}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(form.Encode()))
	if err != nil {
		return result, err
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response, err := turnstileClient.Do(request)
	if err != nil {
		return result, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return result, fmt.Errorf("Turnstile Siteverify returned status %d", response.StatusCode)
	}
	err = common.DecodeJson(io.LimitReader(response.Body, 16<<10), &result)
	return result, err
}

func TurnstileCheck() gin.HandlerFunc {
	return func(c *gin.Context) {
		settings := getTurnstileSettings()
		if settings.enabled {
			response := c.Query("turnstile")
			if response == "" {
				common.ApiErrorT(c, "Turnstile token is empty")
				c.Abort()
				return
			}
			result, err := verifyTurnstile(c.Request.Context(), settings.secretKey, response, c.ClientIP())
			if err != nil || !result.Success {
				common.ApiErrorT(c, "Turnstile verification failed, please refresh and try again!")
				c.Abort()
				return
			}
		}
		c.Next()
	}
}
