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
import ClaudeColor from '@lobehub/icons/es/Claude/components/Color'
import GeminiColor from '@lobehub/icons/es/Gemini/components/Color'
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { CopyButton } from '@/components/copy-button'
import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { Button } from '@/components/ui/button'
import { CTA } from '@/features/home/components/sections/cta'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  getModelGuides,
  MODEL_GUIDE_ORDER,
  type ModelGuideConfig,
  type ModelGuideSlug,
} from './data'

export function EcosystemIcon(props: { slug: ModelGuideSlug; size?: number }) {
  const size = props.size ?? 20
  if (props.slug === 'claude-code') {
    return <ClaudeColor size={size} aria-hidden='true' />
  }
  if (props.slug === 'gemini') {
    return <GeminiColor size={size} aria-hidden='true' />
  }
  return <OpenAIMono size={size} aria-hidden='true' />
}

const ACCENT_STYLES: Record<
  ModelGuideConfig['accentTone'],
  {
    badge: string
    dot: string
    gradientText: string
    ringHover: string
    tabActive: string
  }
> = {
  amber: {
    badge:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.65)]',
    gradientText:
      'from-amber-600 via-orange-500 to-primary dark:from-amber-300 dark:via-orange-300 dark:to-primary',
    ringHover: 'hover:border-amber-500/40',
    tabActive:
      'border-amber-500/40 bg-amber-500/12 text-amber-700 dark:text-amber-300',
  },
  emerald: {
    badge:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.65)]',
    gradientText:
      'from-emerald-600 via-teal-500 to-primary dark:from-emerald-300 dark:via-cyan-300 dark:to-primary',
    ringHover: 'hover:border-emerald-500/40',
    tabActive:
      'border-emerald-500/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
  },
  indigo: {
    badge: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.65)]',
    gradientText:
      'from-sky-600 via-indigo-500 to-violet-500 dark:from-sky-300 dark:via-indigo-300 dark:to-violet-300',
    ringHover: 'hover:border-sky-500/40',
    tabActive: 'border-sky-500/40 bg-sky-500/12 text-sky-700 dark:text-sky-300',
  },
}

function handleSpotlightMove(event: PointerEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty(
    '--mouse-x',
    `${event.clientX - rect.left}px`
  )
  event.currentTarget.style.setProperty(
    '--mouse-y',
    `${event.clientY - rect.top}px`
  )
}

