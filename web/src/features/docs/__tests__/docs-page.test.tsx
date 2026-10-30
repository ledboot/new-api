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
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { Docs } from '../index'

const { language } = vi.hoisted(() => ({ language: { current: 'zhCN' } }))

vi.mock('@/components/layout', () => ({
  PublicLayout: (props: { children: ReactNode }) => props.children,
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      language: language.current,
      resolvedLanguage: language.current,
    },
  }),
}))

beforeEach(() => {
  language.current = 'zhCN'
})

test('renders the Chinese guide with stable section anchors and a table of contents', () => {
  const view = render(<Docs />)

  expect(
    screen.getByRole('heading', { level: 1, name: 'Tokara 使用文档' })
  ).toBeInTheDocument()

  // Footer links point at these language-neutral anchors.
  for (const id of [
    'overview',
    'advantages',
    'quickstart',
    'endpoints',
    'billing',
    'clients',
    'faq',
  ]) {
    expect(view.container.querySelector(`#${id}`)).toBeTruthy()
  }

  // Sidebar on desktop and the collapsible outline on phones share the label.
  expect(screen.getAllByRole('navigation', { name: 'On this page' })).toHaveLength(2)
  expect(
    screen.getAllByRole('link', { name: '计费与收费模式' }).length
  ).toBeGreaterThan(0)
  // Three outline levels: h2 section, h3 subsection.
  expect(screen.getAllByRole('link', { name: '额度与货币' }).length).toBeGreaterThan(0)

  expect(view.container.textContent).not.toContain('{#')
  expect(view.container.querySelector('.katex')).toBeTruthy()
  expect(view.container.textContent).not.toContain('$$')
  expect(view.container.textContent).toContain('ANTHROPIC_BASE_URL')
})

test('renders the English guide with the same anchors when the interface is English', () => {
  language.current = 'en'
  const view = render(<Docs />)

  expect(
    screen.getByRole('heading', { level: 1, name: 'Tokara Documentation' })
  ).toBeInTheDocument()

  for (const id of ['overview', 'billing', 'clients', 'faq']) {
    expect(view.container.querySelector(`#${id}`)).toBeTruthy()
  }

  expect(
    screen.getAllByRole('link', { name: 'Billing and pricing' }).length
  ).toBeGreaterThan(0)
  expect(
    screen.getAllByRole('link', { name: 'Quota and currency' }).length
  ).toBeGreaterThan(0)
  expect(view.container.textContent).toContain('model_providers.tokara')
  expect(view.container.textContent).not.toContain('{#')
  expect(view.container.querySelectorAll('pre').length).toBeGreaterThan(10)
})
