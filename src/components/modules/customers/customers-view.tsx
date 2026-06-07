'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Users, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { Customer, FinancialAccount } from '@/types'
import { CustomerDialog } from './customer-dialog'
import { PaymentDialog } from './payment-dialog'

interface Props { businessId: string; initialCustomers: Customer[]; financialAccounts: FinancialAccount[] }

async function fetchCustomers(businessId: string) {
  const supabase = createClient()
  const { data } = await supabase.from('customers').select('*').eq('business_id', businessId).eq('is_active', true).order('name')
  return (data ?? []) as Customer[]
}

export function CustomersView({ businessId, initialCustomers, financialAccounts }: Props) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [payCustomer, setPayCustomer] = useState<Customer | null>(null)

  const { data: customers = initialCustomers } = useQuery({
    queryKey: ['customers', businessId],
    queryFn: () => fetchCustomers(businessId),
    initialData: initialCustomers,
  })

  const filtered = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  const totalOutstanding = customers.reduce((s, c) => s + c.outstanding_balance, 0)
  const withBalance = customers.filter(c => c.outstanding_balance > 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-muted-foreground text-sm">
            {customers.length} customers · {formatCurrency(totalOutstanding)} outstanding
          </p>
        </div>
        <Button onClick={() => { setEditCustomer(null); setDialogOpen(true) }} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      {withBalance.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-amber-600" />
          <p className="text-sm text-amber-700">
            <span className="font-semibold">{withBalance.length} customer{withBalance.length !== 1 ? 's' : ''}</span> have outstanding balances
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No customers found</TableCell>
                </TableRow>
              ) : (
                filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{c.contact_number ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {c.outstanding_balance > 0
                        ? <span className="text-amber-600 font-medium">{formatCurrency(c.outstanding_balance)}</span>
                        : <span className="text-muted-foreground text-sm">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {c.outstanding_balance > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => { setPayCustomer(c); setPaymentOpen(true) }}
                          >
                            Collect
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => { setEditCustomer(c); setDialogOpen(true) }}
                        >
                          Edit
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        customer={editCustomer}
        onSuccess={() => { setDialogOpen(false); qc.invalidateQueries({ queryKey: ['customers', businessId] }) }}
      />

      {payCustomer && (
        <PaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          businessId={businessId}
          customer={payCustomer}
          financialAccounts={financialAccounts}
          onSuccess={() => { setPaymentOpen(false); qc.invalidateQueries({ queryKey: ['customers', businessId] }) }}
        />
      )}
    </div>
  )
}
