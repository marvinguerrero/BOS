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
  owner_share_percent: z.preprocess(
    value => value === '' || value === null ? undefined : value,
    z.coerce.number().min(0).max(100).optional()
  ),
  worker_share_percent: z.preprocess(
    value => value === '' || value === null ? undefined : value,
    z.coerce.number().min(0).max(100).optional()
  ),
}).superRefine((values, ctx) => {
  const hasOwner = values.owner_share_percent !== undefined
  const hasWorker = values.worker_share_percent !== undefined
  if (hasOwner !== hasWorker) {
    ctx.addIssue({ code: 'custom', path: ['worker_share_percent'], message: 'Enter both split percentages or leave both blank.' })
  }
  if (hasOwner && hasWorker && values.owner_share_percent! + values.worker_share_percent! !== 100) {
    ctx.addIssue({ code: 'custom', path: ['worker_share_percent'], message: 'Owner and worker shares must total 100%.' })
  }
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  service: Service | null
  onSuccess: () => void
}

function getRevenueShare(service: Service | null) {
  const share = service?.revenue_share
  return Array.isArray(share) ? share[0] ?? null : share ?? null
}

export function ServiceDialog({ open, onOpenChange, businessId, service, onSuccess }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
    defaultValues: { price: 0 },
  })

  useEffect(() => {
    const revenueShare = getRevenueShare(service)
    reset(service
      ? {
          name: service.name,
          description: service.description ?? '',
          price: service.price,
          duration_minutes: service.duration_minutes ?? undefined,
          owner_share_percent: revenueShare?.owner_share_percent,
          worker_share_percent: revenueShare?.worker_share_percent,
        }
      : { name: '', description: '', price: 0, duration_minutes: undefined, owner_share_percent: undefined, worker_share_percent: undefined }
    )
  }, [service, open, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      const payload = {
        name: values.name,
        price: values.price,
        description: values.description || null,
        duration_minutes: values.duration_minutes || null,
      }
      let serviceId = service?.id
      if (service) {
        const { error } = await supabase.from('services').update(payload).eq('id', service.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('services')
          .insert({ ...payload, business_id: businessId })
          .select('id')
          .single()
        if (error) throw error
        serviceId = data.id
      }

      if (!serviceId) return
      if (values.owner_share_percent !== undefined && values.worker_share_percent !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('service_revenue_shares')
          .upsert({
            business_id: businessId,
            service_id: serviceId,
            owner_share_percent: values.owner_share_percent,
            worker_share_percent: values.worker_share_percent,
          }, { onConflict: 'service_id' })
        if (error) throw error
      } else if (service) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('service_revenue_shares')
          .delete()
          .eq('service_id', service.id)
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
          <div className="rounded-lg border p-3 space-y-3">
            <div>
              <p className="text-sm font-medium">Revenue Split Override</p>
              <p className="text-xs text-muted-foreground">Leave blank to use the business default.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Owner %</Label>
                <Input type="number" step="0.01" min="0" max="100" {...register('owner_share_percent')} />
              </div>
              <div className="space-y-2">
                <Label>Worker %</Label>
                <Input type="number" step="0.01" min="0" max="100" {...register('worker_share_percent')} />
              </div>
            </div>
            {errors.worker_share_percent && <p className="text-xs text-destructive">{errors.worker_share_percent.message}</p>}
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
