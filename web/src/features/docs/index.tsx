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
import { ChevronDown } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'
// The guides are plain Markdown on purpose: they render as-is here and can move
// to a standalone docs project without rewriting the content.
import docsEn from '@/content/docs.en.md?raw'
import docsZh from '@/content/docs.zh.md?raw'

import './docs.css'

type TocItem = {
  id: string
  text: string
  level: number
  parentId?: string
}

const HEADING_SELECTOR = 'h2, h3, h4'
const ACTIVE_OFFSET = 140

function hashTarget() {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function tocTone(isActive: boolean, isAncestor: boolean) {
  if (isActive) return 'text-primary font-medium'
  if (isAncestor) return 'text-foreground'
  return 'text-muted-foreground hover:text-foreground'
}

function mobileTocTone(isActive: boolean, isAncestor: boolean) {
  if (isActive) return 'text-primary bg-primary/10 font-medium'
  if (isAncestor) return 'text-foreground'
  return 'text-muted-foreground'
}

function indentClass(level: number) {
  if (level <= 2) return 'pl-4 text-sm'
  if (level === 3) return 'pl-8 text-[13px]'
  return 'pl-12 text-[12.5px]'
}

export function Docs() {
  const { t, i18n } = useTranslation()
  const contentRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({})
  const [items, setItems] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [indicator, setIndicator] = useState<{
    top: number
    height: number
  } | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  // Re-measure the rail after layout changes that do not move the active item:
  // rotating a phone, crossing the sidebar breakpoint, or late font loading.
  const [layoutTick, setLayoutTick] = useState(0)

  const language = i18n.resolvedLanguage ?? i18n.language ?? ''
  const content = language.toLowerCase().startsWith('zh') ? docsZh : docsEn

  // Collect the outline (h2 → h3 → h4, at most three levels) after each render
  // of the guide, so the sidebar follows the current language.
  useEffect(() => {
    const root = contentRef.current
    if (!root) return
    const next: TocItem[] = []
    const stack: TocItem[] = []
    for (const heading of root.querySelectorAll<HTMLElement>(
      HEADING_SELECTOR
    )) {
      if (!heading.id) continue
      const level = Number(heading.tagName.slice(1))
      while (stack.length > 0 && (stack.at(-1)?.level ?? 0) >= level) {
        stack.pop()
      }
      const item: TocItem = {
        id: heading.id,
        text: heading.textContent?.trim() || heading.id,
        level,
        parentId: level > 2 ? stack.at(-1)?.id : undefined,
      }
      stack.push(item)
      next.push(item)
    }
    setItems(next)
    setActiveId((current) => current || next[0]?.id || '')
  }, [content])

  // Scroll spy: the last heading above the fold is the current one.
  useEffect(() => {
    if (items.length === 0) return
    let frame = 0
    const update = () => {
      frame = 0
      const headings = items
        .map((item) => document.getElementById(item.id))
        .filter((element): element is HTMLElement => element !== null)
      if (headings.length === 0) return
      let current = headings[0].id
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > ACTIVE_OFFSET) break
        current = heading.id
      }
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 8
      if (atBottom) current = headings.at(-1)?.id ?? current
      setActiveId((previous) => (previous === current ? previous : current))
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [items])

  // The rail follows the hovered entry, otherwise the current section. Moving a
  // single element (instead of per-item borders) keeps both changes animated.
  useEffect(() => {
    const bump = () => setLayoutTick((tick) => tick + 1)
    window.addEventListener('resize', bump)
    document.fonts?.ready.then(bump).catch(() => undefined)
    return () => window.removeEventListener('resize', bump)
  }, [])

  const highlightedId = hoverId ?? activeId
  useEffect(() => {
    const link = linkRefs.current[highlightedId]
    const nav = navRef.current
    if (!link || !nav || !nav.offsetParent) {
      setIndicator(null)
      return
    }
    setIndicator({
      top: link.offsetTop + link.offsetHeight / 2,
      height: Math.min(link.offsetHeight - 8, 22),
    })
  }, [highlightedId, items, layoutTick])

  // Keep the current section visible when the outline is taller than the
  // viewport, without moving the page itself.
  useEffect(() => {
    const container = scrollRef.current
    const nav = navRef.current
    const link = linkRefs.current[activeId]
    if (!container || !nav || !link) return
    const top = nav.offsetTop + link.offsetTop
    const bottom = top + link.offsetHeight
    const viewTop = container.scrollTop
    const viewBottom = viewTop + container.clientHeight
    if (top < viewTop + 32 || bottom > viewBottom - 32) {
      // jsdom (tests) has no scrollTo; the outline still renders without it.
      container.scrollTo?.({
        top: Math.max(0, top - container.clientHeight / 2),
        behavior: 'smooth',
      })
    }
  }, [activeId])

  // Footer links and external deep links change the hash without remounting.
  useEffect(() => {
    const scrollToHash = () => {
      const target = hashTarget()
      if (!target) return
      document
        .getElementById(target)
        ?.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
    scrollToHash()
    window.addEventListener('hashchange', scrollToHash)
    return () => window.removeEventListener('hashchange', scrollToHash)
  }, [])

  const goTo = useCallback((event: MouseEvent, id: string) => {
    event.preventDefault()
    const target = document.getElementById(id)
    setMobileOpen(false)
    setActiveId(id)
    if (!target) return
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches
    target.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    })
    window.history.replaceState(null, '', `#${encodeURIComponent(id)}`)
  }, [])

  // Highlight the parent section of the current heading so the outline keeps
  // its context when a nested subsection is active.
  const activeAncestors = new Set<string>()
  let ancestorId = items.find((item) => item.id === activeId)?.parentId
  while (ancestorId) {
    activeAncestors.add(ancestorId)
    ancestorId = items.find((item) => item.id === ancestorId)?.parentId
  }

  return (
    <PublicLayout showMainContainer={false}>
      <main className='site-container px-4 pt-24 pb-20 md:px-6 lg:px-8 xl:px-12'>
        <div className='mx-auto flex w-full max-w-[1720px] gap-8 xl:gap-16'>
          <aside className='hidden w-[260px] shrink-0 lg:block'>
            <div
              ref={scrollRef}
              className='sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2 [scrollbar-width:thin]'
            >
              <p className='text-muted-foreground/80 mb-3 text-[11px] font-semibold tracking-[0.12em] uppercase'>
                {t('On this page')}
              </p>
              <nav
                ref={navRef}
                aria-label={t('On this page')}
                className='relative border-l border-border'
              >
                <span
                  aria-hidden='true'
                  className='bg-primary absolute -left-px w-0.5 rounded-full transition-all duration-300 ease-out'
                  style={{
                    top: indicator ? indicator.top - indicator.height / 2 : 0,
                    height: indicator?.height ?? 0,
                    opacity: indicator ? 1 : 0,
                  }}
                />
                <ul className='space-y-0.5 py-1'>
                  {items.map((item) => (
                    <li key={item.id}>
                      <a
                        ref={(element) => {
                          linkRefs.current[item.id] = element
                        }}
                        href={`#${encodeURIComponent(item.id)}`}
                        onClick={(event) => goTo(event, item.id)}
                        onMouseEnter={() => setHoverId(item.id)}
                        onMouseLeave={() => setHoverId(null)}
                        onFocus={() => setHoverId(item.id)}
                        onBlur={() => setHoverId(null)}
                        aria-current={
                          activeId === item.id ? 'location' : undefined
                        }
                        className={cn(
                          '-ml-px block border-l-2 border-transparent py-1.5 leading-5 transition-all duration-200 ease-out',
                          indentClass(item.level),
                          tocTone(
                            activeId === item.id,
                            activeAncestors.has(item.id)
                          ),
                          hoverId === item.id && 'translate-x-0.5'
                        )}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>

          <div className='min-w-0 flex-1'>
            <div className='mx-auto w-full max-w-[1080px]'>
              <div className='mb-6 lg:hidden'>
                <button
                  type='button'
                  aria-expanded={mobileOpen}
                  aria-controls='docs-mobile-toc'
                  onClick={() => setMobileOpen((open) => !open)}
                  className='border-border bg-card flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:border-primary/40'
                >
                  <span>{t('On this page')}</span>
                  <ChevronDown
                    aria-hidden='true'
                    className={cn(
                      'text-muted-foreground size-4 transition-transform duration-300',
                      mobileOpen && 'rotate-180'
                    )}
                  />
                </button>
                <div
                  id='docs-mobile-toc'
                  inert={!mobileOpen}
                  className={cn(
                    'grid transition-all duration-300 ease-out',
                    mobileOpen
                      ? 'grid-rows-[1fr] opacity-100'
                      : 'grid-rows-[0fr] opacity-0'
                  )}
                >
                  <div className='overflow-hidden'>
                    <nav
                      aria-label={t('On this page')}
                      className='border-border bg-card mt-2 max-h-[60vh] overflow-y-auto rounded-xl border p-3'
                    >
                      <ul className='space-y-0.5'>
                        {items.map((item) => (
                          <li key={item.id}>
                            <a
                              href={`#${encodeURIComponent(item.id)}`}
                              onClick={(event) => goTo(event, item.id)}
                              aria-current={
                                activeId === item.id ? 'location' : undefined
                              }
                              className={cn(
                                'block rounded-md py-2 leading-5 transition-colors',
                                indentClass(item.level),
                                mobileTocTone(
                                  activeId === item.id,
                                  activeAncestors.has(item.id)
                                )
                              )}
                            >
                              {item.text}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </nav>
                  </div>
                </div>
              </div>

              <article ref={contentRef} className='docs-article'>
                <Markdown>{content}</Markdown>
              </article>
            </div>
          </div>
        </div>
      </main>
    </PublicLayout>
  )
}