export function ModelGuidePage(props: { slug: ModelGuideSlug }) {
  const { t } = useTranslation()
  const { auth } = useAuthStore()
  const isAuthenticated = !!auth.user
  const [activeSnippetIdx, setActiveSnippetIdx] = useState(0)

  const guides = getModelGuides(t)
  const guide = guides[props.slug]
  const accent = ACCENT_STYLES[guide.accentTone]
  const siblingGuides = MODEL_GUIDE_ORDER.filter(
    (item) => item !== props.slug
  ).map((item) => guides[item])

  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://tokara.top'
  const baseUrlValue = `${origin}${guide.baseUrlSuffix}`
  const activeSnippet = guide.snippets[activeSnippetIdx] ?? guide.snippets[0]
  const renderedCode = activeSnippet.code(origin)

  return (
    <PublicLayout showMainContainer={false}>
      <main>
        {/* Architectural Split Hero + Copyable Multi-Tab Config Workbench */}
        <section className='tokara-hero relative overflow-hidden px-5 pt-25 pb-14 sm:px-6 md:pt-30 md:pb-18'>
          <div
            className='tokara-hero-grid pointer-events-none absolute inset-0'
            aria-hidden='true'
          />

          <div className='site-container relative mx-auto'>
            {/* Semantic Breadcrumb matching Server JSON-LD BreadcrumbList */}
            <nav
              aria-label={t('Breadcrumb')}
              className='text-muted-foreground mb-6 flex flex-wrap items-center gap-1.5 font-mono text-xs'
            >
              <Link to='/' className='hover:text-foreground transition-colors'>
                {t('Home')}
              </Link>
              <ChevronRight
                className='size-3.5 opacity-60'
                aria-hidden='true'
              />
              <span className='text-foreground font-medium'>
                {guide.breadcrumbLabel}
              </span>
            </nav>

            <div className='grid items-start gap-10 lg:grid-cols-12 lg:gap-10 xl:gap-14'>
              {/* Left Column: Search-intent H1, summary, CTAs, Base URL Copy */}
              <div className='min-w-0 lg:col-span-6'>
                <div className='flex flex-wrap items-center gap-2'>
                  <span
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold tracking-wider uppercase',
                      accent.badge
                    )}
                  >
                    <span
                      className={cn('size-1.5 rounded-full', accent.dot)}
                      aria-hidden='true'
                    />
                    {guide.protocolTag}
                  </span>
                </div>

                <p className='text-primary mt-5 font-mono text-[11px] font-semibold tracking-[0.2em] uppercase'>
                  // {guide.heroEyebrow}
                </p>

                <h1 className='mt-2.5 text-[clamp(2rem,4.1vw,3.35rem)] leading-[1.12] font-bold tracking-[-0.03em] text-balance'>
                  <span className='inline-flex items-center gap-3 align-middle'>
                    <span className='border-border/80 bg-card inline-flex size-10 shrink-0 items-center justify-center rounded-xl border shadow-2xs sm:size-11'>
                      <EcosystemIcon slug={guide.slug} size={24} />
                    </span>
                    <span>{guide.heroTitle}</span>
                  </span>{' '}
                  <span
                    className={cn(
                      'block bg-linear-to-r bg-clip-text text-transparent',
                      accent.gradientText
                    )}
                  >
                    {guide.heroHighlight}
                  </span>
                </h1>

                <p className='text-muted-foreground mt-4 max-w-xl text-sm leading-relaxed sm:text-base'>
                  {guide.heroDescription}
                </p>

                <div className='mt-7 flex flex-wrap items-center gap-3'>
                  <Button
                    className='group h-11 rounded-xl px-6 text-sm font-semibold'
                    render={
                      <Link to={isAuthenticated ? '/keys' : '/sign-up'} />
                    }
                  >
                    {isAuthenticated ? t('Create API Key') : t('Get Started')}
                    <ArrowRight
                      className='size-4 transition-transform duration-200 group-hover:translate-x-0.5'
                      aria-hidden='true'
                    />
                  </Button>
                  <Button
                    variant='outline'
                    className='bg-card/70 h-11 rounded-xl px-5 text-sm font-medium backdrop-blur-sm'
                    render={<Link to='/pricing' />}
                  >
                    {t('View Pricing')}
                  </Button>
                  <Button
                    variant='ghost'
                    className='h-11 rounded-xl px-4 text-sm font-medium'
                    render={<Link to='/docs' />}
                  >
                    {t('Integration Docs')}
                  </Button>
                </div>

                {/* Base URL Copy Box with explicit protocol guidance */}
                <div className='border-border/80 bg-card/85 mt-7 max-w-xl rounded-2xl border p-3.5 shadow-2xs backdrop-blur-md'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='flex min-w-0 items-center gap-2 font-mono text-xs'>
                      <Terminal
                        className='text-primary size-3.5 shrink-0'
                        aria-hidden='true'
                      />
                      <span className='text-muted-foreground shrink-0 text-[10px] tracking-wider uppercase'>
                        BASE URL
                      </span>
                      <code className='text-foreground truncate font-semibold'>
                        {baseUrlValue}
                      </code>
                    </div>
                    <CopyButton
                      value={baseUrlValue}
                      tooltip={t('Copy')}
                      className='border-border/70 bg-muted/60 hover:bg-muted size-7 shrink-0 rounded-lg border'
                      iconClassName='size-3.5'
                    />
                  </div>
                  <p className='text-muted-foreground mt-2 border-t pt-2 text-xs leading-relaxed'>
                    {guide.baseUrlHint}
                  </p>
                </div>
              </div>

              {/* Right Column: Multi-Tab Copyable Quickstart Workbench */}
              <div className='min-w-0 lg:col-span-6'>
                <div className='tech-corner-ticks rounded-2xl'>
                  <div className='border-border/80 overflow-hidden rounded-2xl border bg-[#090d16] text-slate-100 shadow-[0_24px_64px_-24px_rgba(2,6,23,0.65)] dark:border-white/10'>
                    {/* Window Header + Tab Switcher */}
                    <div className='flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3.5 py-2.5 sm:px-4'>
                      <div className='flex flex-wrap items-center gap-1'>
                        {guide.snippets.map((tab, idx) => {
                          const isActive = idx === activeSnippetIdx
                          return (
                            <button
                              key={tab.id}
                              type='button'
                              onClick={() => setActiveSnippetIdx(idx)}
                              className={cn(
                                'cursor-pointer rounded-lg border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors',
                                isActive
                                  ? 'border-sky-400/40 bg-sky-400/15 text-sky-200'
                                  : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
                              )}
                            >
                              {tab.label}
                            </button>
                          )
                        })}
                      </div>
                      <CopyButton
                        value={renderedCode}
                        tooltip={t('Copy')}
                        className='size-7 shrink-0 rounded-lg border border-white/15 bg-white/5 text-slate-200 hover:bg-white/15 hover:text-white'
                        iconClassName='size-3.5'
                      />
                    </div>

                    {/* File / Route Sub-bar */}
                    <div className='flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2 font-mono text-[11px] text-slate-400'>
                      <span className='truncate'>{activeSnippet.filename}</span>
                      <span className='inline-flex shrink-0 items-center gap-1.5 text-[10px] text-emerald-400'>
                        <span
                          className='size-1.5 rounded-full bg-emerald-400'
                          aria-hidden='true'
                        />
                        {guide.endpointPath}
                      </span>
                    </div>

                    {/* Code Viewport */}
                    <pre className='overflow-x-auto p-4 font-mono text-xs leading-relaxed text-slate-200 sm:p-5 sm:text-[12.5px]'>
                      <code>{renderedCode}</code>
                    </pre>

                    {/* Telemetry Footer */}
                    <div className='flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] bg-white/[0.02] px-4 py-2.5 font-mono text-[10px] text-slate-400'>
                      <span>AUTH: BEARER / API-KEY</span>
                      <span>STREAM: SSE · PROMPT CACHE READY</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 4-Cell Blueprint Spec Bar */}
            <div className='border-border/80 bg-card/85 divide-border/70 mt-10 grid grid-cols-2 divide-x divide-y overflow-hidden rounded-2xl border shadow-2xs backdrop-blur-md lg:grid-cols-4 lg:divide-y-0'>
              {guide.specs.map((spec, index) => (
                <div key={spec.label} className='p-4 sm:p-5'>
                  <div className='text-muted-foreground flex items-center justify-between font-mono text-[10px] tracking-[0.16em] uppercase'>
                    <span>{spec.label}</span>
                    <span aria-hidden='true'>0{index + 1}</span>
                  </div>
                  <p className='mt-2 font-mono text-xl font-bold tracking-tight sm:text-2xl'>
                    {spec.value}
                  </p>
                  <p className='text-muted-foreground mt-1 text-xs leading-snug'>
                    {spec.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Latest Mainstream Model Lineup Matrix */}
        <section className='px-5 py-16 sm:px-6 md:py-22'>
          <div className='site-container mx-auto'>
            <AnimateInView className='mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-end'>
              <div className='max-w-2xl'>
                <p className='text-primary mb-2 font-mono text-[11px] font-semibold tracking-[0.22em] uppercase'>
                  // {t('Mainstream Model Lineup')}
                </p>
                <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-3xl'>
                  {guide.modelsSectionTitle}
                </h2>
                <p className='text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base'>
                  {guide.modelsSectionSubtitle}
                </p>
              </div>
              <Button
                variant='outline'
                size='sm'
                className='w-fit rounded-xl'
                render={<Link to='/pricing' />}
              >
                {t('Open Model Square')}
                <ArrowRight className='ml-1 size-3.5' aria-hidden='true' />
              </Button>
            </AnimateInView>

            <div className='grid gap-4 md:grid-cols-2'>
              {guide.models.map((model, idx) => (
                <AnimateInView
                  key={model.id}
                  delay={idx * 60}
                  animation='fade-up'
                >
                  <article
                    onPointerMove={handleSpotlightMove}
                    className={cn(
                      'tech-bento-card border-border/80 bg-card/85 flex h-full flex-col justify-between rounded-2xl border p-5 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md sm:p-6 dark:border-white/[0.08]',
                      accent.ringHover
                    )}
                  >
                    <div className='relative z-10'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <span
                          className={cn(
                            'rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase',
                            accent.badge
                          )}
                        >
                          {model.tier}
                        </span>
                        <div className='flex items-center gap-1.5 font-mono text-[11px]'>
                          <span className='border-border/70 bg-muted/50 text-muted-foreground rounded-md border px-2 py-0.5'>
                            {model.contextWindow}
                          </span>
                          <span className='border-border/70 bg-muted/50 text-muted-foreground rounded-md border px-2 py-0.5'>
                            {model.maxOutput}
                          </span>
                        </div>
                      </div>

                      <div className='mt-4 flex items-center justify-between gap-3'>
                        <h3 className='text-lg font-bold tracking-tight sm:text-xl'>
                          {model.name}
                        </h3>
                      </div>

                      {/* Copyable API Model ID Pill */}
                      <div className='border-border/75 bg-muted/35 mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5'>
                        <code className='text-foreground truncate font-mono text-xs font-medium'>
                          {model.id}
                        </code>
                        <CopyButton
                          value={model.id}
                          tooltip={t('Copy')}
                          className='hover:bg-muted size-6 shrink-0 rounded-md'
                          iconClassName='size-3'
                        />
                      </div>

                      <p className='text-muted-foreground mt-3.5 text-sm leading-relaxed'>
                        {model.summary}
                      </p>
                    </div>

                    <div className='border-border/60 relative z-10 mt-5 border-t pt-4'>
                      <ul className='flex flex-wrap gap-2'>
                        {model.highlights.map((item) => (
                          <li
                            key={item}
                            className='border-border/65 bg-background/70 text-foreground/85 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs'
                          >
                            <Check
                              className='text-primary size-3 shrink-0'
                              aria-hidden='true'
                            />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </article>
                </AnimateInView>
              ))}
            </div>

            {/* Additional Supported Model IDs Strip (captures long-tail model queries) */}
            <div className='border-border/75 bg-card/65 mt-6 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5'>
              <div className='flex items-center gap-2 text-xs font-medium'>
                <Sparkles
                  className='text-primary size-4 shrink-0'
                  aria-hidden='true'
                />
                <span>{t('Also compatible model IDs:')}</span>
              </div>
              <div className='flex flex-wrap gap-1.5'>
                {guide.compatibleAliases.map((alias) => (
                  <code
                    key={alias}
                    className='border-border/70 bg-muted/45 text-muted-foreground rounded-md border px-2 py-0.5 font-mono text-[11px]'
                  >
                    {alias}
                  </code>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Gateway Capabilities Bento */}
        <section className='border-border/60 bg-muted/25 border-y px-5 py-16 sm:px-6 md:py-22'>
          <div className='site-container mx-auto'>
            <AnimateInView className='mb-10 max-w-2xl'>
              <p className='text-primary mb-2 font-mono text-[11px] font-semibold tracking-[0.22em] uppercase'>
                // {t('Gateway Architecture')}
              </p>
              <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-3xl'>
                {guide.capabilitiesTitle}
              </h2>
              <p className='text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base'>
                {guide.capabilitiesSubtitle}
              </p>
            </AnimateInView>

            <div className='grid gap-4 md:grid-cols-2'>
              {guide.capabilities.map((cap, idx) => (
                <AnimateInView
                  key={cap.code}
                  delay={idx * 60}
                  animation='scale-in'
                >
                  <div
                    onPointerMove={handleSpotlightMove}
                    className='tech-bento-card border-border/80 bg-card/90 h-full rounded-2xl border p-5 shadow-2xs sm:p-6 dark:border-white/[0.08]'
                  >
                    <div className='relative z-10'>
                      <div className='mb-3 flex items-center gap-2.5'>
                        <span className='border-primary/25 bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg border font-mono text-[11px] font-semibold'>
                          {cap.code}
                        </span>
                        <span className='text-muted-foreground font-mono text-[10px] tracking-[0.18em] uppercase'>
                          {cap.tag}
                        </span>
                      </div>
                      <h3 className='text-base font-semibold tracking-tight sm:text-lg'>
                        {cap.title}
                      </h3>
                      <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                        {cap.description}
                      </p>
                    </div>
                  </div>
                </AnimateInView>
              ))}
            </div>
          </div>
        </section>

        {/* Troubleshooting & High-Intent SEO FAQ */}
        <section className='px-5 py-16 sm:px-6 md:py-22'>
          <div className='site-container mx-auto grid gap-10 md:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] md:gap-14'>
            <div>
              <p className='text-primary font-mono text-[11px] font-semibold tracking-[0.2em] uppercase'>
                // FAQ
              </p>
              <h2 className='mt-3 text-2xl leading-tight font-bold tracking-tight md:text-3xl'>
                {guide.faqTitle}
              </h2>
              <p className='text-muted-foreground mt-3 text-sm leading-relaxed'>
                {guide.faqSubtitle}
              </p>
              <div className='mt-6 flex flex-wrap gap-2'>
                <Button
                  variant='outline'
                  size='sm'
                  className='rounded-xl'
                  render={<Link to='/docs' />}
                >
                  {t('Read Full Documentation')}
                </Button>
                <Button
                  variant='ghost'
                  size='sm'
                  className='rounded-xl'
                  render={<Link to='/pricing' />}
                >
                  {t('Compare All Model Prices')}
                </Button>
              </div>
            </div>

            <div className='border-border/80 bg-card/85 rounded-2xl border p-5 shadow-2xs sm:p-7'>
              <div className='divide-border/60 divide-y'>
                {guide.faqs.map((item, idx) => (
                  <details
                    key={item.question}
                    open={idx === 0}
                    className='group py-3.5 first:pt-0 last:pb-0'
                  >
                    <summary className='hover:text-primary flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden'>
                      <span>{item.question}</span>
                      <ChevronDown
                        aria-hidden='true'
                        className='text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-open:rotate-180'
                      />
                    </summary>
                    <p className='text-muted-foreground mt-2.5 pr-6 text-sm leading-relaxed'>
                      {item.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Cross-Link Sibling Model Guides for SEO Internal Link Equity */}
        <section className='px-5 pb-8 sm:px-6'>
          <div className='site-container mx-auto'>
            <div className='border-border/75 bg-card/65 rounded-2xl border p-5 sm:p-6'>
              <div className='mb-4 flex items-center justify-between gap-2'>
                <h2 className='text-sm font-semibold tracking-tight sm:text-base'>
                  {t('Explore other flagship model guides on Tokara')}
                </h2>
                <Link
                  to='/'
                  className='text-primary font-mono text-xs hover:underline'
                >
                  {t('Back to Home')}
                </Link>
              </div>
              <div className='grid gap-3 md:grid-cols-2'>
                {siblingGuides.map((sibling) => (
                  <Link
                    key={sibling.slug}
                    to={sibling.href}
                    className='border-border/75 bg-background/75 hover:border-primary/40 group flex items-center justify-between gap-4 rounded-xl border p-4 transition-all'
                  >
                    <div className='flex min-w-0 items-center gap-3.5'>
                      <span className='border-border/70 bg-card flex size-10 shrink-0 items-center justify-center rounded-xl border'>
                        <EcosystemIcon slug={sibling.slug} size={20} />
                      </span>
                      <div className='min-w-0'>
                        <p className='truncate text-sm font-semibold'>
                          {sibling.homeCardTitle}
                        </p>
                        <p className='text-muted-foreground mt-0.5 truncate text-xs'>
                          {sibling.homeCardSummary}
                        </p>
                      </div>
                    </div>
                    <ArrowRight
                      className='text-muted-foreground group-hover:text-primary size-4 shrink-0 transition-transform group-hover:translate-x-0.5'
                      aria-hidden='true'
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <CTA isAuthenticated={isAuthenticated} />
      </main>
      <Footer />
    </PublicLayout>
  )
}
