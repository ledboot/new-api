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
import { Compass } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import type { TopNavLink } from '../types'

type TopNavProps = React.HTMLAttributes<HTMLElement> & {
  links: TopNavLink[]
  mode?: 'all' | 'desktop' | 'mobile'
}

/**
 * 顶部导航栏组件
 * 在大屏幕显示水平导航，在小屏幕显示下拉菜单
 */
export function TopNav({
  className,
  links,
  mode = 'all',
  ...props
}: TopNavProps) {
  const { t } = useTranslation()
  // 规范化链接，确保所有可选属性都有默认值
  const normalizedLinks = useMemo(
    () =>
      links.map((link) => ({
        isActive: false,
        disabled: false,
        external: false,
        ...link,
      })),
    [links]
  )

  return (
    <>
      {/* 移动端下拉菜单 */}
      {mode !== 'desktop' && (
        <div className='lg:hidden'>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              render={
                <Button
                  size='icon'
                  variant='ghost'
                  className='size-8 rounded-lg'
                  aria-label={t('Toggle navigation menu')}
                />
              }
            >
              <Compass className='size-4' />
            </DropdownMenuTrigger>
            <DropdownMenuContent side='bottom' align='end' className='min-w-40'>
              {normalizedLinks.map(
                ({ title, href, isActive, disabled, external }) => (
                  <DropdownMenuItem
                    key={`${title}-${href}`}
                    render={
                      external ? (
                        <a
                          href={href}
                          target='_blank'
                          rel='noopener noreferrer'
                          className={cn(!isActive && 'text-muted-foreground')}
                        >
                          {t(title)}
                        </a>
                      ) : (
                        <Link
                          to={href}
                          className={cn(!isActive && 'text-muted-foreground')}
                          disabled={disabled}
                        >
                          {t(title)}
                        </Link>
                      )
                    }
                  />
                )
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* 桌面端水平导航 */}
      {mode !== 'mobile' && (
        <nav
          className={cn(
            'border-border/60 bg-background/60 hidden items-center gap-0.5 rounded-xl border p-0.5 shadow-2xs lg:flex',
            className
          )}
          {...props}
        >
          {normalizedLinks.map(
            ({ title, href, isActive, disabled, external }) =>
              external ? (
                <a
                  key={`${title}-${href}`}
                  href={href}
                  target='_blank'
                  rel='noopener noreferrer'
                  className={cn(
                    'hover:bg-card hover:text-foreground rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                    isActive
                      ? 'bg-card text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground'
                  )}
                >
                  {t(title)}
                </a>
              ) : (
                <Link
                  key={`${title}-${href}`}
                  to={href}
                  disabled={disabled}
                  className={cn(
                    'hover:bg-card hover:text-foreground rounded-lg px-2.5 py-1 text-xs font-medium transition-colors duration-150',
                    isActive
                      ? 'bg-card text-foreground font-semibold shadow-2xs'
                      : 'text-muted-foreground'
                  )}
                >
                  {t(title)}
                </Link>
              )
          )}
        </nav>
      )}
    </>
  )
}
