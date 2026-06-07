'use client'

import { useQuery } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

async function fetchBalance(businessId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('customers')
    .select('outstanding_balance')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .gt('outstanding_balance', 0)
  const total = ((data ?? []) as { outstanding_balance: number }[]).reduce((s: number, c: { outstanding_balance: number }) => s + c.outstanding_balance, 0)
  const count = (data ?? []).length
  return { total, count }
}

export function OutstandingBalanceWidget({ businessId, widget }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchBalance(businessId),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <CreditCard className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
        ) : (
          <>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(data?.total ?? 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">{data?.count ?? 0} customers with balance</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
