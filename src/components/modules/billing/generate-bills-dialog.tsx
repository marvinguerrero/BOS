'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { getBillingPeriod, formatBillingPeriod } from '@/lib/utils/date'
import { addMonths, format } from 'date-fns'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  tenants: Array<{ id: string; name: string; room_id: string | null; monthly_rate: number }>
  onSuccess: () => void
}

export function GenerateBillsDialog({ open, onOpenChange, businessId, tenants, onSuccess }: Props) {
  const [period, setPeriod] = useState(getBillingPeriod())
  const [dueDay, setDueDay] = useState('5')

  const mutation = useMutation({
    mutationFn: async () => {
      const supabase = createClient()
      const [year, month] = period.split('-').map(Number)
      const dueDate = new Date(year, month - 1, parseInt(dueDay))
      if (dueDate < new Date(year, month - 1, 1)) dueDate.setMonth(dueDate.getMonth() + 1)

      // Check for existing bills this period
      const { data: existing } = await supabase
        .from('rent_bills')
        .select('tenant_id')
        .eq('business_id', businessId)
        .eq('billing_period', period)

      const existingTenantIds = new Set(((existing ?? []) as { tenant_id: string }[]).map(b => b.tenant_id))
      const newBills = tenants
        .filter(t => t.room_id && !existingTenantIds.has(t.id))
        .map(t => ({
          business_id: businessId,
          tenant_id: t.id,
          room_id: t.room_id!,
          billing_period: period,
          due_date: format(dueDate, 'yyyy-MM-dd'),
          amount: t.monthly_rate,
          status: 'pending' as const,
        }))

      if (newBills.length === 0) throw new Error('Bills already generated for this period')
      const { error } = await supabase.from('rent_bills').insert(newBills)
      if (error) throw error
      return newBills.length
    },
    onSuccess: (count) => {
      toast.success(`${count} bill${count !== 1 ? 's' : ''} generated for ${formatBillingPeriod(period)}`)
      onSuccess()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Generate Bills</DialogTitle>
          <DialogDescription>Create rent bills for all active tenants.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Billing Period</Label>
            <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Due Day of Month</Label>
            <Input type="number" min="1" max="31" value={dueDay} onChange={e => setDueDay(e.target.value)} />
          </div>
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
            Will generate bills for <span className="font-semibold">{tenants.filter(t => t.room_id).length} tenant{tenants.filter(t => t.room_id).length !== 1 ? 's' : ''}</span> with assigned rooms.
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Bills
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
