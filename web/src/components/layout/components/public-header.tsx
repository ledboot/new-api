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
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { ThemeSwitch } from '@/components/theme-switch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { DEFAULT_LOGO, DEFAULT_SYSTEM_NAME } from '@/lib/constants'
import { MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { HeaderLogo } from './header-logo'

const AUTH_PROMPT_SECONDS = 5

type AuthPromptTarget = {
  title: string
  href: string
}

export interface PublicHeaderProps {
  navLinks?: TopNavLink[]
  mobileLinks?: TopNavLink[]
  navContent?: React.ReactNode
  showThemeSwitch?: boolean
  showLanguageSwitcher?: boolean
  logo?: React.ReactNode
  siteName?: string
  homeUrl?: string
  leftContent?: React.ReactNode
  rightContent?: React.ReactNode
  showNavigation?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  className?: string
}

export function PublicHeader(props: PublicHeaderProps) {
  const {
    navLinks = defaultTopNavLinks,
    showThemeSwitch = true,
    showLanguageSwitcher = true,
    logo: customLogo,
    siteName: customSiteName,
    homeUrl = '/',
    showNavigation = true,
    showAuthButtons = true,
    showNotifications = true,
  } = props

  const { t } = useTranslation()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authPromptTarget, setAuthPromptTarget] =
    useState<AuthPromptTarget | null>(null)
  const [authPromptSecondsLeft, setAuthPromptSecondsLeft] =
    useState(AUTH_PROMPT_SECONDS)
  const { auth } = useAuthStore()
  const {
    systemName,
    logo: systemLogo,
    loading,
    logoLoaded,
  } = useSystemConfig()
  const dynamicLinks = useTopNavLinks()
  const notifications = useNotifications()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  const user = auth.user
  const isAuthenticated = !!user
  const displaySiteName = customSiteName || systemName
  const isTokaraBrand =
    !customLogo &&
    systemLogo === DEFAULT_LOGO &&
    displaySiteName === DEFAULT_SYSTEM_NAME
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  let logoContent: ReactNode = (
    <HeaderLogo
      src={isTokaraBrand ? '/tokara-logo.webp' : systemLogo}
      loading={loading}
      logoLoaded={logoLoaded}
      className={cn(
        'size-full object-contain',
        isTokaraBrand ? 'tokara-wordmark rounded-none' : 'rounded-lg'
      )}
    />
  )
  if (customLogo) logoContent = customLogo
  if (loading) logoContent = <Skeleton className='size-full rounded-lg' />

  let authContent = (
    <Button
      size='sm'
      className='h-8 rounded-xl px-3.5 text-xs font-semibold'
      render={<Link to='/sign-in' />}
    >
      {t('Sign in')}
    </Button>
  )
  if (isAuthenticated) authContent = <ProfileDropdown />
  if (loading) authContent = <Skeleton className='h-8 w-20 rounded-xl' />

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  useEffect(() => {
    if (!authPromptTarget) return

    const intervalId = window.setInterval(() => {
      setAuthPromptSecondsLeft((seconds) => Math.max(seconds - 1, 0))
    }, 1000)

    const timeoutId = window.setTimeout(() => {
      const redirect = authPromptTarget.href
      setAuthPromptTarget(null)
      navigate({ to: '/sign-in', search: { redirect } })
    }, AUTH_PROMPT_SECONDS * 1000)

    return () => {
      window.clearInterval(intervalId)
      window.clearTimeout(timeoutId)
    }
  }, [authPromptTarget, navigate])

  const closeAuthPrompt = useCallback(() => {
    setAuthPromptTarget(null)
    setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
  }, [])

  const navigateToSignIn = useCallback(() => {
    const redirect = authPromptTarget?.href || '/'
    setAuthPromptTarget(null)
    navigate({ to: '/sign-in', search: { redirect } })
  }, [authPromptTarget?.href, navigate])

  const handleNavLinkClick = useCallback(
    (
      event: React.MouseEvent<HTMLAnchorElement>,
      link: TopNavLink,
      closeMobile = false
    ) => {
      if (link.disabled) {
        event.preventDefault()
        return
      }

      if (link.requiresAuth) {
        event.preventDefault()
        if (closeMobile) {
          setMobileOpen(false)
        }
        setAuthPromptSecondsLeft(AUTH_PROMPT_SECONDS)
        setAuthPromptTarget({
          title: t(link.title),
          href: link.href,
        })
        return
      }

      if (closeMobile) {
        setMobileOpen(false)
      }
    },
    [t]
  )

  return (
    <>
      <header
        className={cn(
          'pointer-events-none fixed inset-x-0 top-0 z-50 px-3 pt-2.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] sm:px-5 sm:pt-3',
          props.className
        )}
      >
        <div
          className={cn(
            'tokara-public-island pointer-events-auto mx-auto transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]',
            scrolled
              ? 'max-w-6xl rounded-2xl px-3 sm:px-4'
              : 'site-container rounded-2xl px-3.5 sm:px-5'
          )}
        >
          <nav
            className={cn(
              'flex items-center justify-between gap-2 transition-[height] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
              scrolled ? 'h-12 sm:h-13' : 'h-13 sm:h-14'
            )}
          >
            {/* Left zone: Brand */}
            <div className='@container/system-brand flex min-w-0 flex-1 items-center gap-2 lg:w-44 lg:flex-none'>
              <Link
                to={homeUrl}
                className='group flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-90'
              >
                <div
                  className={cn(
                    'flex h-7 shrink-0 items-center justify-center',
                    isTokaraBrand ? 'w-28 sm:w-30' : 'w-7'
                  )}
                >
                  {logoContent}
                </div>
                <span
                  className={cn(
                    'max-w-48 truncate text-sm font-semibold tracking-tight',
                    isTokaraBrand && 'sr-only'
                  )}
                  title={displaySiteName}
                >
                  {loading ? (
                    <Skeleton className='h-4 w-16' />
                  ) : (
                    displaySiteName
                  )}
                </span>
              </Link>
              {props.leftContent}
            </div>

            {/* Center zone: Segmented sliding-pill navigation track */}
            {showNavigation &&
              (props.navContent ?? (
                <div className='border-border/60 bg-muted/50 hidden min-w-0 items-center gap-0.5 rounded-xl border p-1 lg:flex'>
                  {links.map((link) => {
                    const isActive = pathname === link.href
                    if (link.external) {
                      return (
                        <a
                          key={`${link.title}:${link.href}`}
                          href={link.href}
                          title={t(link.title)}
                          target='_blank'
                          rel='noopener noreferrer'
                          aria-disabled={link.disabled}
                          tabIndex={link.disabled ? -1 : undefined}
                          onClick={(event) => handleNavLinkClick(event, link)}
                          className={cn(
                            'text-muted-foreground hover:text-foreground inline-flex min-w-0 items-center gap-1 truncate rounded-lg px-3 py-1 text-xs font-medium transition-colors duration-150',
                            link.disabled && 'pointer-events-none opacity-50'
                          )}
                        >
                          <span className='truncate'>{t(link.title)}</span>
                          <ArrowUpRight
                            className='size-3 opacity-60'
                            aria-hidden='true'
                          />
                        </a>
                      )
                    }
                    return (
                      <Link
                        key={`${link.title}:${link.href}`}
                        to={link.href}
                        title={t(link.title)}
                        disabled={link.disabled}
                        onClick={(event) => handleNavLinkClick(event, link)}
                        className={cn(
                          'relative min-w-0 truncate rounded-lg px-3 py-1 text-xs font-medium transition-colors duration-150',
                          isActive
                            ? 'text-foreground font-semibold'
                            : 'text-muted-foreground hover:text-foreground',
                          link.disabled && 'pointer-events-none opacity-50'
                        )}
                      >
                        {isActive && (
                          <motion.span
                            layoutId={
                              shouldReduceMotion
                                ? undefined
                                : 'public-nav-active-pill'
                            }
                            transition={MOTION_TRANSITION.spring}
                            aria-hidden='true'
                            className='bg-card ring-border/80 absolute inset-0 rounded-lg shadow-2xs ring-1 dark:ring-white/12'
                          />
                        )}
                        <span className='relative z-10 flex items-center gap-1.5'>
                          {isActive && (
                            <span
                              aria-hidden='true'
                              className='bg-primary size-1.5 rounded-full shadow-[0_0_6px_var(--primary)]'
                            />
                          )}
                          {t(link.title)}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              ))}

            {/* Right zone: Desktop utilities & auth */}
            {props.rightContent ? (
              <div className='flex shrink-0 items-center gap-1.5'>
                {props.rightContent}
              </div>
            ) : (
              <>
                <div className='hidden shrink-0 items-center gap-1 lg:flex lg:min-w-40 lg:justify-end'>
                  {showLanguageSwitcher && <LanguageSwitcher />}
                  {showThemeSwitch && <ThemeSwitch />}
                  {showNotifications && (
                    <NotificationPopover
                      open={notifications.popoverOpen}
                      onOpenChange={notifications.setPopoverOpen}
                      unreadCount={notifications.unreadCount}
                      activeTab={notifications.activeTab}
                      onTabChange={notifications.setActiveTab}
                      notice={notifications.notice}
                      announcements={notifications.announcements}
                      loading={notifications.loading}
                    />
                  )}
                  {showAuthButtons && (
                    <>
                      <div className='bg-border/60 mx-1 h-4 w-px' />
                      {authContent}
                    </>
                  )}
                </div>

                {/* Mobile: compact actions + animated hamburger */}
                <div className='flex shrink-0 items-center gap-0.5 sm:gap-1 lg:hidden'>
                  {showNotifications && (
                    <NotificationPopover
                      open={notifications.popoverOpen}
                      onOpenChange={notifications.setPopoverOpen}
                      unreadCount={notifications.unreadCount}
                      activeTab={notifications.activeTab}
                      onTabChange={notifications.setActiveTab}
                      notice={notifications.notice}
                      announcements={notifications.announcements}
                      loading={notifications.loading}
                    />
                  )}
                  {showLanguageSwitcher && <LanguageSwitcher />}
                  {showThemeSwitch && <ThemeSwitch />}
                  {showAuthButtons && !loading && isAuthenticated && (
                    <ProfileDropdown />
                  )}
                  {showNavigation && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='size-8 rounded-lg'
                      onClick={() => setMobileOpen((v) => !v)}
                      aria-expanded={mobileOpen}
                      aria-label={t('Toggle navigation menu')}
                    >
                      <div className='relative size-4'>
                        <span
                          className={cn(
                            'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                            mobileOpen ? 'top-[7px] rotate-45' : 'top-[3px]'
                          )}
                        />
                        <span
                          className={cn(
                            'absolute inset-x-0 top-[7px] block h-[1.5px] rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                            mobileOpen ? 'scale-x-0 opacity-0' : 'opacity-100'
                          )}
                        />
                        <span
                          className={cn(
                            'absolute inset-x-0 block h-[1.5px] origin-center rounded-full bg-current transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                            mobileOpen ? 'top-[7px] -rotate-45' : 'top-[11px]'
                          )}
                        />
                      </div>
                    </Button>
                  )}
                </div>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Mobile floating glass command overlay */}
      <div
        className={cn(
          'bg-background/95 fixed inset-0 z-40 backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] lg:pointer-events-none lg:hidden',
          mobileOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        )}
      >
        <div className='tech-grid-bg pointer-events-none absolute inset-0 opacity-55' />
        <div className='relative flex h-full flex-col justify-between overflow-y-auto px-4 pt-20 pb-[max(1.75rem,env(safe-area-inset-bottom))]'>
          <nav className='flex flex-col gap-2'>
            {links.map((link, i) => {
              const isActive = pathname === link.href
              const indexTag = String(i + 1).padStart(2, '0')
              const linkClassName = cn(
                'flex min-h-12 items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium tracking-tight transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
                mobileOpen
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-3 opacity-0',
                isActive
                  ? 'border-primary/40 bg-primary/10 text-foreground shadow-xs'
                  : 'border-border/65 bg-card/75 text-foreground/85 hover:border-primary/30 hover:bg-card',
                link.disabled && 'pointer-events-none opacity-50'
              )
              const transitionStyle = {
                transitionDelay: mobileOpen ? `${50 + i * 35}ms` : '0ms',
              }
              if (link.external) {
                return (
                  <a
                    key={`${link.title}:${link.href}`}
                    href={link.href}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-disabled={link.disabled}
                    tabIndex={link.disabled ? -1 : undefined}
                    onClick={(event) => handleNavLinkClick(event, link, true)}
                    className={linkClassName}
                    style={transitionStyle}
                  >
                    <span className='flex items-center gap-3'>
                      <span className='text-muted-foreground font-mono text-[11px] tabular-nums'>
                        {indexTag}
                      </span>
                      <span>{t(link.title)}</span>
                    </span>
                    <ArrowUpRight
                      aria-hidden='true'
                      className='text-muted-foreground size-4'
                    />
                  </a>
                )
              }
              return (
                <Link
                  key={`${link.title}:${link.href}`}
                  to={link.href}
                  disabled={link.disabled}
                  onClick={(event) => handleNavLinkClick(event, link, true)}
                  className={linkClassName}
                  style={transitionStyle}
                >
                  <span className='flex items-center gap-3'>
                    <span
                      className={cn(
                        'font-mono text-[11px] tabular-nums',
                        isActive ? 'text-primary' : 'text-muted-foreground'
                      )}
                    >
                      {indexTag}
                    </span>
                    <span>{t(link.title)}</span>
                  </span>
                  {isActive && (
                    <span
                      aria-hidden='true'
                      className='bg-primary size-2 rounded-full shadow-[0_0_8px_var(--primary)]'
                    />
                  )}
                </Link>
              )
            })}

            {/* Mobile Model Ecosystem Quick-Jump Strip */}
            <div className='mt-3 pt-2'>
              <p className='text-muted-foreground mb-2 px-1 font-mono text-[10px] font-semibold tracking-[0.18em] uppercase'>
                {t('Model Ecosystem')}
              </p>
              <div className='grid grid-cols-3 gap-2'>
                {(
                  [
                    { label: 'Claude Code', href: '/claude-code' },
                    { label: 'GPT-6.2 & Codex', href: '/gpt' },
                    { label: 'Gemini 4', href: '/gemini' },
                  ] as const
                ).map((item) => {
                  const active = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center justify-center rounded-xl border px-2.5 py-2.5 text-center text-xs font-medium transition-colors',
                        active
                          ? 'border-primary/45 bg-primary/12 text-primary font-semibold'
                          : 'border-border/65 bg-card/75 text-foreground/85 hover:border-primary/30'
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          </nav>

          <div
            className={cn(
              'mt-6 flex flex-col gap-3 transition-all duration-300',
              mobileOpen
                ? 'translate-y-0 opacity-100'
                : 'translate-y-3 opacity-0'
            )}
            style={{ transitionDelay: mobileOpen ? '180ms' : '0ms' }}
          >
            {showAuthButtons && (
              <Button
                size='lg'
                className='h-11 w-full rounded-xl text-sm font-semibold'
                render={
                  <Link
                    to={isAuthenticated ? '/dashboard' : '/sign-in'}
                    onClick={() => setMobileOpen(false)}
                  />
                }
              >
                {isAuthenticated ? t('Go to Dashboard') : t('Sign in')}
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog
        open={!!authPromptTarget}
        onOpenChange={(open) => {
          if (!open) {
            closeAuthPrompt()
          }
        }}
        title={t('Sign in required')}
        description={t('Please sign in to view {{module}}.', {
          module: authPromptTarget?.title || '',
        })}
        contentClassName='sm:max-w-md'
        contentHeight='auto'
        footer={
          <>
            <Button variant='outline' onClick={closeAuthPrompt}>
              {t('Cancel')}
            </Button>
            <Button onClick={navigateToSignIn}>{t('Sign in now')}</Button>
          </>
        }
      >
        <div className='bg-muted/40 text-muted-foreground rounded-lg px-3 py-2 text-sm'>
          {t('Redirecting to sign in in {{seconds}} seconds.', {
            seconds: authPromptSecondsLeft,
          })}
        </div>
      </Dialog>
    </>
  )
}
