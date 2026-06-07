'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { LaundryService } from '@/types'

const schema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_contact: z.string().optional(),
  service_id: z.string().min(1, 'Select a service'),
  weight_kg: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

interface Props { businessId: string; services: LaundryService[] }

export function NewOrderView({ businessId, services }: Props) {
  const router = useRouter()
  const [selectedService, setSelectedService] = useState<LaundryService | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
  })

  const weightKg = watch('weight_kg')

  const computeTotal = () => {
    if (!selectedService) return 0
    if (selectedService.pricing_type === 'per_kg') return selectedService.price * (weightKg ?? 0)
    return selectedService.price
  }

  const onSubmit = async (values: FormValues) => {
    if (!selectedService) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase.from('laundry_orders').insert({
      business_id: businessId,
      customer_name: values.customer_name,
      customer_contact: values.customer_contact || null,
      service_id: values.service_id,
      weight_kg: values.weight_kg || null,
      total_amount: computeTotal(),
      status: 'received',
      notes: values.notes || null,
      received_at: new Date().toISOString(),
      created_by: user.id,
    })

    if (error) { toast.error(error.message); setLoading(false); return }

    toast.success('Order created successfully')
    router.push(`/${businessId}/laundry/orders`)
  }

  return (
    <div className="max-w-lg">
      <Button variant="ghost" className="mb-4 -ml-2 gap-2" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <h1 className="text-2xl font-bold mb-6">New Laundry Order</h1>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Name *</Label>
              <Input placeholder="Juan dela Cruz" {...register('customer_name')} />
              {errors.customer_name && <p className="text-xs text-destructive">{errors.customer_name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Contact Number</Label>
              <Input type="tel" placeholder="09XXXXXXXXX" {...register('customer_contact')} />
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Service Type *</Label>
              <Select onValueChange={(v: string | null) => {
                setValue("service_id", v ?? "")
                setSelectedService(services.find(s => s.id === (v ?? "")) ?? null)
              }}>
                <SelectTrigger><SelectValue placeholder="Select service" /></SelectTrigger>
                <SelectContent>
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {formatCurrency(s.price)}{s.pricing_type === 'per_kg' ? '/kg' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.service_id && <p className="text-xs text-destructive">{errors.service_id.message}</p>}
            </div>

            {selectedService?.pricing_type === 'per_kg' && (
              <div className="space-y-2">
                <Label>Weight (kg) *</Label>
                <Input type="number" step="0.1" min="0" placeholder="0.0" {...register('weight_kg')} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input placeholder="Special instructions..." {...register('notes')} />
            </div>

            {selectedService && (
              <>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total</span>
                  <span className="text-xl font-bold text-primary">{formatCurrency(computeTotal())}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Button type="submit" className="w-full mt-4" size="lg" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Order
        </Button>
      </form>
    </div>
  )
}
