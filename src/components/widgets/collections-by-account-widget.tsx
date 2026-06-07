'use client'

import { useQuery } from '@tanstack/react-query'
import { Banknote, Wallet, Building2, CreditCard, ReceiptText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { DashboardWidgetConfig, FinancialAccount } from '@/types'

interface SaleRow {
  payment_account_id: string | null
  total: number
}

interface Props { businessId: string; widget: DashboardWidgetConfig }

const TYPE_ICON: Record<string, React.ElementType> = {
  cash:       Banknote,
  ewallet:    Wallet,
  bank:       Building2,
  receivable: CreditCard,
}

async function fetchCollections(businessId: string, type: string) {
  const supabase = createClient()
  const now = new Date()

  let start: string
  if (type === 'collections_by_account_today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  }

  const [{ data: sales }, { data: accounts }] = await Promise.all([
    supabase
      .from('sales')
      .select('payment_account_id, total')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .neq('payment_method', 'credit')
      .gte('created_at', start) as Promise<{ data: SaleRow[] | null }>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('financial_accounts')
      .select('id, name, account_type, is_active')
      .eq('business_id', businessId) as Promise<{ data: FinancialAccount[] | null }>,
  ])

  const accountMap = new Map((accounts ?? []).map(a => [a.id, a]))

  // Group totals by account id
  const totals = new Map<string, number>()
  for (const sale of (sales ?? [])) {
    if (!sale.payment_account_id) continue
    totals.set(sale.payment_account_id, (totals.get(sale.payment_account_id) ?? 0) + sale.total)
  }

  // Build display rows ordered by account sort_order (stable via accounts array order)
  const rows = (accounts ?? [])
    .filter(a => a.account_type !== 'receivable')
    .map(a => ({ account: a, total: totals.get(a.id) ?? 0 }))
    .filter(r => r.total > 0)

  const grandTotal = rows.reduce((s, r) => s + r.total, 0)
  return { rows, grandTotal }
}

export function CollectionsByAccountWidget({ businessId, widget }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchCollections(businessId, widget.type),
  })

  const label = widget.type === 'collections_by_account_today' ? 'Today' : 'This Month'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <ReceiptText className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (data?.rows.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">No collections {label.toLowerCase()}</p>
        ) : (
          <div className="space-y-2">
            {data!.rows.map(({ account, total }) => {
              const Icon = TYPE_ICON[account.account_type] ?? Banknote
              const pct = data!.grandTotal > 0 ? (total / data!.grandTotal) * 100 : 0
              return (
                <div key={account.id}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                      <span>{account.name}</span>
                    </div>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-slate-100">
                    <div
                      className="h-1 rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
              <span>Total {label}</span>
              <span className="font-medium text-foreground">{formatCurrency(data!.grandTotal)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
