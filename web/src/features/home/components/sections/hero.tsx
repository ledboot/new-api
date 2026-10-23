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
import { ArrowRight, BookOpen, Code2, Route, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

const PROVIDERS = ['OpenAI', 'Anthropic', 'Google Gemini', 'DeepSeek']

export function Hero(props: HeroProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { logo, systemName } = useSystemConfig()
  const docsUrl =
    (status?.docs_link as string | undefined) || 'https://docs.newapi.pro'
  const isExternalDocs = docsUrl.startsWith('http')

  return (
    <section
      className={cn(
        'tokara-hero relative overflow-hidden px-5 pt-32 pb-12 md:pt-36',
        props.className
      )}
    >
      <div
        className='tokara-hero-grid pointer-events-none absolute inset-0'
        aria-hidden='true'
      />
      <div className='relative mx-auto max-w-6xl text-center'>
        <Link
          to='/pricing'
          className='border-border bg-background text-muted-foreground inline-flex max-w-full flex-wrap items-center justify-center gap-3 rounded-full border px-4 py-2 text-xs'
        >
          <span className='bg-secondary text-secondary-foreground rounded-full px-2 py-0.5'>
            {t('Built for creators')}
          </span>
          {t('One API. Endless possibilities.')}
          <ArrowRight className='size-3.5' aria-hidden='true' />
        </Link>
        <p className='text-primary mt-8 text-[10px] font-medium tracking-[0.2em] uppercase'>
          {t('The API for your next big idea')}
        </p>
        <h1 className='mt-4 text-[clamp(2rem,4.2vw,3.25rem)] leading-[1.4] font-bold tracking-tight'>
          {t('Connect global models,')}
          <br />
          <span className='text-primary'>{t('unlock your creativity.')}</span>
        </h1>
        <p className='text-muted-foreground mx-auto mt-5 max-w-xl text-sm leading-loose'>
          {t(
            'Access leading AI models through one API. Build with familiar tools and explore more possibilities.'
          )}
        </p>
        <div className='mt-7 flex flex-wrap items-center justify-center gap-3'>
          <Button
            className='h-12 px-6'
            render={
              <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
            }
          >
            {props.isAuthenticated ? t('Go to Dashboard') : t('Get Started')}
            <ArrowRight className='size-4' aria-hidden='true' />
          </Button>
          {!props.isAuthenticated && (
            <Button
              variant='outline'
              className='h-12 px-6'
              render={<Link to='/pricing' />}
            >
              {t('View Pricing')}
            </Button>
          )}
          <Button
            variant='outline'
            className='h-12 px-6'
            render={
              isExternalDocs ? (
                <a href={docsUrl} target='_blank' rel='noopener noreferrer' />
              ) : (
                <Link to={docsUrl} />
              )
            }
          >
            <BookOpen className='size-4' aria-hidden='true' />
            {t('Docs')}
          </Button>
        </div>

        <div className='tokara-connection-stage mx-auto mt-12 max-w-5xl overflow-hidden rounded-xl border'>
          <p className='text-primary px-4 pt-6 text-[10px] tracking-[0.16em] uppercase'>
            {t('One API. Endless possibilities.')}
          </p>
          <div
            role='group'
            aria-label={t('Unified API')}
            className='flex min-w-0 flex-col items-center justify-center gap-5 px-5 py-8 md:flex-row md:gap-0 md:px-12 md:py-10'
          >
            <div className='bg-card flex w-full min-w-0 items-center justify-center gap-3 rounded-lg border px-5 py-4 md:w-auto'>
              <Code2
                className='text-primary size-8 shrink-0'
                aria-hidden='true'
              />
              <div className='min-w-0 text-left'>
                <p className='text-sm font-medium'>{t('Your application')}</p>
                <p className='text-muted-foreground mt-1 text-xs'>
                  SDK / CLI / API
                </p>
              </div>
            </div>
            <div className='tokara-routing-line' aria-hidden='true' />
            <div className='bg-card ring-secondary flex size-36 shrink-0 flex-col items-center justify-center gap-2 rounded-3xl border ring-8'>
              <img src={logo} alt='' className='h-12 w-16 object-contain' />
              <span className='max-w-32 truncate px-2 text-xl font-semibold tracking-tight'>
                {systemName}
              </span>
              <span className='text-muted-foreground text-[10px]'>
                {t('Unified API')}
              </span>
            </div>
            <div className='tokara-routing-line' aria-hidden='true' />
            <div className='grid w-full min-w-0 grid-cols-2 gap-2 md:w-44 md:shrink-0 md:grid-cols-1'>
              {PROVIDERS.map((name) => (
                <div
                  key={name}
                  className='bg-card text-foreground flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-xs'
                >
                  <span
                    className='bg-primary size-1.5 shrink-0 rounded-full'
                    aria-hidden='true'
                  />
                  <span className='truncate'>{name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className='text-muted-foreground flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs'>
            <span className='flex items-center gap-1.5'>
              <ShieldCheck
                className='text-primary size-3.5'
                aria-hidden='true'
              />
              {t('Secure & Reliable')}
            </span>
            <span className='flex items-center gap-1.5'>
              <Route className='text-primary size-3.5' aria-hidden='true' />
              {t('Multi-protocol Compatible')}
            </span>
          </div>
        </div>

        <div className='mt-10 border-b pb-9'>
          <p className='text-muted-foreground text-xs'>
            {t('Supported Applications')}
          </p>
          <div className='text-muted-foreground mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm'>
            <a
              href='https://cherry-ai.com'
              target='_blank'
              rel='noopener noreferrer'
              className='hover:text-primary inline-flex items-center gap-2 transition-colors'
            >
              <CherryStudioColor size={22} aria-hidden='true' /> Cherry Studio
            </a>
            <a
              href='https://ccswitch.io'
              target='_blank'
              rel='noopener noreferrer'
              className='hover:text-primary inline-flex items-center gap-2 transition-colors'
            >
              <Code2 className='size-5' aria-hidden='true' /> CC Switch
            </a>
            <span>{t('More Apps')} +</span>
          </div>
        </div>
      </div>
    </section>
  )
}
