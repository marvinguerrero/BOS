import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { AccountDetailView } from '@/components/modules/financial/account-detail-view'
import type { FinancialAccount, AccountTransaction } from '@/types'

export const metadata: Metadata = { title: 'Account History' }

const PAGE_SIZE = 30

export default async function AccountDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessId: string; accountId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { businessId, accountId } = await params
  const sp = await searchParams
  const page = Math.max(1, parseInt((sp.page as string) ?? '1'))

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [accountResult, txnResult] = await Promise.all([
    db.from('financial_accounts').select('*').eq('id', accountId).eq('business_id', businessId).single(),
    db.from('account_transactions')
      .select('*', { count: 'exact' })
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .range(from, to),
  ])

  if (!accountResult.data) notFound()

  // For running balance: we need the sum of all transactions AFTER the current page's
  // oldest entry. Compute: balance at start of page = cached_balance - sum(newer txns).
  // Simpler: fetch sum of transactions after `to` index.
  const { data: newerTxns } = await db
    .from('account_transactions')
    .select('amount')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .range(0, from - 1) as { data: { amount: number }[] | null }

  const sumNewerTxns = (newerTxns ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0)
  const pageStartBalance = (accountResult.data as FinancialAccount).cached_balance - sumNewerTxns

  return (
    <AccountDetailView
      businessId={businessId}
      account={accountResult.data as FinancialAccount}
      transactions={(txnResult.data ?? []) as AccountTransaction[]}
      totalCount={(txnResult.count ?? 0) as number}
      page={page}
      pageSize={PAGE_SIZE}
      pageStartBalance={pageStartBalance}
    />
  )
}
