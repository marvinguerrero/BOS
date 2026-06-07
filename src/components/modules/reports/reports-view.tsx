'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { subDays, format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import type { BusinessTemplateKey } from '@/types'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface Props {
  businessId: string
  templateKey: BusinessTemplateKey
}

async function fetchSalesReport(businessId: string, days: number) {
  const supabase = createClient()
  const start = subDays(new Date(), days).toISOString()
  const { data } = await supabase
    .from('sales')
    .select('total, created_at, payment_method')
    .eq('business_id', businessId)
    .gte('created_at', start)
  return data ?? []
}

async function fetchLaundryReport(businessId: string, days: number) {
  const supabase = createClient()
  const start = subDays(new Date(), days).toISOString()
  const { data } = await supabase
    .from('laundry_orders')
    .select('total_amount, created_at, status, laundry_services(name)')
    .eq('business_id', businessId)
    .gte('created_at', start)
  return data ?? []
}

async function fetchRentReport(businessId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('rent_payments')
    .select('amount, created_at')
    .eq('business_id', businessId)
    .gte('created_at', subMonths(new Date(), 6).toISOString())
  return data ?? []
}

export function ReportsView({ businessId, templateKey }: Props) {
  const [period, setPeriod] = useState('30')

  const { data: salesData = [] } = useQuery({
    queryKey: ['report-sales', businessId, period],
    queryFn: () => fetchSalesReport(businessId, parseInt(period)),
    enabled: templateKey === 'sari_sari',
  })

  const { data: laundryData = [] } = useQuery({
    queryKey: ['report-laundry', businessId, period],
    queryFn: () => fetchLaundryReport(businessId, parseInt(period)),
    enabled: templateKey === 'laundry',
  })

  const { data: rentData = [] } = useQuery({
    queryKey: ['report-rent', businessId],
    queryFn: () => fetchRentReport(businessId),
    enabled: templateKey === 'room_rental',
  })

  // Group sales by day
  const salesByDay = (() => {
    const map: Record<string, number> = {}
    salesData.forEach((s: { created_at: string; total: number; payment_method: string }) => {
      const d = format(parseISO(s.created_at), 'MMM d')
      map[d] = (map[d] ?? 0) + s.total
    })
    return Object.entries(map).map(([date, revenue]) => ({ date, revenue }))
  })()

  // Payment method breakdown
  const paymentBreakdown = (() => {
    const map: Record<string, number> = {}
    salesData.forEach((s: { created_at: string; total: number; payment_method: string }) => { map[s.payment_method] = (map[s.payment_method] ?? 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  })()

  // Laundry orders by day
  const laundryByDay = (() => {
    const map: Record<string, number> = {}
    laundryData.forEach((o: { created_at: string; total_amount: number }) => {
      const d = format(parseISO(o.created_at), 'MMM d')
      map[d] = (map[d] ?? 0) + o.total_amount
    })
    return Object.entries(map).map(([date, revenue]) => ({ date, revenue }))
  })()

  // Rent collection by month
  const rentByMonth = (() => {
    const map: Record<string, number> = {}
    rentData.forEach((p: { created_at: string; amount: number }) => {
      const m = format(parseISO(p.created_at), 'MMM yyyy')
      map[m] = (map[m] ?? 0) + p.amount
    })
    return Object.entries(map).map(([month, amount]) => ({ month, amount }))
  })()

  const totalSales = salesData.reduce((s: number, d: { total: number }) => s + d.total, 0)
  const totalLaundry = laundryData.reduce((s: number, d: { total_amount: number }) => s + d.total_amount, 0)
  const totalRent = rentData.reduce((s: number, d: { amount: number }) => s + d.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        {templateKey !== 'room_rental' && (
          <Select value={period} onValueChange={(v: string | null) => setPeriod(v ?? "30")}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Sari-Sari Reports */}
      {templateKey === 'sari_sari' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatCurrency(totalSales)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Transactions</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{salesData.length}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg. per Transaction</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatCurrency(salesData.length > 0 ? totalSales / salesData.length : 0)}</p></CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">Daily Sales</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={salesByDay}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Payment Methods</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={paymentBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {paymentBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Laundry Reports */}
      {templateKey === 'laundry' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatCurrency(totalLaundry)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Orders</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{laundryData.length}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Completed</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{laundryData.filter((o: { status: string }) => o.status === 'claimed').length}</p></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Daily Revenue</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={laundryByDay}>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Room Rental Reports */}
      {templateKey === 'room_rental' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">6-Month Collection</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatCurrency(totalRent)}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg. Monthly</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{formatCurrency(rentByMonth.length > 0 ? totalRent / rentByMonth.length : 0)}</p></CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle className="text-sm">Monthly Collections (Last 6 Months)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={rentByMonth}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => formatCurrency(v as number)} />
                  <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
