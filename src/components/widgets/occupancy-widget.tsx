'use client'

import { useQuery } from '@tanstack/react-query'
import { Home } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { createClient } from '@/lib/supabase/client'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

async function fetchOccupancy(businessId: string, type: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('rooms')
    .select('status')
    .eq('business_id', businessId)
    .eq('is_active', true)

  const total = data?.length ?? 0
  const occupied = data?.filter((r: { status: string }) => r.status === 'occupied').length ?? 0
  const available = data?.filter((r: { status: string }) => r.status === 'available').length ?? 0
  const rate = total > 0 ? Math.round((occupied / total) * 100) : 0

  return { total, occupied, available, rate }
}

export function OccupancyWidget({ businessId, widget }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchOccupancy(businessId, widget.type),
  })

  const isAvailable = widget.type === 'available_rooms'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <Home className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-12 bg-slate-100 rounded animate-pulse" />
        ) : isAvailable ? (
          <>
            <div className="text-2xl font-bold text-green-600">{data?.available ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">of {data?.total ?? 0} total rooms</p>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold">{data?.rate ?? 0}%</div>
            <Progress value={data?.rate ?? 0} className="mt-2 h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">{data?.occupied}/{data?.total} rooms occupied</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
