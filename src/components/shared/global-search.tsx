'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, Package, Users, ClipboardList, DoorOpen } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { useBusinessStore } from '@/stores/business.store'
import type { SearchResult } from '@/types'
import { useDebounce } from '@/lib/hooks/use-debounce'

interface Props { businessId: string }

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  product: Package,
  customer: Users,
  order: ClipboardList,
  room: DoorOpen,
  tenant: Users,
}

async function search(businessId: string, query: string, modelKeys: string[]): Promise<SearchResult[]> {
  if (!query.trim() || query.length < 2) return []
  const supabase = createClient()
  const results: SearchResult[] = []
  const hasRetail = modelKeys.includes('retail')
  const hasService = modelKeys.includes('service')
  const hasRental = modelKeys.includes('rental')

  // Search products
  if (hasRetail) {
    const { data: products } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .ilike('name', `%${query}%`)
      .limit(5)
    products?.forEach((p: { id: string; name: string; sku?: string }) => results.push({ type: 'product', id: p.id, title: p.name, subtitle: p.sku ? `SKU: ${p.sku}` : undefined, href: `/${businessId}/inventory/products` }))
  }

  // Search customers across all business models
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, contact_number')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .ilike('name', `%${query}%`)
    .limit(5)
  customers?.forEach((c: { id: string; name: string; contact_number?: string | null }) => results.push({ type: 'customer', id: c.id, title: c.name, subtitle: c.contact_number ?? undefined, href: `/${businessId}/customers` }))

  // Search service orders
  if (hasService) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, customer_name, customer_name_snapshot, order_statuses(name)')
      .eq('business_id', businessId)
      .or(`customer_name.ilike.%${query}%,customer_name_snapshot.ilike.%${query}%`)
      .limit(5)
    orders?.forEach((o: { id: string; customer_name: string | null; customer_name_snapshot?: string | null; order_statuses?: { name: string } | null }) => results.push({
      type: 'order',
      id: o.id,
      title: o.customer_name_snapshot ?? o.customer_name ?? 'Walk-in Customer',
      subtitle: o.order_statuses?.name ? `Status: ${o.order_statuses.name}` : undefined,
      href: `/${businessId}/orders`,
    }))
  }

  // Search rooms & tenants
  if (hasRental) {
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, room_number, status')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .ilike('room_number', `%${query}%`)
      .limit(3)
    rooms?.forEach((r: { id: string; room_number: string; status: string }) => results.push({ type: 'room', id: r.id, title: `Room ${r.room_number}`, subtitle: r.status, href: `/${businessId}/rooms` }))

    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, contact_number')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .ilike('name', `%${query}%`)
      .limit(5)
    tenants?.forEach((t: { id: string; name: string; contact_number?: string | null }) => results.push({ type: 'tenant', id: t.id, title: t.name, subtitle: t.contact_number ?? undefined, href: `/${businessId}/tenants` }))
  }

  return results
}

export function GlobalSearch({ businessId }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const debouncedQuery = useDebounce(query, 300)
  const modelKeys = useBusinessStore(s => s.modelKeys)

  useEffect(() => {
    if (!debouncedQuery) return
    search(businessId, debouncedQuery, modelKeys)
      .then(setResults)
  }, [debouncedQuery, businessId, modelKeys])

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Search</h1>
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          placeholder="Search products, customers, orders..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-10 h-12 text-base"
          autoFocus
        />
      </div>

      {results.length === 0 && debouncedQuery.length >= 2 && (
        <p className="text-center text-muted-foreground py-8">No results for &quot;{debouncedQuery}&quot;</p>
      )}

      {debouncedQuery && results.length > 0 && (
        <div className="space-y-2">
          {results.map(result => {
            const Icon = TYPE_ICONS[result.type] ?? Search
            return (
              <Link key={result.id} href={result.href}>
                <Card className="hover:border-primary hover:shadow-sm transition-all cursor-pointer">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{result.title}</p>
                      {result.subtitle && <p className="text-xs text-muted-foreground">{result.subtitle}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{result.type}</span>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {!debouncedQuery && (
        <p className="text-center text-muted-foreground">Type to search across your business data</p>
      )}
    </div>
  )
}
