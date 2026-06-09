'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { subDays, format, parseISO, subMonths } from 'date-fns'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

type SaleReportRow = {
  total: number
  created_at: string
  payment_method: string
  payment_status: string | null
  customer_id: string | null
  customer_type: string | null
  customer_name_snapshot: string | null
}

interface Props {
  businessId: string
  modelKeys: string[]
}

async function fetchSalesReport(businessId: string, days: number) {
  const supabase = createClient()
  const start = subDays(new Date(), days).toISOString()
  const { data } = await supabase
    .from('sales')
    .select('total, created_at, payment_method, payment_status, customer_id, customer_type, customer_name_snapshot')
    .eq('business_id', businessId)
    .gte('created_at', start)
  return data ?? []
}

async function fetchLaundryReport(businessId: string, days: number) {
  const supabase = createClient()
  const start = subDays(new Date(), days).toISOString()
  const { data } = await supabase
    .from('orders')
    .select('total_amount, created_at, order_statuses(name), services(name)')
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

export function ReportsView({ businessId, modelKeys }: Props) {
  const [period, setPeriod] = useState('30')
  const hasRetail = modelKeys.includes('retail')
  const hasService = modelKeys.includes('service')
  const hasRental = modelKeys.includes('rental')
  const hasPeriodReports = hasRetail || hasService

  const { data: salesData = [] } = useQuery({
    queryKey: ['report-sales', businessId, period],
    queryFn: () => fetchSalesReport(businessId, parseInt(period)),
    enabled: hasRetail,
  })

  const { data: laundryData = [] } = useQuery({
    queryKey: ['report-laundry', businessId, period],
    queryFn: () => fetchLaundryReport(businessId, parseInt(period)),
    enabled: hasService,
  })

  const { data: rentData = [] } = useQuery({
    queryKey: ['report-rent', businessId],
    queryFn: () => fetchRentReport(businessId),
    enabled: hasRental,
  })

  // Group sales by day
  const salesByDay = (() => {
    const map: Record<string, number> = {}
    ;(salesData as SaleReportRow[]).forEach((s) => {
      const d = format(parseISO(s.created_at), 'MMM d')
      map[d] = (map[d] ?? 0) + s.total
    })
    return Object.entries(map).map(([date, revenue]) => ({ date, revenue }))
  })()

  // Payment method breakdown
  const paymentBreakdown = (() => {
    const map: Record<string, number> = {}
    ;(salesData as SaleReportRow[]).forEach((s) => { map[s.payment_method] = (map[s.payment_method] ?? 0) + 1 })
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  })()

  const customerTypeCounts = (() => {
    const counts = { walk_in: 0, guest: 0, registered: 0 }
    ;(salesData as SaleReportRow[]).forEach((sale) => {
      const type = sale.customer_type ??
        (sale.customer_id
          ? 'registered'
          : sale.customer_name_snapshot && sale.customer_name_snapshot !== 'Walk-in Customer'
            ? 'guest'
            : 'walk_in')
      if (type === 'guest' || type === 'registered' || type === 'walk_in') counts[type] += 1
    })
    return counts
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
  const creditSales = (salesData as SaleReportRow[]).filter(s => s.payment_method === 'credit' || s.payment_status === 'outstanding').length

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reports</h1>
        {hasPeriodReports && (
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

      {/* Retail Reports */}
      {hasRetail && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Credit Sales</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{creditSales}</p></CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Walk-in Sales</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{customerTypeCounts.walk_in}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Guest Sales</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{customerTypeCounts.guest}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Registered Customer Sales</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{customerTypeCounts.registered}</p></CardContent>
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

      {/* Service Reports */}
      {hasService && (
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

      {/* Rental Reports */}
      {hasRental && (
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
