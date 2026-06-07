'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import type { Tenant } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  contact_number: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  room_id: z.string().optional(),
  start_date: z.string().min(1, 'Start date required'),
  monthly_rate: z.coerce.number().min(0),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  tenant: Tenant | null
  rooms: Array<{ id: string; room_number: string; status: string }>
  onSuccess: () => void
}

export function TenantDialog({ open, onOpenChange, businessId, tenant, rooms, onSuccess }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
    defaultValues: { monthly_rate: 0 },
  })

  useEffect(() => {
    reset(tenant ? {
      name: tenant.name,
      contact_number: tenant.contact_number ?? '',
      email: tenant.email ?? '',
      room_id: tenant.room_id ?? '',
      start_date: tenant.start_date,
      monthly_rate: tenant.monthly_rate,
    } : { name: '', contact_number: '', email: '', room_id: '', start_date: new Date().toISOString().split('T')[0], monthly_rate: 0 })
  }, [tenant, open, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      const payload = {
        ...values,
        room_id: values.room_id || null,
        contact_number: values.contact_number || null,
        email: values.email || null,
        business_id: businessId,
      }
      if (tenant) {
        const { error } = await supabase.from('tenants').update(payload).eq('id', tenant.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('tenants').insert(payload)
        if (error) throw error
        // Mark room as occupied if assigned
        if (payload.room_id) {
          await supabase.from('rooms').update({ status: 'occupied' }).eq('id', payload.room_id)
        }
      }
    },
    onSuccess: () => { toast.success(tenant ? 'Tenant updated' : 'Tenant added'); onSuccess() },
    onError: (e: Error) => toast.error(e.message),
  })

  const availableRooms = rooms.filter(r => r.status === 'available' || r.id === tenant?.room_id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{tenant ? 'Edit Tenant' : 'Add Tenant'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Full Name *</Label>
            <Input placeholder="Juan dela Cruz" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Contact Number</Label>
              <Input type="tel" placeholder="09XXXXXXXXX" {...register('contact_number')} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="optional" {...register('email')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assign Room</Label>
            <Select value={watch('room_id') ?? ''} onValueChange={(v: string | null) => setValue("room_id", v ?? "")}>
              <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">No room assigned</SelectItem>
                {availableRooms.map(r => (
                  <SelectItem key={r.id} value={r.id}>Room {r.room_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Move-in Date *</Label>
              <Input type="date" {...register('start_date')} />
              {errors.start_date && <p className="text-xs text-destructive">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Monthly Rate (₱)</Label>
              <Input type="number" step="0.01" min="0" {...register('monthly_rate')} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tenant ? 'Save' : 'Add Tenant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
