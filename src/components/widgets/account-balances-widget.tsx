'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Banknote, Wallet, Building2, CreditCard, Landmark } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { DashboardWidgetConfig, FinancialAccount, FinancialAccountType } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

const TYPE_ICON: Record<FinancialAccountType, React.ElementType> = {
  cash: Banknote, ewallet: Wallet, bank: Building2, receivable: CreditCard,
}

const TYPE_COLOR: Record<FinancialAccountType, string> = {
  cash:       'text-green-600',
  ewallet:    'text-blue-600',
  bank:       'text-purple-600',
  receivable: 'text-amber-600',
}

async function fetchAccounts(businessId: string) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('financial_accounts')
    .select('id, name, account_type, cached_balance, is_active, sort_order')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('sort_order') as { data: FinancialAccount[] | null }
  return data ?? []
}

export function AccountBalancesWidget({ businessId, widget }: Props) {
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchAccounts(businessId),
  })

  const operational = accounts.filter(a => a.account_type !== 'receivable')
  const receivable = accounts.filter(a => a.account_type === 'receivable')
  const totalOnHand = operational.reduce((s, a) => s + a.cached_balance, 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <Landmark className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Operational accounts */}
            <div className="space-y-1.5">
              {operational.map(account => {
                const Icon = TYPE_ICON[account.account_type]
                return (
                  <Link key={account.id} href={`/${businessId}/accounts/${account.id}`} className="flex items-center justify-between text-sm group">
                    <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-foreground transition-colors">
                      <Icon className="h-3.5 w-3.5" />
                      <span>{account.name}</span>
                    </div>
                    <span className={cn(
                      'font-medium tabular-nums',
                      account.cached_balance < 0 ? 'text-destructive' : TYPE_COLOR[account.account_type]
                    )}>
                      {formatCurrency(account.cached_balance)}
                    </span>
                  </Link>
                )
              })}
            </div>

            {/* Total on hand */}
            <div className="flex justify-between text-sm font-bold border-t pt-2">
              <span>Total on Hand</span>
              <span className={totalOnHand < 0 ? 'text-destructive' : ''}>{formatCurrency(totalOnHand)}</span>
            </div>

            {/* AR */}
            {receivable.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t">
                {receivable.map(account => (
                  <Link key={account.id} href={`/${businessId}/accounts/${account.id}`} className="flex items-center justify-between text-sm group">
                    <div className="flex items-center gap-1.5 text-muted-foreground group-hover:text-foreground transition-colors">
                      <CreditCard className="h-3.5 w-3.5" />
                      <span>{account.name}</span>
                    </div>
                    <span className="font-medium tabular-nums text-amber-600">
                      {formatCurrency(account.cached_balance)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
