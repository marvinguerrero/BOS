'use client'

import { useState } from 'react'
import { Plus, Edit, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDate } from '@/lib/utils/date'
import type { Tenant } from '@/types'
import { TenantDialog } from './tenant-dialog'

interface Props {
  businessId: string
  initialTenants: Tenant[]
  rooms: Array<{ id: string; room_number: string; status: string }>
}

export function TenantsView({ businessId, initialTenants, rooms }: Props) {
  const [tenants, setTenants] = useState(initialTenants)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTenant, setEditTenant] = useState<Tenant | null>(null)

  const refresh = async () => {
    const supabase = createClient()
    const { data } = await supabase.from('tenants').select('*, rooms(room_number)').eq('business_id', businessId).eq('is_active', true).order('name')
    setTenants((data ?? []) as Tenant[])
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-muted-foreground text-sm">{tenants.length} active tenants</p>
        </div>
        <Button onClick={() => { setEditTenant(null); setDialogOpen(true) }} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Tenant
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Move-in Date</TableHead>
                <TableHead className="text-right">Monthly Rate</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No tenants yet</TableCell>
                </TableRow>
              ) : (
                tenants.map(t => {
                  const tenant = t as Tenant & { rooms?: { room_number: string } }
                  return (
                    <TableRow key={t.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{t.name}</p>
                          {t.contact_number && <p className="text-xs text-muted-foreground">{t.contact_number}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {tenant.rooms ? (
                          <Badge variant="outline">Room {tenant.rooms.room_number}</Badge>
                        ) : <span className="text-muted-foreground text-sm">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{formatDate(t.start_date)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(t.monthly_rate)}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditTenant(t); setDialogOpen(true) }}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TenantDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        tenant={editTenant}
        rooms={rooms}
        onSuccess={() => { refresh(); setDialogOpen(false) }}
      />
    </div>
  )
}
