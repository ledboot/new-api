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
import { describe, expect, test } from 'vitest'

import {
  convertDetectedLanguage,
  INTERFACE_LANGUAGE_OPTIONS,
  normalizeInterfaceLanguage,
  toIntlLocale,
} from './languages'

describe('interface languages', () => {
  test('offers English and Simplified Chinese only', () => {
    expect(INTERFACE_LANGUAGE_OPTIONS.map((option) => option.code)).toEqual([
      'zhCN',
      'en',
    ])
  })

  test('maps every Chinese tag onto zhCN', () => {
    expect(convertDetectedLanguage('zh-TW')).toBe('zhCN')
    expect(convertDetectedLanguage('zh-HK')).toBe('zhCN')
    expect(convertDetectedLanguage('zh-Hant-TW')).toBe('zhCN')
    expect(convertDetectedLanguage('zh')).toBe('zhCN')
    expect(convertDetectedLanguage('zh-CN')).toBe('zhCN')
    // Saved by older versions that still shipped Traditional Chinese.
    expect(convertDetectedLanguage('zhTW')).toBe('zhCN')
    expect(convertDetectedLanguage('zhCN')).toBe('zhCN')
  })

  test('passes non-Chinese values through unchanged', () => {
    expect(convertDetectedLanguage('en')).toBe('en')
    expect(convertDetectedLanguage('fr-FR')).toBe('fr-FR')
    expect(convertDetectedLanguage('ja')).toBe('ja')
  })

  test('normalizes saved settings and retired languages', () => {
    expect(normalizeInterfaceLanguage('zhCN')).toBe('zhCN')
    expect(normalizeInterfaceLanguage('zh-TW')).toBe('zhCN')
    expect(normalizeInterfaceLanguage('en')).toBe('en')
    // Languages the project no longer ships fall back to English.
    expect(normalizeInterfaceLanguage('ja')).toBe('en')
    expect(normalizeInterfaceLanguage('fr')).toBe('en')
    expect(normalizeInterfaceLanguage(null)).toBe('en')
  })

  test('converts interface codes into Intl locales', () => {
    expect(toIntlLocale('zhCN')).toBe('zh-CN')
    expect(toIntlLocale('en')).toBe('en')
    expect(toIntlLocale('')).toBeUndefined()
  })
})
