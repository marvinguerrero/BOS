import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { SalesHistoryView } from '@/components/modules/sales/sales-history-view'

export const metadata: Metadata = { title: 'Sales History' }

const PAGE_SIZE = 25

function getDateRange(range: string | undefined): { from: string; to: string } | null {
  const now = new Date()
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return { from: start.toISOString(), to: now.toISOString() }
  }
  if (range === 'week') {
    const start = new Date(now)
    start.setDate(start.getDate() - 7)
    return { from: start.toISOString(), to: now.toISOString() }
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: start.toISOString(), to: now.toISOString() }
  }
  return null
}

export default async function SalesHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { businessId } = await params
  const sp = await searchParams

  const page = Math.max(1, parseInt((sp.page as string) ?? '1'))
  const q = (sp.q as string) ?? ''
  const dateRange = (sp.dateRange as string) ?? ''
  const statusFilter = (sp.status as string) ?? ''

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  let query = supabase
    .from('sales')
    .select('id, receipt_number, created_at, customer_id, customer_name_snapshot, customers(name), sale_items(id), total, payment_method, status, payment_status, balance_amount, cashier_id', { count: 'exact' })
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .range(from, to)

  const dateWindow = getDateRange(dateRange)
  if (dateWindow) {
    query = query.gte('created_at', dateWindow.from).lte('created_at', dateWindow.to)
  }

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter)
  } else {
    // Default: hide voided rows (show on explicit filter)
    query = query.neq('status', 'voided')
  }

  if (q) {
    query = query.or(`receipt_number.ilike.%${q}%,customer_name_snapshot.ilike.%${q}%`)
  }

  // Revenue total for current filter (separate non-paginated query for the summary)
  let revenueQuery = supabase
    .from('sales')
    .select('total')
    .eq('business_id', businessId)
    .neq('status', 'voided')

  if (dateWindow) {
    revenueQuery = revenueQuery.gte('created_at', dateWindow.from).lte('created_at', dateWindow.to)
  }

  const [{ data: sales, count }, { data: revenueRows }, { data: people }] = await Promise.all([
    query,
    revenueQuery,
    supabase.from('business_people').select('user_id, name').eq('business_id', businessId).eq('is_active', true),
  ])

  const totalRevenue = (revenueRows ?? []).reduce((s: number, r: { total: number }) => s + r.total, 0)

  const peopleByUserId = new Map((people ?? []).map(p => [p.user_id, p.name]))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salesWithCashier = (sales ?? []).map((sale: any) => ({
    ...sale,
    cashier_name: sale.cashier_id ? (peopleByUserId.get(sale.cashier_id) ?? null) : null,
  }))

  return (
    <SalesHistoryView
      businessId={businessId}
      sales={salesWithCashier}
      totalCount={count ?? 0}
      totalRevenue={totalRevenue}
      page={page}
      pageSize={PAGE_SIZE}
      currentQ={q}
      currentDateRange={dateRange}
      currentStatus={statusFilter}
    />
  )
}
