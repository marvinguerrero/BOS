'use client'

import { useState } from 'react'
import { Loader2, Banknote, Wallet, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { Customer, FinancialAccount, FinancialAccountType } from '@/types'

const TYPE_ICON: Record<FinancialAccountType, React.ElementType> = {
  cash: Banknote, ewallet: Wallet, bank: Building2,
  receivable: Banknote, // fallback — receivable accounts are filtered out below
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  customer: Customer
  financialAccounts: FinancialAccount[]
  onSuccess: () => void
}

export function PaymentDialog({ open, onOpenChange, businessId, customer, financialAccounts, onSuccess }: Props) {
  const [amount, setAmount] = useState('')
  const [receivingAccountId, setReceivingAccountId] = useState<string | null>(null)

  // Exclude receivable accounts — payment goes INTO cash/ewallet/bank
  const cashAccounts = financialAccounts.filter(a => a.account_type !== 'receivable' && a.is_active)

  // Auto-select first cash account if none is selected
  const effectiveAccountId = receivingAccountId ?? cashAccounts[0]?.id ?? null

  const mutation = useMutation({
    mutationFn: async () => {
      const payAmount = parseFloat(amount)
      if (!payAmount || payAmount <= 0) throw new Error('Enter a valid amount')
      if (payAmount > customer.outstanding_balance) throw new Error('Amount exceeds balance')
      if (!effectiveAccountId) throw new Error('Select an account to receive payment')

      const supabase = createClient()
      const { error } = await supabase.rpc('record_customer_payment', {
        p_business_id:          businessId,
        p_customer_id:          customer.id,
        p_amount:               payAmount,
        p_receiving_account_id: effectiveAccountId,
        p_notes:                null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Payment recorded')
      setAmount('')
      setReceivingAccountId(null)
      onSuccess()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Collect Payment</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {/* Customer balance */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-sm text-amber-600">{customer.name}</p>
            <p className="text-xl font-bold text-amber-700">{formatCurrency(customer.outstanding_balance)} outstanding</p>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label>Payment Amount (₱)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max={customer.outstanding_balance}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder={formatCurrency(customer.outstanding_balance)}
              autoFocus
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setAmount(customer.outstanding_balance.toString())}
            >
              Pay full balance ({formatCurrency(customer.outstanding_balance)})
            </Button>
          </div>

          {/* Receiving account */}
          {cashAccounts.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Payment received via</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {cashAccounts.map(account => {
                  const Icon = TYPE_ICON[account.account_type]
                  const isSelected = effectiveAccountId === account.id
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setReceivingAccountId(account.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate leading-tight">{account.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !amount || !effectiveAccountId}
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
