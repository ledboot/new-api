package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/pkg/siteseo"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets, pluginDispatcher gin.HandlerFunc) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")
	compress := gzip.Gzip(gzip.DefaultCompression)

	// Crawler-facing documents are answered directly: they must stay reachable
	// without the visitor challenge and without executing the frontend.
	crawlerDocument := []string{http.MethodGet, http.MethodHead}
	router.Match(crawlerDocument, "/robots.txt", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=3600")
		c.String(http.StatusOK, siteseo.RobotsTxt(siteOrigin(c)))
	})
	router.Match(crawlerDocument, "/sitemap.xml", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=3600")
		c.String(http.StatusOK, siteseo.Sitemap(siteOrigin(c), nil))
	})
	router.Match(crawlerDocument, "/llms.txt", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=3600")
		c.String(http.StatusOK, siteseo.LLMsTxt(siteOrigin(c)))
	})

	router.NoRoute(
		pluginDispatcher,
		middleware.RouteTag("web"),
		func(c *gin.Context) {
			// ServeFrontendFiles sends build files already compressed.
			if !frontendFS.Exists("/", c.Request.URL.Path) {
				compress(c)
			}
		},
		middleware.AccessTokenAudit(),
		middleware.GlobalWebRateLimit(frontendFS),
		middleware.Cache(),
		middleware.ServeFrontendFiles(frontendFS),
		func(c *gin.Context) {
			if target, ok := siteseo.CanonicalRedirect(system_setting.ServerAddress, c.Request.Host, c.Request.URL.RequestURI()); ok && (c.Request.Method == http.MethodGet || c.Request.Method == http.MethodHead) {
				c.Redirect(http.StatusMovedPermanently, target)
				return
			}
			if strings.HasPrefix(c.Request.RequestURI, "/v1") || strings.HasPrefix(c.Request.RequestURI, "/api") || strings.HasPrefix(c.Request.RequestURI, "/assets") {
				controller.RelayNotFound(c)
				return
			}
			c.Header("Cache-Control", "no-cache")
			if middleware.SiteEntryChallenge(c) {
				return
			}
			// The metadata language follows Accept-Language, so caches must not
			// reuse one language variant for another.
			c.Header("Vary", "Accept-Language")
			document := siteseo.Document(assets.IndexPage, c.Request.URL.Path, siteOrigin(c), c.GetHeader("Accept-Language"))
			c.Data(http.StatusOK, "text/html; charset=utf-8", document)
		},
	)
}

// siteOrigin is the public origin used for canonical links and sitemap entries.
func siteOrigin(c *gin.Context) string {
	return siteseo.Origin(system_setting.ServerAddress, c.Request.Host)
}
