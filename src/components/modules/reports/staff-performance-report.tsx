'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { Award, Coins, DollarSign, HandCoins, Scissors } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { RevenueScope, StaffPerformanceRow } from '@/types'

type Period = 'today' | 'week' | 'month' | 'custom'

type CompensationRow = {
  order_id: string
  service_id: string | null
  worker_person_id: string | null
  worker_user_id: string | null
  service_amount: number
  worker_commission_amount: number
  worker_tip_amount: number
  worker_total_amount: number
  calculated_at: string
  worker_person?: {
    id: string
    name: string
    position_id: string | null
    position?: { id: string; name: string } | null
  } | null
}

interface Props {
  businessId: string
  revenueScope: RevenueScope
}

function getPeriodStart(period: Period, customStart: string) {
  const now = new Date()
  if (period === 'today') return startOfDay(now)
  if (period === 'week') return startOfWeek(now, { weekStartsOn: 1 })
  if (period === 'month') return startOfMonth(now)
  return customStart ? startOfDay(new Date(`${customStart}T00:00:00`)) : startOfMonth(now)
}

function getPeriodEnd(period: Period, customEnd: string) {
  if (period !== 'custom' || !customEnd) return null
  const end = new Date(`${customEnd}T23:59:59.999`)
  return Number.isNaN(end.getTime()) ? null : end
}

