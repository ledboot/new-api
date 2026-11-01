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
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

import { listChannelStatus, type ChannelStatusView } from './api'

const SLOT_COLORS: Record<string, string> = {
  g: 'bg-emerald-500',
  d: 'bg-amber-500',
  u: 'bg-red-500',
}

function ChannelStatusCard(props: { item: ChannelStatusView }) {
  const { t } = useTranslation()
  const item = props.item
  const healthy = item.status === 'healthy'
  const percent = item.has_samples ? `${(item.uptime * 100).toFixed(2)}%` : '-'

  return (
    <Card>
      <CardContent className='space-y-3'>
        <div className='flex items-center justify-between gap-2'>
          <span className='truncate font-medium'>{item.name}</span>
          <Badge variant={healthy ? 'secondary' : 'destructive'}>
            {percent}
          </Badge>
        </div>
        <div className='flex h-6 gap-px' role='img' aria-label={item.name}>
          {item.slots.map((slot) => (
            <span
              key={slot.id}
              className={cn(
                'min-w-px flex-1 rounded-[2px]',
                SLOT_COLORS[slot.state] ?? 'bg-muted'
              )}
            />
          ))}
        </div>
        <div className='text-muted-foreground flex justify-between text-xs'>
          <span>{t('Earlier')}</span>
          <span>{t('Now')}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function ChannelStatus() {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const query = useQuery({
    queryKey: ['channel-status'],
    queryFn: listChannelStatus,
    refetchInterval: 60_000,
  })
  const items = useMemo(() => {
    const text = keyword.trim().toLowerCase()
    return (query.data ?? []).filter((item) =>
      item.name.toLowerCase().includes(text)
    )
  }, [query.data, keyword])

  let content = (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
      {items.map((item) => (
        <ChannelStatusCard key={item.name} item={item} />
      ))}
    </div>
  )
  if (query.isLoading) {
    content = <LoadingState />
  } else if (query.isError) {
    content = <ErrorState onRetry={() => void query.refetch()} />
  } else if (items.length === 0) {
    content = <EmptyState icon={Search} title={t('No channels found')} />
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Channel Status')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Input
          className='w-56'
          value={keyword}
          placeholder={t('Search channel name')}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>{content}</SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
