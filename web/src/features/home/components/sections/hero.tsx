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
import { useEffect, useState } from 'react'
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
  name: string
  protocol: string
  endpoint: string
  latency: string
}

const PROVIDER_ROUTES: ProviderRouteSpec[] = [
  {
    name: 'OpenAI',
    protocol: 'OPENAI · RESPONSES',
    endpoint: 'POST /v1/responses',
    latency: '38ms',
  },
  {
    name: 'Anthropic',
    protocol: 'ANTHROPIC · MESSAGES',
    endpoint: 'POST /v1/messages',
    latency: '42ms',
  },
  {
    name: 'Google Gemini',
    protocol: 'GOOGLE · GENERATE',
    endpoint: 'POST /v1beta/models',
    latency: '31ms',
  },
  {
    name: 'DeepSeek',
    protocol: 'CHAT · COMPLETIONS',
    endpoint: 'POST /v1/chat/completions',
    latency: '35ms',
  },
]

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { systemName, logo } = useSystemConfig()
  const shouldReduceMotion = useReducedMotion()
  const [activeProviderIdx, setActiveProviderIdx] = useState(0)
  const [paused, setPaused] = useState(false)

  const baseEndpoint =
    typeof window !== 'undefined' && window.location.origin
      ? `${window.location.origin}/v1`
      : 'https://api.example.com/v1'

  useEffect(() => {
    if (shouldReduceMotion || paused) return
    const timer = window.setInterval(() => {
      setActiveProviderIdx((prev) => (prev + 1) % PROVIDER_ROUTES.length)
    }, 3200)
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
          {/* Left column: Editorial tech typography, CTAs, instant endpoint copy & ecosystem */}
          <div className='flex min-w-0 flex-col items-center text-center lg:col-span-6 lg:items-start lg:text-left'>
            <Link
              to='/pricing'
              className='border-border/80 bg-card/85 text-muted-foreground hover:border-primary/45 hover:text-foreground group animate-appear inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-2xs backdrop-blur-md transition-all duration-200 sm:gap-2.5 sm:px-3.5'
            >
              <span className='bg-primary/12 text-primary inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 font-medium'>
                <span
                  className='bg-primary size-1.5 rounded-full shadow-[0_0_6px_var(--primary)]'
                  aria-hidden='true'
                />
                {t('Built for creators')}
              </span>
              <span className='min-w-0 truncate'>
                {t('One API. Endless possibilities.')}
              </span>
              <ArrowRight
                className='size-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5'
                aria-hidden='true'
              />
            </Link>

            <p className='text-primary animate-appear animation-delay-100 mt-6 font-mono text-[11px] font-semibold tracking-[0.22em] uppercase'>
              // {t('The API for your next big idea')}
            </p>

            <h1 className='animate-appear animation-delay-100 mt-3 max-w-2xl text-[clamp(2.1rem,4.4vw,3.65rem)] leading-[1.1] font-bold tracking-[-0.032em] text-balance'>
              {t('Connect global models,')}
              <br />
              <span className='from-primary via-chart-2 to-chart-3 bg-linear-to-r bg-clip-text text-transparent'>
                {t('unlock your creativity.')}
              </span>
            </h1>

            <p className='text-muted-foreground animate-appear animation-delay-300 mt-4 max-w-xl text-sm leading-relaxed sm:text-base'>
              {t(
                'Access leading AI models through one API. Build with familiar tools and explore more possibilities.'
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

            {/* Instant Copy Base Endpoint Bar */}
            <div className='animate-appear animation-delay-300 border-border/75 bg-card/75 mt-6 flex w-full max-w-md items-center justify-between gap-2 rounded-xl border px-3 py-2 shadow-2xs backdrop-blur-md'>
              <div className='flex min-w-0 items-center gap-2 font-mono text-xs'>
                <Terminal
                  className='text-primary size-3.5 shrink-0'
                  aria-hidden='true'
                />
                <span className='text-muted-foreground shrink-0 text-[10px] tracking-wider uppercase'>
                  BASE
                </span>
                <code className='text-foreground/90 truncate'>
                  {baseEndpoint}
                </code>
              </div>
              <CopyButton
                value={baseEndpoint}
                tooltip={t('Copy')}
                className='border-border/70 bg-muted/60 hover:bg-muted size-7 shrink-0 rounded-lg border'
                iconClassName='size-3.5'
              />
            </div>

            {/* Ecosystem Dock */}
            <div className='border-border/60 mt-7 flex w-full flex-wrap items-center justify-center gap-2.5 border-t pt-5 lg:justify-start'>
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
              <span className='border-border/55 bg-muted/45 text-muted-foreground inline-flex items-center rounded-lg border px-2.5 py-1 font-mono text-[11px]'>
                {t('More Apps')} +
              </span>
            </div>
          </div>

          {/* Right column: Interactive Live Routing Telemetry Cockpit */}
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
                      SYS.ROUTER // MESH
                    </span>
                  </div>
                  <span
                    className='bg-success/15 text-success ring-success/25 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-medium ring-1 ring-inset'
                    aria-hidden='true'
                  >
                    <span className='bg-success size-1.5 animate-pulse rounded-full' />
                    200 OK · LIVE
                  </span>
                </div>

                {/* Interactive Topology Stage */}
                <div
                  role='group'
                  aria-label={t('Unified API')}
                  className='tech-dot-matrix relative flex min-w-0 flex-col items-center justify-between gap-4 px-4 py-7 sm:px-6 md:flex-row md:gap-2 md:py-9'
                >
                  {/* Ingress Client Node */}
                  <div className='border-border/85 bg-card/92 flex w-full min-w-0 items-center justify-center gap-3 rounded-xl border px-3.5 py-3 shadow-xs md:w-auto md:flex-col md:px-4 md:py-4 md:text-center'>
                    <div className='bg-primary/12 text-primary ring-primary/20 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1'>
                      <Code2 className='size-4' aria-hidden='true' />
                    </div>
                    <div className='min-w-0 text-left md:text-center'>
                      <p className='truncate text-xs font-semibold'>
                        {t('Your application')}
                      </p>
                      <p className='text-muted-foreground mt-0.5 font-mono text-[10px]'>
                        SDK / CLI / API
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
                    <div className='border-primary/35 bg-card relative flex size-32 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border shadow-[0_0_44px_-12px_color-mix(in_oklch,var(--primary)_42%,transparent)] sm:size-34'>
                      <div
                        className='auto-group-flow-border auto-group-flow-border-subtle pointer-events-none absolute inset-0 rounded-2xl'
                        aria-hidden='true'
                      />
                      <img
                        src={logo}
                        alt=''
                        className='h-9 w-12 object-contain'
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

                  {/* Interactive Provider Selector Matrix */}
                  <div className='grid w-full min-w-0 grid-cols-2 gap-2 md:w-44 md:shrink-0 md:grid-cols-1'>
                    {PROVIDER_ROUTES.map((provider, idx) => {
                      const isActive = idx === activeProviderIdx
                      return (
                        <div
                          key={provider.name}
                          onPointerEnter={() => setActiveProviderIdx(idx)}
                          onClick={() => setActiveProviderIdx(idx)}
                          className={cn(
                            'relative flex min-w-0 cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 select-none',
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
                            <span
                              className={cn(
                                'size-1.5 shrink-0 rounded-full transition-all',
                                isActive
                                  ? 'bg-primary shadow-[0_0_8px_var(--primary)]'
                                  : 'bg-success/75'
                              )}
                              aria-hidden='true'
                            />
                            <span className='truncate'>{provider.name}</span>
                          </span>
                          <span
                            className={cn(
                              ' hidden font-mono text-[10px] tabular-nums sm:inline',
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

                {/* Live Active Route Telemetry Readout */}
                <div className='border-border/60 bg-background/65 border-t px-4 py-2.5 sm:px-5'>
                  <AnimatePresence mode='wait' initial={false}>
                    <motion.div
                      key={activeRoute.name}
                      initial={
                        shouldReduceMotion ? false : { opacity: 0, y: 4 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={
                        shouldReduceMotion ? undefined : { opacity: 0, y: -4 }
                      }
                      transition={{ duration: 0.16 }}
                      aria-hidden='true'
                      className='flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]'
                    >
                      <span className='text-primary flex items-center gap-1.5 font-semibold'>
                        <Activity className='size-3.5 shrink-0' />
                        {activeRoute.protocol}
                      </span>
                      <code className='text-muted-foreground truncate'>
                        {activeRoute.endpoint}
                      </code>
                      <span className='bg-muted text-foreground/80 rounded-md px-1.5 py-0.5 text-[10px] tabular-nums'>
                        TTFT {activeRoute.latency}
                      </span>
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
