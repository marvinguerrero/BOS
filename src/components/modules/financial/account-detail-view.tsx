'use client'

import { useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, Banknote, Wallet, Building2, CreditCard, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'
import type { FinancialAccount, AccountTransaction, AccountTransactionType, FinancialAccountType } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<FinancialAccountType, React.ElementType> = {
  cash: Banknote, ewallet: Wallet, bank: Building2, receivable: CreditCard,
}

const TXN_LABELS: Record<AccountTransactionType, string> = {
  sale:         'Sale',
  credit_sale:  'Credit Sale',
  payment:      'Payment',
  refund:       'Void / Refund',
  adjustment:   'Adjustment',
  transfer_in:  'Transfer In',
  transfer_out: 'Transfer Out',
}

const TXN_BADGE: Record<AccountTransactionType, string> = {
  sale:         'bg-green-100 text-green-700',
  credit_sale:  'bg-amber-100 text-amber-700',
  payment:      'bg-blue-100 text-blue-700',
  refund:       'bg-red-100 text-red-700',
  adjustment:   'bg-slate-100 text-slate-700',
  transfer_in:  'bg-purple-100 text-purple-700',
  transfer_out: 'bg-purple-100 text-purple-700',
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  businessId: string
  account: FinancialAccount
  transactions: AccountTransaction[]
  totalCount: number
  page: number
  pageSize: number
  pageStartBalance: number
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AccountDetailView({
  businessId, account, transactions, totalCount, page, pageSize, pageStartBalance,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const Icon = TYPE_ICON[account.account_type]
  const totalPages = Math.ceil(totalCount / pageSize)

  const buildUrl = (p: number) => {
    const params = new URLSearchParams()
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  // Compute running balance for each row (newest first = decreasing balance)
  let runningBalance = pageStartBalance
  const rows = transactions.map(txn => {
    const balanceAfter = runningBalance
    runningBalance = runningBalance - txn.amount
    return { txn, balanceAfter }
  })

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Back */}
      <Link
        href={`/${businessId}/accounts`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Accounts
      </Link>

      {/* Account header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <Icon className="h-6 w-6 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{account.name}</h1>
                {!account.is_active && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">Archived</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground capitalize">{account.account_type} account</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground mb-0.5">Current Balance</p>
              <p className={cn(
                'text-3xl font-bold tabular-nums',
                account.cached_balance < 0 ? 'text-destructive' : (account.account_type === 'receivable' ? 'text-amber-600' : 'text-foreground')
              )}>
                {formatCurrency(account.cached_balance)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            Transaction History
            <span className="text-xs font-normal text-muted-foreground">{totalCount} total</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Notes / Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      No transactions yet
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map(({ txn, balanceAfter }) => (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        <p>{formatDate(txn.created_at)}</p>
                        <p className="text-xs text-muted-foreground">{formatTime(txn.created_at)}</p>
                      </TableCell>
                      <TableCell>
                        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', TXN_BADGE[txn.transaction_type])}>
                          {TXN_LABELS[txn.transaction_type]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm max-w-48">
                        <p className="truncate">{txn.notes ?? '—'}</p>
                        {txn.reference_type === 'sale' && txn.reference_id && (
                          <Link
                            href={`/${businessId}/sales/${txn.reference_id}`}
                            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
                          >
                            View Sale <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className={cn(
                        'text-right font-medium tabular-nums',
                        txn.amount > 0 ? 'text-green-600' : 'text-destructive'
                      )}>
                        {txn.amount > 0 ? '+' : ''}{formatCurrency(txn.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                        {formatCurrency(balanceAfter)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {Math.min((page - 1) * pageSize + 1, totalCount)}–{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => startTransition(() => router.push(buildUrl(page - 1)))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">{page} / {totalPages}</span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => startTransition(() => router.push(buildUrl(page + 1)))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
