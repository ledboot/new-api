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
import { Activity, Code2, Route, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { PageTransition } from '@/components/page-transition'
import { ThemeSwitch } from '@/components/theme-switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div className='bg-background relative grid min-h-svh w-full overflow-x-hidden lg:grid-cols-12'>
      {/* Top bar spanning across both columns (single accessible brand + theme/lang controls) */}
      <header className='pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-4 sm:px-8 sm:py-6'>
        <Link
          to='/'
          className='pointer-events-auto flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-85 lg:text-white'
        >
          <div className='relative size-8 shrink-0'>
            {loading ? (
              <Skeleton className='absolute inset-0 rounded-lg' />
            ) : (
              <img
                src={logo}
                alt={t('Logo')}
                className='size-8 rounded-lg object-contain'
              />
            )}
          </div>
          {loading ? (
            <Skeleton className='h-5 w-24' />
          ) : (
            <h1 className='truncate text-base font-semibold tracking-tight sm:text-lg'>
              {systemName}
            </h1>
          )}
        </Link>

        <div className='border-border/70 bg-card/80 pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-xl border p-0.5 shadow-2xs backdrop-blur-md'>
          <LanguageSwitcher />
          <ThemeSwitch />
        </div>
      </header>

      {/* Left Column (Desktop): Architectural AI Gateway Telemetry Showcase */}
      <div
        aria-hidden='true'
        className='relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.08] bg-[#070b14] p-10 pt-24 text-slate-100 lg:col-span-6 lg:flex xl:col-span-7 xl:p-14 xl:pt-28'
      >
        <div
          className='pointer-events-none absolute inset-0 opacity-90'
          style={{
            background:
              'radial-gradient(ellipse 70% 55% at 20% 15%, rgba(59,130,246,0.22), transparent 70%), radial-gradient(ellipse 55% 48% at 85% 75%, rgba(6,182,212,0.16), transparent 70%)',
          }}
        />
        <div
          className='pointer-events-none absolute inset-0 opacity-30'
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className='relative z-10 max-w-xl space-y-5'>
          <div className='inline-flex items-center gap-2 rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1 font-mono text-[11px] font-medium tracking-wider text-sky-300 uppercase'>
            <span className='size-1.5 animate-pulse rounded-full bg-emerald-400' />
            SYS.GATEWAY // MULTI-MODEL MESH
          </div>
          <div className='text-3xl leading-[1.15] font-bold tracking-[-0.03em] text-white xl:text-4xl'>
            {t('Connect global models,')}
            <br />
            <span className='bg-linear-to-r from-sky-400 via-cyan-300 to-indigo-300 bg-clip-text text-transparent'>
              {t('unlock your creativity.')}
            </span>
          </div>
          <p className='max-w-md text-sm leading-relaxed text-slate-400'>
            {t(
              'Access leading AI models through one API. Build with familiar tools and explore more possibilities.'
            )}
          </p>
        </div>

        {/* Architectural Topology Card */}
        <div className='relative z-10 my-8 max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl backdrop-blur-xl'>
          <div className='mb-4 flex items-center justify-between border-b border-white/[0.07] pb-3 font-mono text-[10px] tracking-widest text-slate-400 uppercase'>
            <span className='flex items-center gap-1.5 text-sky-300'>
              <Activity className='size-3.5' />
              ACTIVE PROTOCOL TOPOLOGY
            </span>
            <span className='text-emerald-400'>200 OK · STREAM</span>
          </div>
          <div className='flex items-center justify-between gap-3'>
            <div className='flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5'>
              <Code2 className='size-4 text-sky-400' />
              <div>
                <div className='text-xs font-semibold text-white'>
                  SDK / CLI
                </div>
                <div className='font-mono text-[10px] text-slate-400'>
                  /v1/responses
                </div>
              </div>
            </div>
            <div className='tokara-routing-line' />
            <div className='rounded-xl border border-sky-400/35 bg-sky-500/12 px-4 py-2.5 text-center shadow-[0_0_24px_-6px_rgba(56,189,248,0.4)]'>
              <div className='font-mono text-[10px] font-semibold tracking-wider text-sky-300 uppercase'>
                {t('Unified API')}
              </div>
              <div className='mt-0.5 text-xs font-bold text-white'>
                Router Core
              </div>
            </div>
            <div className='tokara-routing-line' />
            <div className='grid gap-1.5 font-mono text-[11px]'>
              {['OpenAI', 'Anthropic', 'Gemini'].map((p) => (
                <div
                  key={p}
                  className='flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-slate-200'
                >
                  <span className='size-1.5 rounded-full bg-emerald-400' />
                  {p}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className='relative z-10 flex flex-wrap items-center gap-6 font-mono text-xs text-slate-400'>
          <span className='flex items-center gap-2'>
            <ShieldCheck className='size-4 text-sky-400' />
            {t('Secure & Reliable')}
          </span>
          <span className='flex items-center gap-2'>
            <Route className='size-4 text-cyan-400' />
            {t('Multi-protocol Compatible')}
          </span>
        </div>
      </div>

      {/* Right Column: Clean Minimalist Auth Form Chamber */}
      <div className='relative flex min-h-svh flex-col items-center justify-center px-4 pt-20 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-8 lg:col-span-6 lg:pt-16 xl:col-span-5'>
        <div
          aria-hidden='true'
          className='tech-aurora-top pointer-events-none absolute inset-x-0 top-0 h-[360px] lg:opacity-50'
        />
        <div
          aria-hidden='true'
          className='tech-grid-bg pointer-events-none absolute inset-0 lg:opacity-40'
        />

        <PageTransition className='border-border/80 bg-card/90 relative z-10 flex w-full max-w-[440px] flex-col justify-center rounded-2xl border p-6 shadow-lg backdrop-blur-xl sm:p-8 dark:border-white/[0.08]'>
          {children}
        </PageTransition>
      </div>
    </div>
  )
}
