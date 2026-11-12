/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect } from 'react'

type PageCopy = {
  title: string
  description: string
}

type SiteSeoData = {
  brand?: string
  pages?: Record<string, Record<string, PageCopy>>
}

const SEO_DATA_ELEMENT_ID = 'site-seo-data'

/**
 * The backend embeds the per-page copy of every public page in the document, in
 * both shipped languages (see `pkg/siteseo`). Reading it here avoids keeping a
 * second copy of the titles in the bundle while still letting the document
 * title follow client-side navigation.
 */
function readSiteSeoData(): SiteSeoData | null {
  const element = document.querySelector<HTMLScriptElement>(
    `#${SEO_DATA_ELEMENT_ID}`
  )
  if (!element?.textContent) return null
  try {
    return JSON.parse(element.textContent) as SiteSeoData
  } catch {
    return null
  }
}

function resolveCopy(
  pages: Record<string, Record<string, PageCopy>>,
  pathname: string,
  language: string
): PageCopy | null {
  const locale = language.startsWith('zh') ? 'zh' : 'en'
  const candidates = [pathname]
  if (pathname !== '/') {
    const trimmed = pathname.replace(/\/+$/, '')
    candidates.push(trimmed)
    const parent = trimmed.slice(0, trimmed.lastIndexOf('/'))
    if (parent) candidates.push(parent)
  }
  for (const candidate of candidates) {
    const entry = pages[candidate]
    if (!entry) continue
    const copy = entry[locale] ?? entry.en ?? entry.zh
    if (copy) return copy
  }
  return null
}

function setMetaContent(selector: string, content: string) {
  const element = document.head.querySelector<HTMLMetaElement>(selector)
  if (element) {
    element.setAttribute('content', content)
  }
}

/**
 * Keeps the browser tab, description and canonical URL in sync with the current
 * route. Crawlable metadata is rendered by the server; this only handles
 * navigation inside the single-page app.
 */
export function usePageSeo(pathname: string, language: string) {
  useEffect(() => {
    const data = readSiteSeoData()
    const brand = data?.brand
    const copy = data?.pages
      ? resolveCopy(data.pages, pathname, language)
      : null

    if (copy) {
      document.title = copy.title
      setMetaContent('meta[name="description"]', copy.description)
      setMetaContent('meta[property="og:title"]', copy.title)
      setMetaContent('meta[property="og:description"]', copy.description)
      setMetaContent('meta[name="twitter:title"]', copy.title)
      setMetaContent('meta[name="twitter:description"]', copy.description)
    } else if (brand) {
      document.title = brand
    }

    const canonical = document.head.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]'
    )
    if (canonical) {
      canonical.href = window.location.origin + pathname
      setMetaContent('meta[property="og:url"]', canonical.href)
    }
  }, [pathname, language])
}
