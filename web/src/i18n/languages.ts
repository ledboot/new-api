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
// The interface ships in English and Simplified Chinese only.
export const INTERFACE_LANGUAGE_OPTIONS = [
  { code: 'zhCN', label: '简体中文' },
  { code: 'en', label: 'English' },
] as const

export type InterfaceLanguageCode =
  (typeof INTERFACE_LANGUAGE_OPTIONS)[number]['code']

export function normalizeInterfaceLanguage(value?: string | null): string {
  if (!value) return 'en'

  const normalized = value.trim().replaceAll('_', '-').toLowerCase()
  if (
    normalized === 'zh' ||
    normalized === 'zhcn' ||
    normalized === 'zhtw' ||
    normalized.startsWith('zh-')
  ) {
    return 'zhCN'
  }
  return 'en'
}

/**
 * Map a browser-detected locale onto the interface language code this project
 * uses with i18next (`zhCN`).
 *
 * Browsers report standard BCP-47 tags (`zh-CN`, `zh-TW`, `zh-Hant`, `zh`, ...)
 * while `supportedLngs`/resources use the camelCase code, so without this
 * mapping a Chinese browser would never match. Every Chinese tag, including
 * Traditional ones saved by older versions, lands on `zhCN`; other codes pass
 * through so i18next's own `supportedLngs` matching applies (and falls back to
 * English for languages the project no longer ships).
 */
export function convertDetectedLanguage(value: string): string {
  const lower = value.trim().replaceAll('_', '-').toLowerCase()
  if (lower.startsWith('zh')) return 'zhCN'
  return value
}

/**
 * Convert an interface language code (the values i18next uses, such as `zhCN`)
 * into a valid BCP-47 locale tag that the `Intl.*` APIs accept.
 *
 * `new Intl.NumberFormat('zhCN')` throws `RangeError: Invalid language tag`, so
 * any locale derived from `i18n.language` / `i18n.resolvedLanguage` MUST be run
 * through this before it reaches an `Intl` constructor. Unknown values fall back
 * to `undefined`, which makes `Intl` use the runtime default locale.
 */
export function toIntlLocale(value?: string | null): string | undefined {
  if (!value) return undefined
  switch (value) {
    case 'zhCN':
      return 'zh-CN'
    default:
      break
  }
  try {
    return Intl.getCanonicalLocales(value)[0]
  } catch {
    return undefined
  }
}
