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
import { createClient } from '@/lib/supabase/client'
import type { Customer } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact_number: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  customer: Customer | null
  onSuccess: () => void
}

export function CustomerDialog({ open, onOpenChange, businessId, customer, onSuccess }: Props) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    reset(customer ? { name: customer.name, contact_number: customer.contact_number ?? '' } : { name: '', contact_number: '' })
  }, [customer, open, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      const payload = { ...values, contact_number: values.contact_number || null, business_id: businessId }
      if (customer) {
        const { error } = await supabase.from('customers').update(payload).eq('id', customer.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => { toast.success(customer ? 'Customer updated' : 'Customer added'); onSuccess() },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{customer ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input placeholder="Customer name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Contact Number</Label>
            <Input type="tel" placeholder="09XXXXXXXXX" {...register('contact_number')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {customer ? 'Save' : 'Add Customer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
