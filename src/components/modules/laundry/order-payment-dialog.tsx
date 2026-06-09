'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { FinancialAccount, Order, OrderPayment, PaymentMethod } from '@/types'

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  maya: 'Maya',
  bank_transfer: 'Bank Transfer',
  credit: 'Credit / Utang',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: Order | null
  payment?: OrderPayment | null
  mode?: 'collect' | 'correct'
  financialAccounts: FinancialAccount[]
  onSuccess: (resultId: string) => void
}

const CORRECTION_REASONS = [
  'Wrong Amount Entered',
  'Wrong Payment Method',
  'Wrong Tip Amount',
  'Wrong Change Amount',
  'Other',
]

export function OrderPaymentDialog({ open, onOpenChange, order, payment, mode = 'collect', financialAccounts, onSuccess }: Props) {
  const [method, setMethod] = useState<PaymentMethod>(payment?.payment_method ?? 'cash')
  const [amountReceived, setAmountReceived] = useState(payment?.amount_received.toString() ?? order?.total_amount.toString() ?? '')
  const [tipAmount, setTipAmount] = useState(payment?.tip_amount ? payment.tip_amount.toString() : '')
  const [reason, setReason] = useState('Wrong Amount Entered')
  const [otherReason, setOtherReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMethod(payment?.payment_method ?? 'cash')
    setAmountReceived(payment?.amount_received.toString() ?? order?.total_amount.toString() ?? '')
    setTipAmount(payment?.tip_amount ? payment.tip_amount.toString() : '')
    setReason('Wrong Amount Entered')
    setOtherReason('')
  }, [order, payment, open])

  const serviceAmount = payment?.amount_due ?? order?.total_amount ?? 0
  const tip = Number.parseFloat(tipAmount) || 0
  const received = method === 'credit' ? 0 : Number.parseFloat(amountReceived) || 0
  const change = Math.max(received - serviceAmount - tip, 0)
  const account = useMemo(
    () => financialAccounts.find(a => a.legacy_method === method && a.is_active),
    [financialAccounts, method]
  )

  const useExcessAsTip = () => {
    const excess = Math.max((Number.parseFloat(amountReceived) || 0) - serviceAmount, 0)
    setTipAmount(excess.toFixed(2))
  }

  const validate = () => {
    if (!order) return 'No order selected'
    if (mode === 'correct' && !payment) return 'No active payment selected'
    if (!account) return `No active ${PAYMENT_LABELS[method]} account configured`
    if (mode === 'correct' && !(reason === 'Other' ? otherReason.trim() : reason)) return 'Correction reason is required'
    if (tip < 0) return 'Tip cannot be negative'
    if (method === 'credit') return null
    if (received <= 0) return 'Enter amount received'
    if (method === 'cash' && received < serviceAmount + tip) {
      return 'Cash received must cover the service amount plus tip'
    }
    if (method !== 'cash' && received !== serviceAmount + tip) {
      return 'Digital payment must equal the service amount plus tip'
    }
    return null
  }

  const submit = async () => {
    const validation = validate()
    if (validation) {
      toast.error(validation)
      return
    }
    if (!order) return

    setSaving(true)
    const supabase = createClient()
    const correctionReason = reason === 'Other' ? otherReason.trim() : reason
    const { data, error } = mode === 'correct'
      ? await supabase.rpc('correct_order_payment', {
          p_original_payment_id: payment!.id,
          p_payment_method: method,
          p_amount_received: method === 'credit' ? null : received,
          p_tip_amount: tip,
          p_reason: correctionReason,
        })
      : await supabase.rpc('record_order_payment', {
          p_order_id: order.id,
          p_payment_method: method,
          p_amount_received: method === 'credit' ? null : received,
          p_tip_amount: tip,
        })
    setSaving(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success(mode === 'correct' ? 'Payment corrected' : 'Payment collected')
    onSuccess(data as string)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{mode === 'correct' ? 'Correct Payment' : 'Collect Payment'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border bg-slate-50 p-3">
            <p className="text-sm text-muted-foreground">Service Amount</p>
            <p className="text-2xl font-bold">{formatCurrency(serviceAmount)}</p>
          </div>

          {mode === 'correct' && payment && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium">Original Payment</p>
              <p className="text-muted-foreground">
                {PAYMENT_LABELS[payment.payment_method]} · Received {formatCurrency(payment.amount_received)} · Tip {formatCurrency(payment.tip_amount)}
              </p>
            </div>
          )}

          {mode === 'correct' && (
            <div className="space-y-2">
              <Label>Correction Reason</Label>
              <Select value={reason} onValueChange={(value: string | null) => setReason(value ?? 'Wrong Amount Entered')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CORRECTION_REASONS.map(item => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reason === 'Other' && (
                <Input
                  value={otherReason}
                  onChange={event => setOtherReason(event.target.value)}
                  placeholder="Enter correction reason"
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={(value: string | null) => setMethod((value ?? 'cash') as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="gcash">GCash</SelectItem>
                <SelectItem value="maya">Maya</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="credit">Credit / Utang</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Posts to {account?.name ?? 'no configured account'}.
            </p>
          </div>

          {method !== 'credit' && (
            <div className="space-y-2">
              <Label>Amount Received</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amountReceived}
                onChange={event => setAmountReceived(event.target.value)}
                autoFocus
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Tip Amount</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={tipAmount}
                onChange={event => setTipAmount(event.target.value)}
                placeholder="0.00"
                disabled={method === 'credit'}
              />
              {method !== 'credit' && (
                <Button type="button" variant="outline" onClick={useExcessAsTip}>
                  Use Excess
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-lg border p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Change</span>
              <span className="font-semibold">{formatCurrency(method === 'credit' ? 0 : change)}</span>
            </div>
            {method === 'credit' && (
              <p className="mt-2 text-xs text-muted-foreground">
                This will increase Accounts Receivable and mark the order as paid on credit.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'correct' ? 'Save Correction' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
