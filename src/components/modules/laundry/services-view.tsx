'use client'

import { useState } from 'react'
import { Plus, Edit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { Service } from '@/types'
import { ServiceDialog } from './service-dialog'

interface Props { businessId: string; initialServices: Service[] }

export function LaundryServicesView({ businessId, initialServices }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editService, setEditService] = useState<Service | null>(null)
  const [services, setServices] = useState(initialServices)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Services</h1>
          <p className="text-muted-foreground text-sm">{services.length} active services</p>
        </div>
        <Button onClick={() => { setEditService(null); setDialogOpen(true) }} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Service
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No services yet. Add your first service.
                  </TableCell>
                </TableRow>
              ) : (
                services.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.description ?? <Badge variant="outline">No description</Badge>}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(s.price)}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditService(s); setDialogOpen(true) }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ServiceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        service={editService}
        onSuccess={async () => {
          const supabase = createClient()
          const { data } = await supabase
            .from('services')
            .select('*')
            .eq('business_id', businessId)
            .eq('is_active', true)
            .order('name')
          setServices(data ?? [])
          setDialogOpen(false)
        }}
      />
    </div>
  )
}
