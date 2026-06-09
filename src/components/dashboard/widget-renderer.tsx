'use client'

import dynamic from 'next/dynamic'
import type { DashboardWidgetConfig, RevenueScope } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const RevenueWidget = dynamic(() => import('../widgets/revenue-widget').then(m => m.RevenueWidget), { ssr: false })
const TransactionsWidget = dynamic(() => import('../widgets/transactions-widget').then(m => m.TransactionsWidget), { ssr: false })
const LowStockWidget = dynamic(() => import('../widgets/low-stock-widget').then(m => m.LowStockWidget), { ssr: false })
const OutstandingBalanceWidget = dynamic(() => import('../widgets/outstanding-balance-widget').then(m => m.OutstandingBalanceWidget), { ssr: false })
const SalesTrendWidget = dynamic(() => import('../widgets/sales-trend-widget').then(m => m.SalesTrendWidget), { ssr: false })
const TopProductsWidget = dynamic(() => import('../widgets/top-products-widget').then(m => m.TopProductsWidget), { ssr: false })
const LaundryQueueWidget = dynamic(() => import('../widgets/laundry-queue-widget').then(m => m.LaundryQueueWidget), { ssr: false })
const OccupancyWidget = dynamic(() => import('../widgets/occupancy-widget').then(m => m.OccupancyWidget), { ssr: false })
const OverdueBillsWidget = dynamic(() => import('../widgets/overdue-bills-widget').then(m => m.OverdueBillsWidget), { ssr: false })
const CollectionsByAccountWidget = dynamic(() => import('../widgets/collections-by-account-widget').then(m => m.CollectionsByAccountWidget), { ssr: false })
const AccountBalancesWidget = dynamic(() => import('../widgets/account-balances-widget').then(m => m.AccountBalancesWidget), { ssr: false })

interface WidgetRendererProps {
  widget: DashboardWidgetConfig
  businessId: string
  revenueScope: RevenueScope
}

export function WidgetRenderer({ widget, businessId, revenueScope }: WidgetRendererProps) {
  const props = { businessId, widget, revenueScope }

  switch (widget.type) {
    case 'revenue_today':
    case 'revenue_month':
      return <RevenueWidget {...props} />
    case 'transactions_today':
    case 'orders_today':
      return <TransactionsWidget {...props} />
    case 'low_stock':
      return <LowStockWidget {...props} />
    case 'outstanding_balance':
      return <OutstandingBalanceWidget {...props} />
    case 'sales_trend':
    case 'collection_trend':
      return <SalesTrendWidget {...props} />
    case 'top_products':
      return <TopProductsWidget {...props} />
    case 'laundry_queue':
    case 'laundry_ready':
    case 'service_breakdown':
      return <LaundryQueueWidget {...props} />
    case 'occupancy_rate':
    case 'available_rooms':
      return <OccupancyWidget {...props} />
    case 'overdue_bills':
    case 'upcoming_dues':
      return <OverdueBillsWidget {...props} />
    case 'collections_by_account_today':
    case 'collections_by_account_month':
      return <CollectionsByAccountWidget {...props} />
    case 'account_balances':
      return <AccountBalancesWidget {...props} />
    default:
      return (
        <Card>
          <CardHeader><CardTitle className="text-sm">{widget.title}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground">Widget coming soon</p></CardContent>
        </Card>
      )
  }
}
