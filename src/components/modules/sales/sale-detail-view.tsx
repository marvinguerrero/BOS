'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { SaleStatus, SalePaymentStatus } from '@/types'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SaleItemRow {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  total_price: number
  product_name_snapshot: string | null
  product_sku_snapshot: string | null
  products: { name: string; sku: string | null } | null
}

interface SaleRow {
  id: string
  receipt_number: string | null
  created_at: string
  customer_id: string | null
  cashier_id: string
  subtotal: number
  discount: number
  total: number
  payment_method: string
  amount_tendered: number
  change_amount: number
  notes: string | null
  status: SaleStatus
  payment_status: SalePaymentStatus
  amount_paid: number
  balance_amount: number
  tax_amount: number
  customer_name_snapshot: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  official_receipt_no: string | null
  customers: { name: string; contact_number: string | null } | null
  sale_items: SaleItemRow[]
}

interface Props {
  sale: SaleRow
  cashierName: string | null
  voiderName: string | null
  businessId: string
  userId: string
  role: 'owner' | 'manager' | 'staff'
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash', gcash: 'GCash', maya: 'Maya', credit: 'Credit (Utang)',
}

function StatusBadge({ status, paymentStatus }: { status: SaleStatus; paymentStatus: SalePaymentStatus }) {
  if (status === 'voided') return <Badge variant="destructive">Voided</Badge>
  if (status === 'refunded') return <Badge variant="outline" className="text-orange-600 border-orange-300">Refunded</Badge>
  if (paymentStatus === 'outstanding') return <Badge variant="outline" className="text-amber-600 border-amber-300">Outstanding</Badge>
  if (paymentStatus === 'partially_paid') return <Badge variant="outline" className="text-blue-600 border-blue-300">Partially Paid</Badge>
  return <Badge variant="outline" className="text-green-600 border-green-300">Paid</Badge>
}

// ─── Void dialog ───────────────────────────────────────────────────────────────

function VoidButton({ saleId, userId, onVoided }: { saleId: string; userId: string; onVoided: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  const handleVoid = async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.rpc('void_sale', {
        p_sale_id: saleId,
        p_user_id: userId,
        p_reason: reason || null,
      })
      if (error) throw error
      toast.success('Sale voided')
      setOpen(false)
      onVoided()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to void sale')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Void Sale
      </Button>
    )
  }

  return (
    <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium text-destructive">Void this sale?</p>
        <p className="text-xs text-muted-foreground">
          Stock will be restored. Credit balances will be reversed. This cannot be undone.
        </p>
        <input
          type="text"
          placeholder="Reason (optional)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full rounded border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex gap-2">
          <Button type="button" variant="destructive" size="sm" disabled={loading} onClick={handleVoid}>
            {loading ? 'Voiding…' : 'Confirm Void'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function SaleDetailView({ sale, cashierName, voiderName, businessId, userId, role }: Props) {
  const router = useRouter()
  const canVoid = (role === 'owner' || role === 'manager') && sale.status === 'completed'

  const itemName = (item: SaleItemRow) =>
    item.product_name_snapshot ?? item.products?.name ?? 'Unknown product'
  const itemSku = (item: SaleItemRow) =>
    item.product_sku_snapshot ?? item.products?.sku ?? null
  const customerName =
    sale.customer_name_snapshot ?? sale.customers?.name ?? 'Walk-in'

  return (
    <div className="max-w-2xl space-y-4">
      {/* Back link */}
      <Link
        href={`/${businessId}/sales/history`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Sales History
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold font-mono">
              {sale.receipt_number ?? sale.id.slice(0, 8)}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{formatDateTime(sale.created_at)}</p>
        </div>
        <StatusBadge status={sale.status} paymentStatus={sale.payment_status} />
      </div>

      {/* Void action */}
      {canVoid && (
        <VoidButton saleId={sale.id} userId={userId} onVoided={() => router.refresh()} />
      )}

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-center w-16">Qty</TableHead>
                <TableHead className="text-right w-24">Unit Price</TableHead>
                <TableHead className="text-right w-24">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sale.sale_items.map(item => (
                <TableRow key={item.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{itemName(item)}</p>
                    {itemSku(item) && (
                      <p className="text-xs text-muted-foreground font-mono">{itemSku(item)}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                  <TableCell className="text-right text-sm">{formatCurrency(item.unit_price)}</TableCell>
                  <TableCell className="text-right text-sm font-medium">{formatCurrency(item.total_price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Payment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span className="font-medium">{customerName}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(sale.subtotal)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount</span>
              <span>−{formatCurrency(sale.discount)}</span>
            </div>
          )}
          {sale.tax_amount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span>{formatCurrency(sale.tax_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base">
            <span>Total</span>
            <span>{formatCurrency(sale.total)}</span>
          </div>
          <Separator />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment Method</span>
            <span>{PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}</span>
          </div>
          {sale.payment_method === 'cash' && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Tendered</span>
                <span>{formatCurrency(sale.amount_tendered)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Change</span>
                <span>{formatCurrency(sale.change_amount)}</span>
              </div>
            </>
          )}
          {sale.balance_amount > 0 && (
            <div className="flex justify-between font-medium text-amber-600">
              <span>Balance Owed</span>
              <span>{formatCurrency(sale.balance_amount)}</span>
            </div>
          )}
          {sale.official_receipt_no && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Official Receipt No.</span>
              <span className="font-mono">{sale.official_receipt_no}</span>
            </div>
          )}
          {sale.notes && (
            <div className="pt-1">
              <p className="text-muted-foreground text-xs">Notes</p>
              <p className="text-sm">{sale.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit trail */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Audit Trail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
            <div>
              <p className="font-medium">Sale recorded</p>
              <p className="text-muted-foreground text-xs">
                {cashierName ?? 'Unknown'} · {formatDateTime(sale.created_at)}
              </p>
            </div>
          </div>
          {sale.status === 'voided' && sale.voided_at && (
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-destructive mt-1.5 shrink-0" />
              <div>
                <p className="font-medium text-destructive">Sale voided</p>
                <p className="text-muted-foreground text-xs">
                  {voiderName ?? 'Unknown'} · {formatDateTime(sale.voided_at)}
                </p>
                {sale.void_reason && (
                  <p className="text-xs mt-0.5">Reason: {sale.void_reason}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
