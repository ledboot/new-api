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
import { ConfigDrawer } from '@/components/config-drawer'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { useNotifications } from '@/hooks/use-notifications'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'

import { defaultTopNavLinks } from '../config/top-nav.config'
import type { TopNavLink } from '../types'
import { Header } from './header'
import { SystemBrand } from './system-brand'
import { TopNav } from './top-nav'

type AppHeaderProps = {
  navLinks?: TopNavLink[]
  showTopNav?: boolean
  leftContent?: React.ReactNode
  showSearch?: boolean
  rightContent?: React.ReactNode
  showNotifications?: boolean
  showConfigDrawer?: boolean
  showProfileDropdown?: boolean
}

export function AppHeader({
  navLinks = defaultTopNavLinks,
  showTopNav = true,
  leftContent,
  showSearch = true,
  rightContent,
  showNotifications = true,
  showConfigDrawer = true,
  showProfileDropdown = true,
}: AppHeaderProps) {
  const dynamicLinks = useTopNavLinks()
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks
  const notifications = useNotifications()

  return (
    <Header>
      <div className='@container/system-brand flex min-w-0 flex-1 items-center gap-2 lg:w-40 lg:flex-none'>
        <SystemBrand variant='inline' />
      </div>

      {leftContent ? (
        <div className='ms-1 flex items-center'>{leftContent}</div>
      ) : (
        showTopNav && (
          <div className='ms-2 hidden items-center lg:flex'>
            <TopNav links={links} mode='desktop' />
          </div>
        )
      )}

      {rightContent ?? (
        <div className='ms-auto flex shrink-0 items-center gap-1.5 sm:gap-2'>
          {showSearch && (
            <Search className='bg-background/75 w-8 flex-none sm:w-44 lg:w-56 xl:w-64 [&>span]:hidden sm:[&>span]:inline' />
          )}

          <div className='border-border/65 bg-background/65 flex items-center gap-0.5 rounded-xl border p-0.5 shadow-2xs'>
            {showTopNav && !leftContent && (
              <TopNav links={links} mode='mobile' />
            )}
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
            <LanguageSwitcher />
            {showConfigDrawer && <ConfigDrawer />}
          </div>

          {showProfileDropdown && <ProfileDropdown />}
        </div>
      )}
    </Header>
  )
}
