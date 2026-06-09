'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'
import { OrderPaymentDialog } from './order-payment-dialog'
import type { FinancialAccount, Order, OrderPayment, OrderStatus, UserRole, WorkflowTransition } from '@/types'

const STATUS_COLOR_CLASS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  green: 'bg-green-100 text-green-700',
  teal: 'bg-teal-100 text-teal-700',
  purple: 'bg-purple-100 text-purple-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-100 text-slate-700',
}

interface NextStep {
  status: OrderStatus
  label: string
}

function getAllowedNextStatuses(
  currentStatusId: string | null | undefined,
  sortedStatuses: OrderStatus[],
  transitions: WorkflowTransition[],
): NextStep[] {
  if (!currentStatusId) return []
  const statusById = new Map(sortedStatuses.map(s => [s.id, s]))
  const current = statusById.get(currentStatusId)
  if (!current) return []

  if (transitions.length === 0) {
    const next = sortedStatuses.find(s => s.sort_order > current.sort_order)
    return next ? [{ status: next, label: next.name }] : []
  }

  return transitions
    .filter(t => t.from_status_id === currentStatusId || t.from_status_id === null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap(t => {
      const status = statusById.get(t.to_status_id)
      return status ? [{ status, label: t.label ?? status.name }] : []
    })
}

interface Props {
  businessId: string
  initialOrders: Order[]
  statuses: OrderStatus[]
  transitions: WorkflowTransition[]
  financialAccounts: FinancialAccount[]
  currentUserId: string
  currentPersonId: string | null
  role: UserRole
  canUpdateOrders: boolean
  paymentCorrectionLimitMinutes: number
}

export function LaundryOrdersView({
  businessId,
  initialOrders,
  statuses,
  transitions,
  financialAccounts,
  currentUserId,
  currentPersonId,
  role,
  canUpdateOrders,
  paymentCorrectionLimitMinutes,
}: Props) {
  const router = useRouter()
  const [orders, setOrders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [paymentTarget, setPaymentTarget] = useState<Order | null>(null)
  const [correctionTarget, setCorrectionTarget] = useState<{ order: Order; payment: OrderPayment } | null>(null)

  useEffect(() => {
    setOrders(initialOrders)
  }, [initialOrders])

  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
  const statusById = new Map(sortedStatuses.map(status => [status.id, status]))
  const defaultStatus = sortedStatuses.find(status => status.is_default) ?? sortedStatuses[0]
  const getEffectiveStatus = (order: Order) => {
    const storedStatus = order.status_id ? statusById.get(order.status_id) : undefined
    return storedStatus ?? (order.assigned_to_person_id ? defaultStatus : undefined)
  }
  const filtered = statusFilter === 'all'
    ? orders
    : orders.filter(order => getEffectiveStatus(order)?.id === statusFilter)
  const canManageWorkflow = role === 'owner' || role === 'manager'
  const canActOnOrder = (order: Order) => {
    if (order.completed_at) return false
    if (canManageWorkflow) return true
    if (!canUpdateOrders) return false
    return Boolean(
      currentPersonId && order.assigned_to_person_id === currentPersonId
    ) || order.assigned_person?.user_id === currentUserId
  }
  const getActivePayment = (order: Order) =>
    [...(order.order_payments ?? [])]
      .filter(payment => payment.status === 'active')
      .sort((a, b) => new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime())[0] ?? null

  const canCorrectPayment = (payment: OrderPayment) => {
    if (canManageWorkflow) return true
    if (payment.collected_by !== currentUserId) return false
    const deadline = new Date(payment.collected_at).getTime() + paymentCorrectionLimitMinutes * 60 * 1000
    return Date.now() <= deadline
  }
  const isPaymentStep = (order: Order, step: NextStep) =>
    step.label.toLowerCase() === 'collect payment' ||
    step.status.name.toLowerCase() === 'collect payment' ||
    getEffectiveStatus(order)?.name.toLowerCase() === 'collect payment'

  const transitionTo = async (order: Order, step: NextStep) => {
    if (!canActOnOrder(order)) {
      toast.error('You can only update orders assigned to you.')
      return
    }
    setUpdating(order.id)
    const supabase = createClient()
    const isTerminal = step.status.is_terminal || !sortedStatuses.some(s => s.sort_order > step.status.sort_order)
    const update: Record<string, string> = { status_id: step.status.id }
    if (isTerminal) update.completed_at = new Date().toISOString()
    const { error } = await supabase.from('orders').update(update).eq('id', order.id)
    if (error) {
      toast.error(`Could not update order: ${error.message}`)
      setUpdating(null)
      return
    }
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...update } as Order : o))
    toast.success(step.label)
    setUpdating(null)
  }

  const handleAction = (order: Order, step: NextStep) => {
    if (isPaymentStep(order, step)) {
      setPaymentTarget(order)
      return
    }
    transitionTo(order, step)
  }

  const handlePaymentSuccess = (order: Order, paidStatusId: string) => {
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status_id: paidStatusId } as Order : o))
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">{orders.length} active orders</p>
        </div>
        <Link href={`/${businessId}/orders/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={(v: string | null) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            {sortedStatuses.map(status => (
              <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-muted-foreground">No orders found</CardContent></Card>
        ) : (
          filtered.map(order => {
            const status = getEffectiveStatus(order)
            const nextSteps = status?.is_terminal || !canActOnOrder(order)
              ? []
              : getAllowedNextStatuses(status?.id, sortedStatuses, transitions)
            const service = order.service
            const customerName = order.customer_name_snapshot ?? order.customer_name ?? 'Walk-in Customer'
            const customerContact = order.customer_mobile_snapshot ?? order.customer_contact
            const assignedName = order.assigned_person?.name
            const assignedPosition = order.assigned_position?.name ?? order.assigned_person?.position?.name
            // Show "Unassigned" only when there is no assignee.
            // Orders with an assignee but missing status (pre-migration edge case) show "Waiting".
            const statusLabel = status?.name ?? (order.assigned_to_person_id ? 'Waiting' : 'Unassigned')
            const statusColor = status?.color ?? (order.assigned_to_person_id ? 'blue' : 'slate')
            const activePayment = getActivePayment(order)
            const correctionHistory = [...(order.payment_corrections ?? [])]
              .sort((a, b) => new Date(b.corrected_at).getTime() - new Date(a.corrected_at).getTime())
            return (
              <Card key={order.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR_CLASS[statusColor] ?? STATUS_COLOR_CLASS.slate}`}>
                          {statusLabel}
                        </span>
                        <span className="text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
                      </div>
                      <p className="font-semibold">{customerName}</p>
                      {customerContact && <p className="text-sm text-muted-foreground">{customerContact}</p>}
                      <p className="text-sm text-muted-foreground mt-1">{service?.name}</p>
                      {assignedName && (
                        <p className="text-xs text-muted-foreground">
                          Assigned to {assignedName}{assignedPosition ? ` · ${assignedPosition}` : ''}
                        </p>
                      )}
                      {activePayment && (
                        <div className="mt-2 rounded-md border bg-slate-50 p-2 text-xs">
                          <p className="font-medium">Payment collected</p>
                          <p className="text-muted-foreground">
                            {activePayment.payment_method.replace('_', ' ')} · Received {formatCurrency(activePayment.amount_received)} · Tip {formatCurrency(activePayment.tip_amount)}
                          </p>
                          {correctionHistory.length > 0 && (
                            <div className="mt-1 text-muted-foreground">
                              <p>Correction History</p>
                              {correctionHistory.slice(0, 2).map(correction => (
                                <p key={correction.id}>
                                  {formatDateTime(correction.corrected_at)} · {correction.reason}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDateTime(order.received_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg">{formatCurrency(order.total_amount)}</p>
                      {activePayment && canCorrectPayment(activePayment) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs w-full mt-2"
                          onClick={() => setCorrectionTarget({ order, payment: activePayment })}
                        >
                          Correct Payment
                        </Button>
                      )}
                      {nextSteps.length > 0 && (
                        <div className="flex flex-col gap-1 mt-2">
                          {nextSteps.map(step => (
                            <Button
                              key={step.status.id}
                              size="sm"
                              variant="outline"
                              className="text-xs w-full"
                              disabled={updating === order.id}
                              onClick={() => handleAction(order, step)}
                            >
                              {step.label}
                              <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
      {paymentTarget && (
        <OrderPaymentDialog
          key={paymentTarget.id}
          open
          onOpenChange={open => { if (!open) setPaymentTarget(null) }}
          order={paymentTarget}
          financialAccounts={financialAccounts}
          onSuccess={paidStatusId => {
            handlePaymentSuccess(paymentTarget, paidStatusId)
            setPaymentTarget(null)
          }}
        />
      )}
      {correctionTarget && (
        <OrderPaymentDialog
          key={`${correctionTarget.payment.id}-correction`}
          open
          mode="correct"
          onOpenChange={open => { if (!open) setCorrectionTarget(null) }}
          order={correctionTarget.order}
          payment={correctionTarget.payment}
          financialAccounts={financialAccounts}
          onSuccess={() => {
            router.refresh()
            setCorrectionTarget(null)
          }}
        />
      )}
    </div>
  )
}
