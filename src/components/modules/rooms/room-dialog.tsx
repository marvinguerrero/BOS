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
import type { Room, RoomStatus } from '@/types'

const schema = z.object({
  room_number: z.string().min(1, 'Room number is required'),
  floor: z.string().optional(),
  type: z.string().optional(),
  monthly_rate: z.coerce.number().min(0),
  status: z.enum(['available', 'occupied', 'maintenance']),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  room: Room | null
  onSuccess: () => void
}

export function RoomDialog({ open, onOpenChange, businessId, room, onSuccess }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
    defaultValues: { status: 'available', monthly_rate: 0 },
  })

  useEffect(() => {
    reset(room
      ? { room_number: room.room_number, floor: room.floor ?? '', type: room.type ?? '', monthly_rate: room.monthly_rate, status: room.status }
      : { room_number: '', floor: '', type: '', monthly_rate: 0, status: 'available' }
    )
  }, [room, open, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      const payload = { ...values, floor: values.floor || null, type: values.type || null, business_id: businessId }
      if (room) {
        const { error } = await supabase.from('rooms').update(payload).eq('id', room.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('rooms').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => { toast.success(room ? 'Room updated' : 'Room added'); onSuccess() },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{room ? 'Edit Room' : 'Add Room'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Room Number *</Label>
              <Input placeholder="101" {...register('room_number')} />
              {errors.room_number && <p className="text-xs text-destructive">{errors.room_number.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Floor</Label>
              <Input placeholder="1st" {...register('floor')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
              <Input placeholder="Studio, 1BR..." {...register('type')} />
            </div>
            <div className="space-y-2">
              <Label>Monthly Rate (₱)</Label>
              <Input type="number" step="0.01" min="0" {...register('monthly_rate')} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={watch('status')} onValueChange={(v: string | null) => setValue("status", (v ?? "available") as RoomStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Available</SelectItem>
                <SelectItem value="occupied">Occupied</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {room ? 'Save' : 'Add Room'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
