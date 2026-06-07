'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import type { Product, Category } from '@/types'
import { useMutation } from '@tanstack/react-query'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().optional(),
  category_id: z.string().optional(),
  cost_price: z.coerce.number().min(0, 'Must be 0 or more'),
  selling_price: z.coerce.number().min(0, 'Must be 0 or more'),
  stock_quantity: z.coerce.number().int().min(0),
  low_stock_threshold: z.coerce.number().int().min(0),
})
type FormValues = z.infer<typeof schema>

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  businessId: string
  categories: Category[]
  product: Product | null
  onSuccess: () => void
}

export function ProductDialog({ open, onOpenChange, businessId, categories, product, onSuccess }: Props) {
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as import("react-hook-form").Resolver<FormValues>,
    defaultValues: { cost_price: 0, selling_price: 0, stock_quantity: 0, low_stock_threshold: 5 },
  })

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        sku: product.sku ?? '',
        category_id: product.category_id ?? '',
        cost_price: product.cost_price,
        selling_price: product.selling_price,
        stock_quantity: product.stock_quantity,
        low_stock_threshold: product.low_stock_threshold,
      })
    } else {
      reset({ cost_price: 0, selling_price: 0, stock_quantity: 0, low_stock_threshold: 5 })
    }
  }, [product, open, reset])

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient()
      const payload = {
        ...values,
        sku: values.sku || null,
        category_id: values.category_id || null,
        business_id: businessId,
      }
      if (product) {
        const { error } = await supabase.from('products').update(payload).eq('id', product.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.success(product ? 'Product updated' : 'Product added')
      onSuccess()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'Add Product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(v => mutation.mutate(v))} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input placeholder="Product name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>SKU</Label>
              <Input placeholder="Optional" {...register('sku')} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={watch('category_id') ?? ''} onValueChange={(v: string | null) => setValue("category_id", v ?? "")}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cost Price (₱)</Label>
              <Input type="number" step="0.01" min="0" {...register('cost_price')} />
              {errors.cost_price && <p className="text-xs text-destructive">{errors.cost_price.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Selling Price (₱)</Label>
              <Input type="number" step="0.01" min="0" {...register('selling_price')} />
              {errors.selling_price && <p className="text-xs text-destructive">{errors.selling_price.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Stock Quantity</Label>
              <Input type="number" min="0" {...register('stock_quantity')} />
            </div>
            <div className="space-y-2">
              <Label>Low Stock Alert</Label>
              <Input type="number" min="0" {...register('low_stock_threshold')} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {product ? 'Save Changes' : 'Add Product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
