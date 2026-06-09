'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Search, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'
import type { SaleStatus, SalePaymentStatus } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SaleRow {
  id: string
  receipt_number: string | null
  created_at: string
  customer_id: string | null
  customer_name_snapshot: string | null
  customers: { name: string } | null
  sale_items: { id: string }[]
  total: number
  payment_method: string
  status: SaleStatus
  payment_status: SalePaymentStatus
  balance_amount: number
  cashier_name: string | null
}

interface Props {
  businessId: string
  sales: SaleRow[]
  totalCount: number
  totalRevenue: number
  page: number
  pageSize: number
  currentQ: string
  currentDateRange: string
  currentStatus: string
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', gcash: 'GCash', maya: 'Maya', credit: 'Credit',
}

function PaymentBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    cash: 'bg-green-100 text-green-700',
    gcash: 'bg-blue-100 text-blue-700',
    maya: 'bg-purple-100 text-purple-700',
    credit: 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[method] ?? 'bg-slate-100 text-slate-700'}`}>
      {PAYMENT_LABELS[method] ?? method}
    </span>
  )
}

function StatusBadge({ status, paymentStatus }: { status: SaleStatus; paymentStatus: SalePaymentStatus }) {
  if (status === 'voided') {
    return <Badge variant="destructive" className="text-xs">Voided</Badge>
  }
  if (status === 'refunded') {
    return <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Refunded</Badge>
  }
  if (paymentStatus === 'outstanding') {
    return <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Outstanding</Badge>
  }
  if (paymentStatus === 'partially_paid') {
    return <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Partial</Badge>
  }
  return <Badge variant="outline" className="text-xs text-green-600 border-green-300">Paid</Badge>
}

// ─── Date range tabs ───────────────────────────────────────────────────────────

const DATE_RANGES = [
  { label: 'All', value: '' },
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
]

// ─── Component ─────────────────────────────────────────────────────────────────

export function SalesHistoryView({
  businessId,
  sales,
  totalCount,
  totalRevenue,
  page,
  pageSize,
  currentQ,
  currentDateRange,
  currentStatus,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(currentQ)

  const buildUrl = useCallback(
    (overrides: Record<string, string>) => {
      const params = new URLSearchParams()
      const merged = {
        q: currentQ,
        dateRange: currentDateRange,
        status: currentStatus,
        page: String(page),
        ...overrides,
      }
      Object.entries(merged).forEach(([k, v]) => {
        if (v && v !== '1') params.set(k, v)
        else if (k === 'page' && v !== '1') params.set(k, v)
      })
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, currentQ, currentDateRange, currentStatus, page]
  )

  const applySearch = () => {
    startTransition(() => {
      router.push(buildUrl({ q: searchValue, page: '1' }))
    })
  }

  const totalPages = Math.ceil(totalCount / pageSize)
  const customerName = (row: SaleRow) =>
    row.customer_name_snapshot ?? row.customers?.name ?? 'Walk-in Customer'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalCount} transaction{totalCount !== 1 ? 's' : ''} ·{' '}
            Total revenue: {formatCurrency(totalRevenue)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {/* Date range tabs */}
          <div className="flex gap-1">
            {DATE_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => startTransition(() => router.push(buildUrl({ dateRange: r.value, page: '1' })))}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  currentDateRange === r.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Search + status filter row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by receipt no. or customer..."
                value={searchValue}
                onChange={e => setSearchValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applySearch()}
                className="pl-9 pr-3"
              />
            </div>
            <Button type="button" variant="outline" onClick={applySearch} size="default">
              Search
            </Button>
            <select
              aria-label="Filter by status"
              value={currentStatus}
              onChange={e => startTransition(() => router.push(buildUrl({ status: e.target.value, page: '1' })))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Active</option>
              <option value="all">All statuses</option>
              <option value="voided">Voided only</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Receipt</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Served by</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                      No sales found
                    </TableCell>
                  </TableRow>
                ) : (
                  sales.map(sale => (
                    <TableRow
                      key={sale.id}
                      className={sale.status === 'voided' ? 'opacity-50' : 'cursor-pointer hover:bg-muted/40'}
                      onClick={() => router.push(`/${businessId}/sales/${sale.id}`)}
                    >
                      <TableCell className="font-mono text-xs font-medium">
                        {sale.receipt_number ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDateTime(sale.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">{customerName(sale)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {sale.cashier_name ?? '—'}
                      </TableCell>
                      <TableCell className="text-center text-sm text-muted-foreground">
                        {sale.sale_items?.length ?? 0}
                      </TableCell>
                      <TableCell>
                        <PaymentBadge method={sale.payment_method} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={sale.status} paymentStatus={sale.payment_status} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(sale.total)}
                        {sale.balance_amount > 0 && (
                          <p className="text-xs text-amber-600 font-normal">
                            {formatCurrency(sale.balance_amount)} owed
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/${businessId}/sales/${sale.id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
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
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page <= 1}
              onClick={() => startTransition(() => router.push(buildUrl({ page: String(page - 1) })))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page >= totalPages}
              onClick={() => startTransition(() => router.push(buildUrl({ page: String(page + 1) })))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
