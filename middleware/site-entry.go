package middleware

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	_ "embed"
	"html/template"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
)

const (
	siteEntryAction   = "site_entry"
	siteEntryCookie   = "__Host-site_entry"
	siteEntryLifetime = 30 * time.Minute
)

//go:embed site-entry.html
var siteEntryHTML string

var siteEntryPage = template.Must(template.New("site-entry").Parse(siteEntryHTML))

func (settings turnstileSettings) siteEntryEnabled() bool {
	return settings.enabled && os.Getenv("TURNSTILE_SITE_ENTRY_ENABLED") == "true"
}

// SiteEntryChallenge gates the embedded website before any app code runs.
// Call it only for the SPA fallback, after serving assets and matching API routes.
func SiteEntryChallenge(c *gin.Context) bool {
	settings := getTurnstileSettings()
	if !settings.siteEntryEnabled() {
		return false
	}
	c.Header("Cache-Control", "private, no-store")
	if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
		c.Header("Allow", "GET, HEAD")
		c.Status(http.StatusMethodNotAllowed)
		return true
	}
	origin, hostname := siteEntryOrigin(settings.serverAddress, c.Request.Host)
	if origin == "" || settings.siteKey == "" || settings.secretKey == "" {
		c.String(http.StatusServiceUnavailable, i18n.T(c, i18n.MsgSiteEntryUnavailable))
		return true
	}
	if cookie, err := c.Request.Cookie(siteEntryCookie); err == nil {
		expires, signature, _ := strings.Cut(cookie.Value, ".")
		expiry, err := strconv.ParseInt(expires, 10, 64)
		if err == nil && expiry > time.Now().Unix() &&
			hmac.Equal([]byte(signature), []byte(signSiteEntry(origin, settings.secretKey, expires))) {
			return false
		}
	}

	nonce := rand.Text()
	var page bytes.Buffer
	lang := i18n.StatedLang(c)
	if lang == "" {
		lang = common.DefaultLanguage
	}
	if err := siteEntryPage.Execute(&page, map[string]string{
		"Lang":        lang,
		"Hostname":    hostname,
		"RayID":       c.GetHeader("CF-Ray"),
		"Provider":    i18n.T(c, i18n.MsgSiteEntryProvider),
		"Privacy":     i18n.T(c, i18n.MsgSiteEntryPrivacy),
		"Nonce":       nonce,
		"SiteKey":     settings.siteKey,
		"Action":      siteEntryAction,
		"Title":       i18n.T(c, i18n.MsgSiteEntryTitle),
		"Description": i18n.T(c, i18n.MsgSiteEntryDescription),
		"Error":       i18n.T(c, i18n.MsgSiteEntryError),
		"Retry":       i18n.T(c, i18n.MsgSiteEntryRetry),
		"NoScript":    i18n.T(c, i18n.MsgSiteEntryNoScript),
	}); err != nil {
		c.Status(http.StatusInternalServerError)
		return true
	}
	c.Header("Referrer-Policy", "no-referrer")
	c.Header("Content-Security-Policy", "default-src 'none'; script-src 'nonce-"+nonce+"' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; style-src 'nonce-"+nonce+"'; base-uri 'none'; frame-ancestors 'none'")
	c.Data(http.StatusForbidden, "text/html; charset=utf-8", page.Bytes())
	return true
}

// VerifySiteEntry exchanges a single-use Turnstile token for a browser-session
// cookie. This cookie only grants access to website documents.
func VerifySiteEntry(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	settings := getTurnstileSettings()
	if !settings.siteEntryEnabled() {
		c.Status(http.StatusNotFound)
		return
	}
	origin, hostname := siteEntryOrigin(settings.serverAddress, c.Request.Host)
	requestOrigin, ok := requestBrowserOrigin(c.Request)
	if origin == "" || !ok || requestOrigin != origin {
		c.Status(http.StatusForbidden)
		return
	}

	var request struct {
		Token string `json:"token"`
	}
	body := http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
	if err := common.DecodeJson(body, &request); err != nil || strings.TrimSpace(request.Token) == "" || len(request.Token) > 2048 {
		c.Status(http.StatusBadRequest)
		return
	}
	result, err := verifyTurnstile(c.Request.Context(), settings.secretKey, request.Token, c.ClientIP())
	if err != nil || !result.Success || result.Action != siteEntryAction || !strings.EqualFold(result.Hostname, hostname) {
		c.Status(http.StatusForbidden)
		return
	}

	expires := strconv.FormatInt(time.Now().Add(siteEntryLifetime).Unix(), 10)
	http.SetCookie(c.Writer, &http.Cookie{
		Name: siteEntryCookie, Value: expires + "." + signSiteEntry(origin, settings.secretKey, expires),
		Path: "/", Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode,
	})
	c.Status(http.StatusNoContent)
}

func signSiteEntry(origin, secretKey, expires string) string {
	return common.GenerateHMACWithKey([]byte("site-entry-v1:"+common.SessionSecret), origin+"\n"+secretKey+"\n"+expires)
}

// Compare against the configured public HTTPS authority, without trusting
// forwarded host or scheme headers. The conventional www alias is also allowed.
func siteEntryOrigin(serverAddress, authority string) (string, string) {
	publicURL, err := url.Parse(serverAddress)
	if err != nil || publicURL.Scheme != "https" || publicURL.Hostname() == "" {
		return "", ""
	}
	origin, err := common.NormalizeOrigin("https://" + authority)
	if err != nil {
		return "", ""
	}
	bare := strings.TrimPrefix(strings.ToLower(publicURL.Host), "www.")
	canonical, _ := common.NormalizeOrigin("https://" + bare)
	www, _ := common.NormalizeOrigin("https://www." + bare)
	if origin != canonical && origin != www {
		return "", ""
	}
	parsed, _ := url.Parse(origin)
	return origin, parsed.Hostname()
}
