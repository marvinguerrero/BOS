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
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import type { Service } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  price: z.coerce.number().min(0),
  duration_minutes: z.preprocess(
    value => value === '' || value === null ? undefined : value,
    z.coerce.number().int().positive().optional()
  ),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  service: Service | null
  onSuccess: () => void
}

export function ServiceDialog({ open, onOpenChange, businessId, service, onSuccess }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
    defaultValues: { price: 0 },
  })

  useEffect(() => {
    reset(service
      ? {
          name: service.name,
          description: service.description ?? '',
          price: service.price,
          duration_minutes: service.duration_minutes ?? undefined,
        }
      : { name: '', description: '', price: 0, duration_minutes: undefined }
    )
  }, [service, open, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      const payload = {
        ...values,
        description: values.description || null,
        duration_minutes: values.duration_minutes || null,
      }
      if (service) {
        const { error } = await supabase.from('services').update(payload).eq('id', service.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('services').insert({ ...payload, business_id: businessId })
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
            <Label>Description</Label>
            <Textarea rows={2} placeholder="What this service includes..." {...register('description')} />
          </div>
          <div className="space-y-2">
            <Label>Price (₱)</Label>
            <Input type="number" step="0.01" min="0" {...register('price')} />
          </div>
          <div className="space-y-2">
            <Label>Duration (minutes)</Label>
            <Input type="number" step="1" min="1" placeholder="Optional" {...register('duration_minutes')} />
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
