'use client'

import { useState } from 'react'
import { Plus, CreditCard, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate, formatBillingPeriod, getBillingPeriod } from '@/lib/utils/date'
import type { RentBill, BillStatus } from '@/types'
import { GenerateBillsDialog } from './generate-bills-dialog'
import { RecordPaymentDialog } from './record-payment-dialog'

const STATUS_COLORS: Record<BillStatus, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  paid:     'bg-green-100 text-green-700',
  overdue:  'bg-red-100 text-red-700',
  partial:  'bg-blue-100 text-blue-700',
}

interface Props {
  businessId: string
  initialBills: RentBill[]
  tenants: Array<{ id: string; name: string; room_id: string | null; monthly_rate: number }>
}

export function BillingView({ businessId, initialBills, tenants }: Props) {
  const [bills, setBills] = useState(initialBills)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [payBill, setPayBill] = useState<RentBill | null>(null)

  const filtered = statusFilter === 'all' ? bills : bills.filter(b => b.status === statusFilter)

  const refresh = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('rent_bills')
      .select('*, tenants(name, contact_number), rooms(room_number)')
      .eq('business_id', businessId)
      .order('due_date', { ascending: true })
      .limit(100)
    setBills((data ?? []) as RentBill[])
  }

  const totalOutstanding = bills
    .filter(b => b.status !== 'paid')
    .reduce((s, b) => s + (b.amount - b.paid_amount), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-muted-foreground text-sm">{bills.length} bills · {formatCurrency(totalOutstanding)} outstanding</p>
        </div>
        <Button onClick={() => setGenerateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Generate Bills
        </Button>
      </div>

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={(v: string | null) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bills</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No bills found</TableCell>
                </TableRow>
              ) : (
                filtered.map(bill => {
                  const b = bill as RentBill & { tenants?: { name: string }; rooms?: { room_number: string } }
                  const remaining = bill.amount - bill.paid_amount
                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">{b.tenants?.name ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {b.rooms ? `Room ${b.rooms.room_number}` : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatBillingPeriod(bill.billing_period)}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(bill.due_date)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[bill.status]}`}>
                          {bill.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div>
                          <p className="font-medium">{formatCurrency(bill.amount)}</p>
                          {bill.status !== 'paid' && bill.paid_amount > 0 && (
                            <p className="text-xs text-muted-foreground">Remaining: {formatCurrency(remaining)}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {bill.status !== 'paid' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setPayBill(bill)}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Pay
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <GenerateBillsDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        businessId={businessId}
        tenants={tenants}
        onSuccess={() => { refresh(); setGenerateOpen(false) }}
      />

      {payBill && (
        <RecordPaymentDialog
          open={!!payBill}
          onOpenChange={v => { if (!v) setPayBill(null) }}
          businessId={businessId}
          bill={payBill}
          onSuccess={() => { setPayBill(null); refresh() }}
        />
      )}
    </div>
  )
}
