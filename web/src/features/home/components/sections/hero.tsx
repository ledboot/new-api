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
import CherryStudioColor from '@lobehub/icons/es/CherryStudio/components/Color'
import ClaudeColor from '@lobehub/icons/es/Claude/components/Color'
import DeepSeekColor from '@lobehub/icons/es/DeepSeek/components/Color'
import GeminiColor from '@lobehub/icons/es/Gemini/components/Color'
import OpenAIMono from '@lobehub/icons/es/OpenAI/components/Mono'
import { Link } from '@tanstack/react-router'
import {
  Activity,
  ArrowRight,
  Code2,
  Route,
  ShieldCheck,
  Terminal,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { useSystemConfig } from '@/hooks/use-system-config'
import { MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface HeroProps {
  isAuthenticated: boolean
  className?: string
}

interface ProviderRouteSpec {
  id: string
  name: string
  modelId: string
  protocol: string
  endpoint: string
  context: string
  latency: string
  href: '/claude-code' | '/gpt' | '/gemini' | '/pricing'
  icon: ReactNode
}

const PROVIDER_ROUTES: ProviderRouteSpec[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    modelId: 'claude-opus-5-5',
    protocol: 'ANTHROPIC · MESSAGES',
    endpoint: 'POST /v1/messages',
    context: '1M CTX',
    latency: '39ms',
    href: '/claude-code',
    icon: <ClaudeColor size={15} aria-hidden='true' />,
  },
  {
    id: 'openai',
    name: 'OpenAI GPT-6',
    modelId: 'gpt-6.1-sol',
    protocol: 'OPENAI · RESPONSES',
    endpoint: 'POST /v1/responses',
    context: '1.05M CTX',
    latency: '36ms',
    href: '/gpt',
    icon: <OpenAIMono size={15} aria-hidden='true' />,
  },
  {
    id: 'gemini',
    name: 'Gemini 4',
    modelId: 'gemini-4-carbon',
    protocol: 'GOOGLE · GENAI',
    endpoint: 'POST /v1beta/models',
    context: '1M+ CTX',
    latency: '29ms',
    href: '/gemini',
    icon: <GeminiColor size={15} aria-hidden='true' />,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek V4',
    modelId: 'deepseek-v4.1-flash',
    protocol: 'CHAT · COMPLETIONS',
    endpoint: 'POST /v1/chat/completions',
    context: '128K CTX',
    latency: '34ms',
    href: '/pricing',
    icon: <DeepSeekColor size={15} aria-hidden='true' />,
  },
]

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { systemName, logo } = useSystemConfig()
  const shouldReduceMotion = useReducedMotion()
  const [activeProviderIdx, setActiveProviderIdx] = useState(0)
  const [endpointMode, setEndpointMode] = useState<'openai' | 'claude'>(
    'openai'
  )
  const [paused, setPaused] = useState(false)

  const origin =
    typeof window !== 'undefined' && window.location.origin
      ? window.location.origin
      : 'https://tokara.top'

  const displayedEndpoint = endpointMode === 'openai' ? `${origin}/v1` : origin

  useEffect(() => {
    if (shouldReduceMotion || paused) return
    const timer = window.setInterval(() => {
      setActiveProviderIdx((prev) => (prev + 1) % PROVIDER_ROUTES.length)
    }, 3400)
    return () => window.clearInterval(timer)
  }, [paused, shouldReduceMotion])

  const activeRoute = PROVIDER_ROUTES[activeProviderIdx] ?? PROVIDER_ROUTES[0]

  return (
    <section
      className={cn(
        'tokara-hero relative overflow-hidden px-5 pt-26 pb-14 sm:px-6 md:pt-32 md:pb-20',
        props.className
      )}
    >
      <div
        className='tokara-hero-grid pointer-events-none absolute inset-0'
        aria-hidden='true'
      />

      <div className='site-container relative mx-auto'>
        <div className='grid items-center gap-10 lg:grid-cols-12 lg:gap-10 xl:gap-14'>
          {/* Left column: Flagship Ecosystem Quick-Jump, H1, Dual Endpoint Bar & Apps */}
          <div className='flex min-w-0 flex-col items-center text-center lg:col-span-6 lg:items-start lg:text-left'>
            {/* Flagship Ecosystem Pill Launcher (Direct crawlable SEO links above the fold) */}
            <div className='animate-appear flex flex-wrap items-center justify-center gap-1.5 lg:justify-start'>
              <Link
                to='/claude-code'
                className='border-border/80 bg-card/85 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-2xs backdrop-blur-md transition-all hover:border-amber-500/45'
              >
                <ClaudeColor size={14} aria-hidden='true' />
                <span>Claude Code · 5.5</span>
              </Link>
              <Link
                to='/gpt'
                className='border-border/80 bg-card/85 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-2xs backdrop-blur-md transition-all hover:border-emerald-500/45'
              >
                <OpenAIMono size={14} aria-hidden='true' />
                <span>GPT-6.2 &amp; Codex</span>
              </Link>
              <Link
                to='/gemini'
                className='border-border/80 bg-card/85 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-2xs backdrop-blur-md transition-all hover:border-sky-500/45'
              >
                <GeminiColor size={14} aria-hidden='true' />
                <span>Gemini 4 · 1M</span>
              </Link>
            </div>

            <p className='text-primary animate-appear animation-delay-100 mt-5 font-mono text-[11px] font-semibold tracking-[0.22em] uppercase'>
              // {t('Unified AI Gateway for Coding Agents & Apps')}
            </p>

            <h1 className='animate-appear animation-delay-100 mt-3 max-w-2xl text-[clamp(2.1rem,4.35vw,3.6rem)] leading-[1.1] font-bold tracking-[-0.032em] text-balance'>
              {t('One API key for Claude Code,')}
              <br />
              <span className='from-primary via-chart-2 to-chart-3 bg-linear-to-r bg-clip-text text-transparent'>
                {t('GPT-6.2, Gemini 4 & beyond.')}
              </span>
            </h1>

            <p className='text-muted-foreground animate-appear animation-delay-300 mt-4 max-w-xl text-sm leading-relaxed sm:text-base'>
              {t(
                'Native Anthropic /v1/messages, OpenAI /v1/responses, and Google /v1beta endpoints behind one balance — zero SDK rewrites, prompt caching ready, and billed transparently per token.'
              )}
            </p>

            {!props.isAuthenticated && (
              <div className='animate-appear animation-delay-300 mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start'>
                <Button
                  className='group h-11 rounded-xl px-6 text-sm font-semibold'
                  render={<Link to='/sign-up' />}
                >
                  {t('Get Started')}
                  <ArrowRight
                    className='size-4 transition-transform duration-200 group-hover:translate-x-0.5'
                    aria-hidden='true'
                  />
                </Button>
                <Button
                  variant='outline'
                  className='bg-card/65 h-11 rounded-xl px-6 text-sm font-medium backdrop-blur-sm'
                  render={<Link to='/pricing' />}
                >
                  {t('View Pricing')}
                </Button>
              </div>
            )}

            {/* Dual-Protocol Instant Copy Base Endpoint Bar */}
            <div className='animate-appear animation-delay-300 border-border/75 bg-card/80 mt-6 w-full max-w-lg rounded-2xl border p-2.5 shadow-2xs backdrop-blur-md'>
              <div className='mb-2 flex items-center justify-between gap-2 px-1'>
                <div className='bg-muted/70 inline-flex rounded-lg p-0.5 font-mono text-[10px]'>
                  <button
                    type='button'
                    onClick={() => setEndpointMode('openai')}
                    className={cn(
                      'cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors',
                      endpointMode === 'openai'
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    OpenAI / Codex (/v1)
                  </button>
                  <button
                    type='button'
                    onClick={() => setEndpointMode('claude')}
                    className={cn(
                      'cursor-pointer rounded-md px-2 py-0.5 font-medium transition-colors',
                      endpointMode === 'claude'
                        ? 'bg-card text-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    Claude Code ({t('Root')})
                  </button>
                </div>
                <span className='text-muted-foreground hidden font-mono text-[10px] sm:inline'>
                  {endpointMode === 'openai'
                    ? 'OPENAI_BASE_URL'
                    : 'ANTHROPIC_BASE_URL'}
                </span>
              </div>
              <div className='border-border/65 bg-background/75 flex items-center justify-between gap-2 rounded-xl border px-3 py-1.5'>
                <div className='flex min-w-0 items-center gap-2 font-mono text-xs'>
                  <Terminal
                    className='text-primary size-3.5 shrink-0'
                    aria-hidden='true'
                  />
                  <code className='text-foreground/95 truncate font-medium'>
                    {displayedEndpoint}
                  </code>
                </div>
                <CopyButton
                  value={displayedEndpoint}
                  tooltip={t('Copy')}
                  className='border-border/70 bg-muted/60 hover:bg-muted size-7 shrink-0 rounded-lg border'
                  iconClassName='size-3.5'
                />
              </div>
            </div>

            {/* Ecosystem Dock */}
            <div className='border-border/60 mt-6 flex w-full flex-wrap items-center justify-center gap-2.5 border-t pt-5 lg:justify-start'>
              <span className='text-muted-foreground mr-1 font-mono text-[10px] font-medium tracking-[0.16em] uppercase'>
                {t('Supported Applications')}
              </span>
              <a
                href='https://cherry-ai.com'
                target='_blank'
                rel='noopener noreferrer'
                className='border-border/75 bg-card/70 hover:border-primary/40 hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all'
              >
                <CherryStudioColor size={15} aria-hidden='true' /> Cherry Studio
              </a>
              <a
                href='https://ccswitch.io'
                target='_blank'
                rel='noopener noreferrer'
                className='border-border/75 bg-card/70 hover:border-primary/40 hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all'
              >
                <Code2 className='size-3.5' aria-hidden='true' /> CC Switch
              </a>
              <Link
                to='/claude-code'
                className='border-border/75 bg-card/70 hover:border-primary/40 hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all'
              >
                <Terminal className='size-3.5' aria-hidden='true' /> Claude Code
                CLI
              </Link>
              <Link
                to='/gpt'
                className='border-border/75 bg-card/70 hover:border-primary/40 hover:text-foreground inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all'
              >
                <Code2 className='size-3.5' aria-hidden='true' /> Codex CLI
              </Link>
            </div>
          </div>

          {/* Right column: Interactive Flagship Model & Protocol Switchboard */}
          <div
            className='animate-appear animation-delay-300 min-w-0 lg:col-span-6'
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
          >
            <div className='tech-corner-ticks rounded-2xl'>
              <div className='tokara-connection-stage overflow-hidden rounded-2xl border backdrop-blur-xl'>
                {/* Cockpit Top Telemetry Strip */}
                <div className='border-border/55 bg-muted/35 flex items-center justify-between gap-2 border-b px-4 py-2.5 sm:px-5'>
                  <div className='flex items-center gap-2'>
                    <div
                      className='flex items-center gap-1.5'
                      aria-hidden='true'
                    >
                      <span className='bg-border size-2 rounded-full' />
                      <span className='bg-border size-2 rounded-full' />
                      <span className='bg-border size-2 rounded-full' />
                    </div>
                    <span
                      className='text-muted-foreground hidden font-mono text-[10px] tracking-[0.16em] uppercase sm:inline'
                      aria-hidden='true'
                    >
                      GATEWAY.MESH // MULTI-PROTOCOL
                    </span>
                  </div>
                  <span
                    className='bg-success/15 text-success ring-success/25 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium ring-1 ring-inset'
                    aria-hidden='true'
                  >
                    <span className='bg-success size-1.5 animate-pulse rounded-full' />
                    200 OK · SSE LIVE
                  </span>
                </div>

                {/* Interactive Topology Stage */}
                <div
                  role='group'
                  aria-label={t('Unified API')}
                  className='tech-dot-matrix relative flex min-w-0 flex-col items-center justify-between gap-4 px-4 py-7 sm:px-5 md:flex-row md:gap-2 md:py-8'
                >
                  {/* Ingress Client Node */}
                  <div className='border-border/85 bg-card/92 flex w-full min-w-0 items-center justify-center gap-3 rounded-xl border px-3.5 py-3 shadow-xs md:w-auto md:flex-col md:px-3.5 md:py-4 md:text-center'>
                    <div className='bg-primary/12 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1'>
                      <Code2 className='size-4' aria-hidden='true' />
                    </div>
                    <div className='min-w-0 text-left md:text-center'>
                      <p className='truncate text-xs font-semibold'>
                        {t('Your application')}
                      </p>
                      <p className='text-muted-foreground mt-0.5 font-mono text-[10px]'>
                        CLI / SDK / IDE
                      </p>
                    </div>
                  </div>

                  <div className='tokara-routing-line' aria-hidden='true' />

                  {/* Central Gateway Core */}
                  <div className='relative flex shrink-0 items-center justify-center'>
                    <div
                      className='border-primary/20 pointer-events-none absolute -inset-2.5 rounded-[1.75rem] border border-dashed'
                      aria-hidden='true'
                    />
                    <div className='border-primary/35 bg-card relative flex size-30 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border shadow-[0_0_44px_-12px_color-mix(in_oklch,var(--primary)_42%,transparent)] sm:size-32'>
                      <div
                        className='auto-group-flow-border auto-group-flow-border-subtle pointer-events-none absolute inset-0 rounded-2xl'
                        aria-hidden='true'
                      />
                      <img
                        src={logo}
                        alt=''
                        className='h-8 w-11 object-contain'
                      />
                      <span className='max-w-32 truncate px-2 text-base font-semibold tracking-tight'>
                        {systemName}
                      </span>
                      <span className='bg-primary/12 text-primary rounded-full px-2 py-0.5 font-mono text-[9px] font-semibold tracking-wider uppercase'>
                        {t('Unified API')}
                      </span>
                    </div>
                  </div>

                  <div className='tokara-routing-line' aria-hidden='true' />

                  {/* Interactive Flagship Model Matrix */}
                  <div className='grid w-full min-w-0 grid-cols-2 gap-2 md:w-48 md:shrink-0 md:grid-cols-1'>
                    {PROVIDER_ROUTES.map((provider, idx) => {
                      const isActive = idx === activeProviderIdx
                      return (
                        <div
                          key={provider.id}
                          onPointerEnter={() => setActiveProviderIdx(idx)}
                          onClick={() => setActiveProviderIdx(idx)}
                          className={cn(
                            'relative flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-xs transition-all duration-200 select-none',
                            isActive
                              ? 'border-primary/50 bg-primary/10 text-foreground shadow-xs'
                              : 'border-border/75 bg-card/85 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                          )}
                        >
                          {isActive && !shouldReduceMotion && (
                            <motion.span
                              layoutId='hero-active-provider-ring'
                              transition={MOTION_TRANSITION.spring}
                              aria-hidden='true'
                              className='ring-primary/40 pointer-events-none absolute inset-0 rounded-xl ring-1'
                            />
                          )}
                          <span className='flex min-w-0 items-center gap-2'>
                            <span className='shrink-0'>{provider.icon}</span>
                            <span className='min-w-0 text-left'>
                              <span className='block truncate leading-tight font-semibold'>
                                {provider.name}
                              </span>
                              <span className='text-muted-foreground block truncate font-mono text-[10px]'>
                                {provider.modelId}
                              </span>
                            </span>
                          </span>
                          <span
                            className={cn(
                              'hidden shrink-0 font-mono text-[10px] tabular-nums sm:inline',
                              isActive
                                ? 'text-primary font-semibold'
                                : 'text-muted-foreground/60'
                            )}
                            aria-hidden='true'
                          >
                            {provider.latency}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Live Active Route Telemetry Readout + Direct Guide Jump */}
                <div className='border-border/60 bg-background/70 border-t px-4 py-2.5 sm:px-5'>
                  <AnimatePresence mode='wait' initial={false}>
                    <motion.div
                      key={activeRoute.id}
                      initial={
                        shouldReduceMotion ? false : { opacity: 0, y: 4 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={
                        shouldReduceMotion ? undefined : { opacity: 0, y: -4 }
                      }
                      transition={{ duration: 0.16 }}
                      className='flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]'
                    >
                      <span className='text-primary flex items-center gap-1.5 font-semibold'>
                        <Activity className='size-3.5 shrink-0' />
                        {activeRoute.protocol}
                      </span>
                      <code className='text-muted-foreground truncate'>
                        {activeRoute.endpoint}
                      </code>
                      <div className='flex items-center gap-2'>
                        <span className='bg-muted text-foreground/80 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums'>
                          {activeRoute.context}
                        </span>
                        <Link
                          to={activeRoute.href}
                          className='text-primary inline-flex items-center gap-0.5 text-[11px] font-semibold hover:underline'
                        >
                          {t('Guide')}
                          <ArrowRight className='size-3' aria-hidden='true' />
                        </Link>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Guarantees Footer */}
                <div className='border-border/55 bg-muted/25 text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-xs sm:px-5'>
                  <span className='flex items-center gap-1.5 font-medium'>
                    <ShieldCheck
                      className='text-primary size-3.5'
                      aria-hidden='true'
                    />
                    {t('Secure & Reliable')}
                  </span>
                  <span className='flex items-center gap-1.5 font-medium'>
                    <Route
                      className='text-primary size-3.5'
                      aria-hidden='true'
                    />
                    {t('Multi-protocol Compatible')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
