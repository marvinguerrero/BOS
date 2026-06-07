'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Package, Edit, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/utils/currency'
import type { Product, Category } from '@/types'
import { ProductDialog } from './product-dialog'

interface Props {
  businessId: string
  initialProducts: Product[]
  categories: Category[]
}

async function fetchProducts(businessId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('products')
    .select('*, categories(name)')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as Product[]
}

export function ProductsView({ businessId, initialProducts, categories }: Props) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  const { data: products = initialProducts } = useQuery({
    queryKey: ['products', businessId],
    queryFn: () => fetchProducts(businessId),
    initialData: initialProducts,
  })

  const archiveMutation = useMutation({
    mutationFn: async (productId: string) => {
      const supabase = createClient()
      await supabase.from('products').update({ is_active: false }).eq('id', productId)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products', businessId] })
      toast.success('Product archived')
    },
  })

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  )

  const lowStock = products.filter(p => p.stock_quantity <= p.low_stock_threshold)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-muted-foreground text-sm">{products.length} products</p>
        </div>
        <Button onClick={() => { setEditProduct(null); setDialogOpen(true) }} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {lowStock.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-center gap-2">
          <Package className="h-4 w-4 text-amber-600" />
          <p className="text-sm text-amber-700">
            <span className="font-semibold">{lowStock.length} item{lowStock.length !== 1 ? 's' : ''}</span> running low on stock
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {search ? 'No products found' : 'No products yet. Add your first product.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(product => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.name}</p>
                          {product.sku && <p className="text-xs text-muted-foreground">SKU: {product.sku}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {(product as Product & { categories?: { name: string } }).categories?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{formatCurrency(product.cost_price)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(product.selling_price)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={
                          product.stock_quantity === 0 ? 'destructive' :
                          product.stock_quantity <= product.low_stock_threshold ? 'secondary' :
                          'outline'
                        }>
                          {formatNumber(product.stock_quantity)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => { setEditProduct(product); setDialogOpen(true) }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => archiveMutation.mutate(product.id)}
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <ProductDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        businessId={businessId}
        categories={categories}
        product={editProduct}
        onSuccess={() => {
          setDialogOpen(false)
          qc.invalidateQueries({ queryKey: ['products', businessId] })
        }}
      />
    </div>
  )
}
