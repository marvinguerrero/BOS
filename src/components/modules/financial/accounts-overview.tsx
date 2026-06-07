'use client'

import Link from 'next/link'
import { Banknote, Wallet, Building2, CreditCard, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { FinancialAccount, FinancialAccountType } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<FinancialAccountType, React.ElementType> = {
  cash:       Banknote,
  ewallet:    Wallet,
  bank:       Building2,
  receivable: CreditCard,
}

const TYPE_LABEL: Record<FinancialAccountType, string> = {
  cash:       'Cash',
  ewallet:    'E-Wallet',
  bank:       'Bank',
  receivable: 'Receivable',
}

const TYPE_COLOR: Record<FinancialAccountType, string> = {
  cash:       'text-green-600',
  ewallet:    'text-blue-600',
  bank:       'text-purple-600',
  receivable: 'text-amber-600',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  businessId: string
  accounts: FinancialAccount[]
  role: 'owner' | 'manager' | 'staff'
}

// ─── Account card ─────────────────────────────────────────────────────────────

function AccountCard({ account, businessId }: { account: FinancialAccount; businessId: string }) {
  const Icon = TYPE_ICON[account.account_type]
  const colorClass = TYPE_COLOR[account.account_type]
  const isNegative = account.cached_balance < 0

  return (
    <Card className={cn('transition-all hover:shadow-md', !account.is_active && 'opacity-50')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-slate-100', colorClass)}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold truncate">{account.name}</p>
                {!account.is_active && (
                  <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">Archived</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{TYPE_LABEL[account.account_type]}</p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={cn(
              'text-xl font-bold tabular-nums',
              account.account_type === 'receivable' ? 'text-amber-600' : (isNegative ? 'text-destructive' : 'text-foreground')
            )}>
              {formatCurrency(Math.abs(account.cached_balance))}
            </p>
            <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground mt-0.5">
              {isNegative
                ? <TrendingDown className="h-3 w-3 text-destructive" />
                : <TrendingUp className="h-3 w-3 text-green-500" />}
              <span>{account.account_type === 'receivable' ? 'outstanding' : (isNegative ? 'overdrawn' : 'balance')}</span>
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t flex justify-end">
          <Link href={`/${businessId}/accounts/${account.id}`}>
            <Button type="button" variant="ghost" size="sm" className="gap-1 text-xs h-7">
              View History
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountsOverview({ businessId, accounts, role }: Props) {
  const active = accounts.filter(a => a.is_active)
  const archived = accounts.filter(a => !a.is_active)

  const operational = active.filter(a => a.account_type !== 'receivable')
    .sort((a, b) => b.cached_balance - a.cached_balance)
  const receivable = active.filter(a => a.account_type === 'receivable')

  const totalCash = operational.reduce((s, a) => s + a.cached_balance, 0)
  const totalAR = receivable.reduce((s, a) => s + a.cached_balance, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Financial Accounts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Total on hand: {formatCurrency(totalCash)}
            {totalAR > 0 && ` · ${formatCurrency(totalAR)} receivable`}
          </p>
        </div>
        {role === 'owner' && (
          <Link href={`/${businessId}/settings`}>
            <Button type="button" variant="outline" size="sm">Manage Accounts</Button>
          </Link>
        )}
      </div>

      {/* Operational accounts */}
      {operational.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Cash & Collections</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {operational.map(account => (
              <AccountCard key={account.id} account={account} businessId={businessId} />
            ))}
          </div>
        </section>
      )}

      {/* Receivables */}
      {receivable.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Outstanding Receivables</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {receivable.map(account => (
              <AccountCard key={account.id} account={account} businessId={businessId} />
            ))}
          </div>
        </section>
      )}

      {/* Archived */}
      {archived.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Archived</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {archived.map(account => (
              <AccountCard key={account.id} account={account} businessId={businessId} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
