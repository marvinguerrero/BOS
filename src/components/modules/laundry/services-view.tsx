'use client'

import { useState } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Plus, Edit, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { LaundryService } from '@/types'
import { ServiceDialog } from './service-dialog'

interface Props { businessId: string; initialServices: LaundryService[] }

export function LaundryServicesView({ businessId, initialServices }: Props) {
  const qc = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editService, setEditService] = useState<LaundryService | null>(null)
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
                <TableHead>Pricing Type</TableHead>
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
                    <TableCell>
                      <Badge variant="outline">
                        {s.pricing_type === 'per_kg' ? 'Per Kilogram' : 'Fixed Rate'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(s.price)}{s.pricing_type === 'per_kg' ? '/kg' : ''}
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
          const { data } = await supabase.from('laundry_services').select('*').eq('business_id', businessId).eq('is_active', true).order('name')
          setServices(data ?? [])
          setDialogOpen(false)
        }}
      />
    </div>
  )
}
