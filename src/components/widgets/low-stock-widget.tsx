'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

type LowStockProduct = { id: string; name: string; stock_quantity: number; low_stock_threshold: number }

async function fetchLowStock(businessId: string): Promise<LowStockProduct[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('products')
    .select('id, name, stock_quantity, low_stock_threshold')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('stock_quantity', { ascending: true })
    .limit(500)
  return ((data ?? []) as LowStockProduct[])
    .filter(p => p.stock_quantity <= p.low_stock_threshold)
    .slice(0, 5)
}

export function LowStockWidget({ businessId, widget }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchLowStock(businessId),
    retry: false,
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <AlertTriangle className="h-4 w-4 text-amber-500" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-green-600 font-medium">All items in stock</p>
        ) : (
          <div className="space-y-2">
            {data.map(p => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-sm truncate">{p.name}</span>
                <Badge variant={p.stock_quantity === 0 ? 'destructive' : 'secondary'} className="ml-2 shrink-0">
                  {p.stock_quantity} left
                </Badge>
              </div>
            ))}
            <Link href={`/${businessId}/inventory/products`} className="text-xs text-primary hover:underline block mt-2">
              View all →
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
