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
import type { LaundryService } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  pricing_type: z.enum(['fixed', 'per_kg']),
  price: z.coerce.number().min(0),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  service: LaundryService | null
  onSuccess: () => void
}

export function ServiceDialog({ open, onOpenChange, businessId, service, onSuccess }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
    defaultValues: { pricing_type: 'fixed', price: 0 },
  })

  useEffect(() => {
    reset(service ? { name: service.name, pricing_type: service.pricing_type, price: service.price } : { name: '', pricing_type: 'fixed', price: 0 })
  }, [service, open, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      if (service) {
        const { error } = await supabase.from('laundry_services').update(values).eq('id', service.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('laundry_services').insert({ ...values, business_id: businessId })
        if (error) throw error
      }
    },
    onSuccess: () => { toast.success(service ? 'Service updated' : 'Service added'); onSuccess() },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{service ? 'Edit Service' : 'Add Service'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Service Name *</Label>
            <Input placeholder="e.g. Wash & Dry" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Pricing Type</Label>
            <Select value={watch('pricing_type')} onValueChange={(v: string | null) => setValue("pricing_type", (v ?? "fixed") as "fixed" | "per_kg")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed Rate</SelectItem>
                <SelectItem value="per_kg">Per Kilogram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Price (₱) {watch('pricing_type') === 'per_kg' ? '/ kg' : ''}</Label>
            <Input type="number" step="0.01" min="0" {...register('price')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {service ? 'Save' : 'Add Service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