async function fetchCompensations(businessId: string, start: Date, end: Date | null) {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('order_compensations')
    .select(`
      order_id,
      service_id,
      worker_person_id,
      worker_user_id,
      service_amount,
      worker_commission_amount,
      worker_tip_amount,
      worker_total_amount,
      calculated_at,
      worker_person:business_people!order_compensations_worker_person_id_fkey(
        id,
        name,
        position_id,
        position:positions(id, name)
      )
    `)
    .eq('business_id', businessId)
    .gte('calculated_at', start.toISOString())

  if (end) query = query.lte('calculated_at', end.toISOString())

  const { data, error } = await query.order('calculated_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CompensationRow[]
}

function aggregateRows(rows: CompensationRow[]): StaffPerformanceRow[] {
  const map = new Map<string, StaffPerformanceRow & { services: Set<string>; orders: Set<string> }>()

  rows.forEach(row => {
    const key = row.worker_person_id ?? row.worker_user_id ?? 'unassigned'
    const existing = map.get(key)
    const worker = row.worker_person
    const next = existing ?? {
      workerPersonId: row.worker_person_id,
      workerUserId: row.worker_user_id,
      employeeName: worker?.name ?? 'Unassigned',
      positionId: worker?.position_id ?? null,
      positionName: worker?.position?.name ?? null,
      revenueGenerated: 0,
      commissionEarned: 0,
      tipsReceived: 0,
      totalEarnings: 0,
      servicesCompleted: 0,
      ordersCompleted: 0,
      services: new Set<string>(),
      orders: new Set<string>(),
    }

    next.revenueGenerated += row.service_amount
    next.commissionEarned += row.worker_commission_amount
    next.tipsReceived += row.worker_tip_amount
    next.totalEarnings += row.worker_total_amount
    if (row.service_id) next.services.add(row.service_id)
    next.orders.add(row.order_id)
    next.servicesCompleted = next.services.size
    next.ordersCompleted = next.orders.size
    map.set(key, next)
  })

  return [...map.values()]
    .map(({ services: _services, orders: _orders, ...row }) => row)
    .sort((a, b) => b.revenueGenerated - a.revenueGenerated)
}

function topLabel(rows: StaffPerformanceRow[], key: keyof Pick<StaffPerformanceRow, 'revenueGenerated' | 'totalEarnings' | 'servicesCompleted' | 'tipsReceived'>) {
  const top = [...rows].sort((a, b) => Number(b[key]) - Number(a[key]))[0]
  return top ? top.employeeName : 'No data'
}

export function StaffPerformanceReport({ businessId, revenueScope }: Props) {
  const [period, setPeriod] = useState<Period>('month')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('all')
  const [positionFilter, setPositionFilter] = useState('all')
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)

  const start = useMemo(() => getPeriodStart(period, customStart), [period, customStart])
  const end = useMemo(() => getPeriodEnd(period, customEnd), [period, customEnd])

  const { data: compensationRows = [], isLoading, error } = useQuery({
    queryKey: ['staff-performance', businessId, period, customStart, customEnd],
    queryFn: () => fetchCompensations(businessId, start, end),
    enabled: revenueScope.mode !== 'hidden',
  })

  const staffRows = useMemo(() => aggregateRows(compensationRows), [compensationRows])
  const visibleRows = staffRows.filter(row => {
    if (employeeFilter !== 'all' && row.workerPersonId !== employeeFilter) return false
    if (positionFilter !== 'all' && row.positionId !== positionFilter) return false
    return true
  })
  const selectedRow = visibleRows.find(row => row.workerPersonId === selectedEmployee) ?? visibleRows[0] ?? null
  const selectedTrendRows = selectedRow
    ? compensationRows.filter(row => row.worker_person_id === selectedRow.workerPersonId)
    : []
  const trendData = Object.entries(selectedTrendRows.reduce<Record<string, { date: string; revenue: number; earnings: number }>>((acc, row) => {
    const date = format(parseISO(row.calculated_at), 'MMM d')
    acc[date] ??= { date, revenue: 0, earnings: 0 }
    acc[date].revenue += row.service_amount
    acc[date].earnings += row.worker_total_amount
    return acc
  }, {})).map(([, value]) => value)

  const positions = [...new Map(staffRows
    .filter(row => row.positionId)
    .map(row => [row.positionId!, row.positionName ?? 'Unassigned Position'])
  )]

  const canFilterPeople = revenueScope.mode === 'business'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Staff Performance</h2>
          <p className="text-sm text-muted-foreground">
            Revenue, commissions, tips, and completed work from paid service orders.
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(value: string | null) => setPeriod((value ?? 'month') as Period)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Start</Label>
            <Input type="date" value={customStart} onChange={event => setCustomStart(event.target.value)} disabled={period !== 'custom'} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End</Label>
            <Input type="date" value={customEnd} onChange={event => setCustomEnd(event.target.value)} disabled={period !== 'custom'} />
          </div>
          {canFilterPeople && (
            <div className="space-y-1">
              <Label className="text-xs">Employee</Label>
              <Select value={employeeFilter} onValueChange={(value: string | null) => setEmployeeFilter(value ?? 'all')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {staffRows.filter(row => row.workerPersonId).map(row => (
                    <SelectItem key={row.workerPersonId!} value={row.workerPersonId!}>{row.employeeName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {canFilterPeople && (
            <div className="space-y-1">
              <Label className="text-xs">Position</Label>
              <Select value={positionFilter} onValueChange={(value: string | null) => setPositionFilter(value ?? 'all')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Positions</SelectItem>
                  {positions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Top Revenue Generator</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground" /><p className="font-semibold">{topLabel(visibleRows, 'revenueGenerated')}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Top Earner</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2"><Coins className="h-4 w-4 text-muted-foreground" /><p className="font-semibold">{topLabel(visibleRows, 'totalEarnings')}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Most Services Completed</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2"><Scissors className="h-4 w-4 text-muted-foreground" /><p className="font-semibold">{topLabel(visibleRows, 'servicesCompleted')}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Most Tips Received</CardTitle></CardHeader>
          <CardContent className="flex items-center gap-2"><HandCoins className="h-4 w-4 text-muted-foreground" /><p className="font-semibold">{topLabel(visibleRows, 'tipsReceived')}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Staff Performance</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Position</TableHead>
                <TableHead className="text-right">Revenue Generated</TableHead>
                <TableHead className="text-right">Commission Earned</TableHead>
                <TableHead className="text-right">Tips Received</TableHead>
                <TableHead className="text-right">Total Earnings</TableHead>
                <TableHead className="text-right">Services</TableHead>
                <TableHead className="text-right">Orders</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Loading performance...</TableCell></TableRow>
              ) : visibleRows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No paid service performance in this range.</TableCell></TableRow>
              ) : visibleRows.map(row => (
                <TableRow
                  key={row.workerPersonId ?? row.workerUserId ?? row.employeeName}
                  className="cursor-pointer"
                  onClick={() => setSelectedEmployee(row.workerPersonId)}
                >
                  <TableCell className="font-medium">{row.employeeName}</TableCell>
                  <TableCell>{row.positionName ?? 'Unassigned'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.revenueGenerated)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.commissionEarned)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.tipsReceived)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(row.totalEarnings)}</TableCell>
                  <TableCell className="text-right">{row.servicesCompleted}</TableCell>
                  <TableCell className="text-right">{row.ordersCompleted}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedRow && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award className="h-4 w-4" />
              {selectedRow.employeeName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div><p className="text-xs text-muted-foreground">Services Completed</p><p className="text-xl font-bold">{selectedRow.servicesCompleted}</p></div>
              <div><p className="text-xs text-muted-foreground">Revenue Generated</p><p className="text-xl font-bold">{formatCurrency(selectedRow.revenueGenerated)}</p></div>
              <div><p className="text-xs text-muted-foreground">Commission Earned</p><p className="text-xl font-bold">{formatCurrency(selectedRow.commissionEarned)}</p></div>
              <div><p className="text-xs text-muted-foreground">Tips Received</p><p className="text-xl font-bold">{formatCurrency(selectedRow.tipsReceived)}</p></div>
              <div><p className="text-xs text-muted-foreground">Total Earnings</p><p className="text-xl font-bold">{formatCurrency(selectedRow.totalEarnings)}</p></div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trendData}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => formatCurrency(value as number)} />
                <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="earnings" name="Earnings" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
