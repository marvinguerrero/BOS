'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatBillingPeriod } from '@/lib/utils/date'
import type { RentBill, PaymentMethod } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  bill: RentBill
  onSuccess: () => void
}

export function RecordPaymentDialog({ open, onOpenChange, businessId, bill, onSuccess }: Props) {
  const remaining = bill.amount - bill.paid_amount
  const [amount, setAmount] = useState(remaining.toString())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [reference, setReference] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const payAmount = parseFloat(amount)
      if (!payAmount || payAmount <= 0) throw new Error('Enter a valid amount')
      if (payAmount > remaining) throw new Error('Amount exceeds remaining balance')

      const newPaidAmount = bill.paid_amount + payAmount
      const newStatus = newPaidAmount >= bill.amount ? 'paid' : 'partial'

      await Promise.all([
        supabase.from('rent_payments').insert({
          business_id: businessId,
          bill_id: bill.id,
          amount: payAmount,
          payment_method: method,
          reference_number: reference || null,
          created_by: user.id,
        }),
        supabase.from('rent_bills').update({
          paid_amount: newPaidAmount,
          status: newStatus,
        }).eq('id', bill.id),
      ])
    },
    onSuccess: () => { toast.success('Payment recorded'); onSuccess() },
    onError: (e: Error) => toast.error(e.message),
  })

  const b = bill as RentBill & { tenants?: { name: string } }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-medium">{b.tenants?.name}</p>
            <p className="text-sm text-muted-foreground">{formatBillingPeriod(bill.billing_period)}</p>
            <p className="text-lg font-bold mt-1">{formatCurrency(remaining)} remaining</p>
          </div>
          <div className="space-y-2">
            <Label>Amount (₱)</Label>
            <Input type="number" step="0.01" min="0" max={remaining} value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={(v: string | null) => setMethod((v ?? "cash") as PaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="gcash">GCash</SelectItem>
                <SelectItem value="maya">Maya</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reference Number</Label>
            <Input placeholder="Optional" value={reference} onChange={e => setReference(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setAmount(remaining.toString())}>
            Pay full amount ({formatCurrency(remaining)})
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !amount}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
