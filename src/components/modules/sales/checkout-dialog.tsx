'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils/currency'
import type { PaymentMethod } from '@/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  total: number
  paymentMethod: PaymentMethod
  accountName: string | null
  onConfirm: (amountTendered: number) => Promise<void>
}

export function CheckoutDialog({ open, onOpenChange, total, paymentMethod, accountName, onConfirm }: Props) {
  const [tendered, setTendered] = useState('')
  const [loading, setLoading] = useState(false)

  const amount = parseFloat(tendered) || 0
  const change = Math.max(0, amount - total)
  const isCash = paymentMethod === 'cash'
  const isCredit = paymentMethod === 'credit'

  const handleConfirm = async () => {
    setLoading(true)
    const tenderAmount = isCash ? amount : total
    await onConfirm(tenderAmount)
    setLoading(false)
    setTendered('')
  }

  const canConfirm = !isCash || isCredit || amount >= total

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Confirm Payment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-xl bg-primary/10 p-4 text-center">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-3xl font-bold text-primary">{formatCurrency(total)}</p>
            <p className="text-sm text-muted-foreground mt-1">{accountName ?? paymentMethod}</p>
          </div>

          {isCash && (
            <div className="space-y-2">
              <Label>Cash Received</Label>
              <Input
                type="number"
                step="0.01"
                min={total}
                placeholder={formatCurrency(total)}
                value={tendered}
                onChange={e => setTendered(e.target.value)}
                autoFocus
                className="text-xl font-bold h-12"
              />
              {amount >= total && (
                <div className="flex justify-between p-3 rounded-lg bg-green-50 text-green-700">
                  <span className="font-medium">Change:</span>
                  <span className="font-bold">{formatCurrency(change)}</span>
                </div>
              )}
            </div>
          )}

          {isCredit && (
            <p className="text-sm text-center text-amber-600 bg-amber-50 p-3 rounded-lg">
              This sale will be added to the customer&apos;s outstanding balance.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={!canConfirm || loading} className="flex-1">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Complete Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
