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
import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, Terminal } from 'lucide-react'
import type { PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { CopyButton } from '@/components/copy-button'
import {
  EcosystemIcon,
  getModelGuides,
  MODEL_GUIDE_ORDER,
  type ModelGuideSlug,
} from '@/features/model-guides'
import { cn } from '@/lib/utils'

interface ModelEcosystemProps {
  className?: string
}

const CARD_ACCENTS: Record<
  ModelGuideSlug,
  {
    pill: string
    topBar: string
  }
> = {
  'claude-code': {
    pill: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    topBar: 'from-amber-500/80 via-orange-500/60 to-transparent',
  },
  gpt: {
    pill: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    topBar: 'from-emerald-500/80 via-teal-500/60 to-transparent',
  },
  gemini: {
    pill: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    topBar: 'from-sky-500/80 via-indigo-500/60 to-transparent',
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

export function ModelEcosystem(props: ModelEcosystemProps) {
  const { t } = useTranslation()
  const guides = getModelGuides(t)

  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://tokara.top'

  const workloadRows = [
    {
      scenario: t('Terminal Coding Agents (Claude Code)'),
      model: 'claude-opus-5-5 / claude-fable-5-2',
      protocol: 'POST /v1/messages',
      href: '/claude-code' as const,
      guideLabel: 'Claude Code',
    },
    {
      scenario: t('Agentic Repo Workflows (Codex CLI)'),
      model: 'gpt-6.1-sol / gpt-6-astra',
      protocol: 'POST /v1/responses',
      href: '/gpt' as const,
      guideLabel: 'OpenAI GPT & Codex',
    },
    {
      scenario: t('1M+ Context & Multimodal Synthesis'),
      model: 'gemini-4-carbon / gemini-4-argon',
      protocol: 'POST /v1beta/models',
      href: '/gemini' as const,
      guideLabel: 'Google Gemini 4',
    },
    {
      scenario: t('High-Throughput Real-Time Agent Loops'),
      model: 'gemini-4-hydrogen / gemini-3.8-flash',
      protocol: 'POST /v1/chat/completions',
      href: '/gemini' as const,
      guideLabel: 'Gemini 4 & 3.8',
    },
  ]

  return (
    <section
      id='flagship-models'
      className={cn(
        'relative z-10 px-5 pt-16 pb-8 sm:px-6 md:pt-24 md:pb-12',
        props.className
      )}
    >
      <div className='site-container mx-auto'>
        <AnimateInView className='mb-10 flex flex-col justify-between gap-4 md:mb-12 md:flex-row md:items-end'>
          <div className='max-w-2xl'>
            <p className='text-primary mb-2 font-mono text-[11px] font-semibold tracking-[0.22em] uppercase'>
              // {t('Flagship Model Ecosystems')}
            </p>
            <h2 className='text-2xl leading-[1.15] font-bold tracking-[-0.025em] md:text-4xl'>
              {t('Claude Code, GPT-6.2 & Gemini 4')}{' '}
              <span className='text-muted-foreground font-semibold'>
                {t('behind a single API key')}
              </span>
            </h2>
            <p className='text-muted-foreground mt-3 text-sm leading-relaxed sm:text-base'>
              {t(
                'Dedicated native wire protocols for every leading model family — connect terminal coding agents and production SDKs without rewriting client code.'
              )}
            </p>
          </div>
          <Link
            to='/pricing'
            className='text-primary hover:text-primary/80 inline-flex shrink-0 items-center gap-1.5 font-mono text-xs font-semibold tracking-wide'
          >
            {t('Browse full model catalog')}
            <ArrowUpRight className='size-3.5' aria-hidden='true' />
          </Link>
        </AnimateInView>

        {/* 3 Flagship Pillar Cards */}
        <div className='grid gap-5 lg:grid-cols-3'>
          {MODEL_GUIDE_ORDER.map((slug, index) => {
            const guide = guides[slug]
            const style = CARD_ACCENTS[slug]
            const quickCommand = guide.homeQuickCommand(origin)

            return (
              <AnimateInView
                key={slug}
                delay={index * 80}
                animation='fade-up'
                className='min-w-0'
              >
                <article
                  onPointerMove={handleSpotlightMove}
                  className='tech-bento-card border-border/80 bg-card/90 group hover:border-primary/40 relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border p-5 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md sm:p-6 dark:border-white/[0.08]'
                >
                  <div
                    aria-hidden='true'
                    className={cn(
                      'pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-linear-to-r',
                      style.topBar
                    )}
                  />

                  <div className='relative z-10'>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='border-border/75 bg-background/85 flex size-11 items-center justify-center rounded-xl border shadow-2xs'>
                        <EcosystemIcon slug={slug} size={24} />
                      </div>
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase',
                          style.pill
                        )}
                      >
                        {guide.endpointPath}
                      </span>
                    </div>

                    <h3 className='mt-4 text-lg font-bold tracking-tight sm:text-xl'>
                      <Link
                        to={guide.href}
                        className='hover:text-primary transition-colors'
                      >
                        {guide.homeCardTitle}
                      </Link>
                    </h3>

                    <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                      {guide.homeCardSummary}
                    </p>

                    {/* Recessed Model Spec Well */}
                    <div className='border-border/70 bg-muted/35 divide-border/60 mt-4 divide-y rounded-xl border'>
                      {guide.models.map((model) => (
                        <div
                          key={model.id}
                          className='flex items-center justify-between gap-2 px-3 py-2 text-xs'
                        >
                          <code className='text-foreground truncate font-mono text-[11.5px] font-medium'>
                            {model.id}
                          </code>
                          <span className='text-muted-foreground shrink-0 font-mono text-[10px] uppercase'>
                            {model.contextWindow}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* One-Line Quick Config Preview */}
                    <div className='mt-3 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#090d16] px-3 py-2 text-slate-200'>
                      <div className='flex min-w-0 items-center gap-2 font-mono text-[11px]'>
                        <Terminal
                          className='size-3.5 shrink-0 text-sky-400'
                          aria-hidden='true'
                        />
                        <code className='truncate'>{quickCommand}</code>
                      </div>
                      <CopyButton
                        value={quickCommand}
                        tooltip={t('Copy')}
                        className='size-6 shrink-0 rounded-md text-slate-300 hover:bg-white/10 hover:text-white'
                        iconClassName='size-3'
                      />
                    </div>
                  </div>

                  <div className='border-border/60 relative z-10 mt-5 border-t pt-4'>
                    <Link
                      to={guide.href}
                      className='text-foreground group-hover:text-primary flex items-center justify-between text-xs font-semibold tracking-wide transition-colors sm:text-sm'
                    >
                      <span>
                        {t('Explore {{name}} setup & models', {
                          name: guide.shortLabel,
                        })}
                      </span>
                      <ArrowRight
                        className='size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1'
                        aria-hidden='true'
                      />
                    </Link>
                  </div>
                </article>
              </AnimateInView>
            )
          })}
        </div>

        {/* Workload-to-Model Routing Matrix (Structured SEO Table) */}
        <AnimateInView className='border-border/75 bg-card/70 mt-6 overflow-hidden rounded-2xl border shadow-2xs backdrop-blur-sm'>
          <div className='border-border/65 bg-muted/30 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-6'>
            <span className='font-mono text-xs font-semibold tracking-wider uppercase'>
              {t('Workload Selection Matrix')}
            </span>
            <span className='text-muted-foreground font-mono text-[11px]'>
              {t('Single key · Automatic multi-channel routing')}
            </span>
          </div>
          <div className='divide-border/60 divide-y'>
            {workloadRows.map((row) => (
              <div
                key={row.scenario}
                className='hover:bg-muted/25 grid grid-cols-1 items-center gap-2 px-4 py-3.5 transition-colors sm:px-6 md:grid-cols-12 md:gap-4'
              >
                <div className='text-sm font-medium md:col-span-4'>
                  {row.scenario}
                </div>
                <div className='md:col-span-4'>
                  <code className='border-border/70 bg-muted/50 text-foreground inline-block max-w-full truncate rounded-md border px-2 py-0.5 font-mono text-xs'>
                    {row.model}
                  </code>
                </div>
                <div className='text-muted-foreground font-mono text-xs md:col-span-2'>
                  {row.protocol}
                </div>
                <div className='md:col-span-2 md:text-right'>
                  <Link
                    to={row.href}
                    className='text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline'
                  >
                    {row.guideLabel}
                    <ArrowRight className='size-3' aria-hidden='true' />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
