'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

async function fetchBills(businessId: string, type: string) {
  const supabase = createClient()

  if (type === 'overdue_bills') {
    const { data } = await supabase
      .from('rent_bills')
      .select('id, amount, paid_amount, tenants(name)')
      .eq('business_id', businessId)
      .eq('status', 'overdue')
      .order('due_date', { ascending: true })
      .limit(5)
    return data ?? []
  }

  // upcoming_dues — next 7 days
  const today = new Date().toISOString().split('T')[0]
  const next7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const { data } = await supabase
    .from('rent_bills')
    .select('id, amount, due_date, tenants(name)')
    .eq('business_id', businessId)
    .in('status', ['pending', 'partial'])
    .gte('due_date', today)
    .lte('due_date', next7)
    .order('due_date', { ascending: true })
    .limit(5)
  return data ?? []
}

export function OverdueBillsWidget({ businessId, widget }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchBills(businessId, widget.type),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <AlertCircle className="h-4 w-4 text-amber-500" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1,2].map(i => <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-green-600 font-medium">No {widget.type === 'overdue_bills' ? 'overdue' : 'upcoming'} bills</p>
        ) : (
          <div className="space-y-2">
            {data.map((b: { id: string; amount: number; paid_amount?: number; due_date?: string; tenants: { name: string } | null }) => (
              <div key={b.id} className="flex items-center justify-between">
                <span className="text-sm truncate">{b.tenants?.name ?? 'Unknown'}</span>
                <span className="text-xs text-amber-600 font-medium shrink-0 ml-2">
                  {formatCurrency(b.amount - (b.paid_amount ?? 0))}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
