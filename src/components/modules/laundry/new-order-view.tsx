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
import { usePermission } from '@/hooks/use-permission'
import type { Service, OrderStatus, Customer, CustomerType, BusinessPerson, Position } from '@/types'

const schema = z.object({
  guest_name: z.string().optional(),
  guest_mobile: z.string().optional(),
  customer_id: z.string().optional(),
  assigned_to_person_id: z.string().optional(),
  service_id: z.string().min(1, 'Select a service'),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const CUSTOMER_TYPES: Array<{ value: CustomerType; label: string }> = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'guest', label: 'Guest' },
  { value: 'registered', label: 'Registered' },
]

interface Props {
  businessId: string
  services: Service[]
  statuses: OrderStatus[]
  customers: Customer[]
  people: Array<BusinessPerson & { positions?: Position | null }>
}

export function NewOrderView({ businessId, services, statuses, customers, people }: Props) {
  const router = useRouter()
  const canAssign = usePermission('orders.assign')
  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [customerType, setCustomerType] = useState<CustomerType>('walk_in')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
  })

  const computeTotal = () => {
    if (!selectedService) return 0
    return selectedService.price
  }

  const onSubmit = async (values: FormValues) => {
    if (!selectedService) return
    const selectedCustomer = values.customer_id
      ? customers.find(customer => customer.id === values.customer_id) ?? null
      : null

    if (customerType === 'guest' && !values.guest_name?.trim()) {
      toast.error('Enter a guest name before creating the order.')
      return
    }

    if (customerType === 'registered' && !selectedCustomer) {
      toast.error('Select or create a registered customer before creating the order.')
      return
    }

    const customerSnapshot =
      customerType === 'registered'
        ? {
            customerId: selectedCustomer?.id ?? null,
            name: selectedCustomer?.name ?? null,
            mobile: selectedCustomer?.contact_number ?? null,
          }
        : customerType === 'guest'
          ? {
              customerId: null,
              name: values.guest_name?.trim() ?? '',
              mobile: values.guest_mobile?.trim() || null,
            }
          : {
              customerId: null,
              name: 'Walk-in Customer',
              mobile: null,
            }

    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const defaultStatus = statuses.find(status => status.is_default) ?? statuses[0]
    const assignedPerson = values.assigned_to_person_id
      ? people.find(person => person.id === values.assigned_to_person_id) ?? null
      : null
    const assignedPosition = assignedPerson?.position_id ?? assignedPerson?.positions?.id ?? null

    const { error } = await supabase.from('orders').insert({
      business_id: businessId,
      customer_id: customerSnapshot.customerId,
      customer_type: customerType,
      customer_name: customerSnapshot.name,
      customer_contact: customerSnapshot.mobile,
      customer_name_snapshot: customerSnapshot.name,
      customer_mobile_snapshot: customerSnapshot.mobile,
      assigned_to_person_id: assignedPerson?.id ?? null,
      assigned_position_id: assignedPosition,
      service_id: values.service_id,
      status_id: defaultStatus?.id ?? null,
      total_amount: computeTotal(),
      notes: values.notes || null,
      received_at: new Date().toISOString(),
      created_by: user.id,
    })

    if (error) { toast.error(error.message); setLoading(false); return }

    toast.success('Order created successfully')
    router.push(`/${businessId}/orders`)
  }

  return (
    <div className="max-w-lg">
      <Button variant="ghost" className="mb-4 -ml-2 gap-2" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <h1 className="text-2xl font-bold mb-6">New Order</h1>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Customer Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {CUSTOMER_TYPES.map(type => (
                  <Button
                    key={type.value}
                    type="button"
                    variant={customerType === type.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 px-2 text-xs"
                    onClick={() => {
                      setCustomerType(type.value)
                      if (type.value !== 'registered') setValue('customer_id', '')
                    }}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </div>

            {customerType === 'guest' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Guest Name *</Label>
                  <Input placeholder="Raymond" {...register('guest_name')} />
                </div>
                <div className="space-y-2">
                  <Label>Mobile Number</Label>
                  <Input type="tel" placeholder="09XXXXXXXXX" {...register('guest_mobile')} />
                </div>
              </div>
            )}

            {customerType === 'registered' && (
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select onValueChange={(v: string | null) => setValue('customer_id', v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(customer => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
              </div>
            )}

            {customerType === 'walk_in' && (
              <p className="text-sm text-muted-foreground">Walk-in Customer</p>
            )}
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            {canAssign ? (
              <div className="space-y-2">
                <Label>Assigned To</Label>
                <Select onValueChange={(v: string | null) => setValue('assigned_to_person_id', v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {people.map(person => {
                      const positionName = person.position?.name ?? person.positions?.name
                      return (
                        <SelectItem key={person.id} value={person.id}>
                          {person.name}{positionName ? ` - ${positionName}` : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This order will be automatically assigned to you.
              </p>
            )}
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
                      {s.name} - {formatCurrency(s.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.service_id && <p className="text-xs text-destructive">{errors.service_id.message}</p>}
            </div>

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
