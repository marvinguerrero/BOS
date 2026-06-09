'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ShoppingCart, Trash2, Plus, Minus, CheckCircle, Banknote, Wallet, Building2, CreditCard, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useCartStore } from '@/stores/cart.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { Product, Customer, FinancialAccount, CustomerType } from '@/types'
import { CheckoutDialog } from './checkout-dialog'

// ─── Account type config ───────────────────────────────────────────────────────

const ACCOUNT_TYPE_ICON: Record<string, React.ElementType> = {
  cash:       Banknote,
  ewallet:    Wallet,
  bank:       Building2,
  receivable: CreditCard,
}

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  cash:       'Cash',
  ewallet:    'E-Wallet',
  bank:       'Bank',
  receivable: 'Credit',
}

const CUSTOMER_TYPES: Array<{ value: CustomerType; label: string }> = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'guest', label: 'Guest' },
  { value: 'registered', label: 'Registered' },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  businessId: string
  products: Product[]
  customers: Customer[]
  financialAccounts: FinancialAccount[]
}

// ─── Component ────────────────────────────────────────────────────────────────

export function POSView({ businessId, products, customers, financialAccounts }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [customerType, setCustomerType] = useState<CustomerType>('walk_in')
  const [guestName, setGuestName] = useState('')
  const [guestMobile, setGuestMobile] = useState('')

  const {
    items, addItem, removeItem, updateQuantity,
    subtotal, total, discount, setDiscount, clearCart,
    customerId, setCustomerId,
    paymentMethod, paymentAccountId, setPaymentAccount,
  } = useCartStore()

  // Seed the first active account on mount if none is selected
  useEffect(() => {
    if (!paymentAccountId && financialAccounts.length > 0) {
      const first = financialAccounts[0]
      setPaymentAccount(first.id, first.legacy_method)
    }
  }, [financialAccounts, paymentAccountId, setPaymentAccount])

  const selectedAccount = financialAccounts.find(a => a.id === paymentAccountId) ?? financialAccounts[0] ?? null
  const selectedCustomer = customerId ? customers.find(c => c.id === customerId) ?? null : null
  const requiresRegisteredCustomer =
    paymentMethod === 'credit' ||
    selectedAccount?.account_type === 'receivable' ||
    selectedAccount?.legacy_method === 'credit'

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  )

  const handleCustomerTypeChange = (type: CustomerType) => {
    setCustomerType(type)
    if (type !== 'registered') setCustomerId(null)
  }

  const getCustomerSnapshot = () => {
    if (customerType === 'registered') {
      return {
        customerId: selectedCustomer?.id ?? null,
        name: selectedCustomer?.name ?? null,
        mobile: selectedCustomer?.contact_number ?? null,
      }
    }

    if (customerType === 'guest') {
      return {
        customerId: null,
        name: guestName.trim(),
        mobile: guestMobile.trim() || null,
      }
    }

    return {
      customerId: null,
      name: 'Walk-in Customer',
      mobile: null,
    }
  }

  const validateCustomerSelection = () => {
    if (requiresRegisteredCustomer && customerType !== 'registered') {
      toast.error('Please select or create a customer before recording a credit sale.')
      return false
    }

    if (customerType === 'registered' && !selectedCustomer) {
      toast.error(
        requiresRegisteredCustomer
          ? 'Please select or create a customer before recording a credit sale.'
          : 'Select a registered customer or switch to walk-in/guest.'
      )
      return false
    }

    if (customerType === 'guest' && guestName.trim().length === 0) {
      toast.error('Enter a guest name before checkout.')
      return false
    }

    return true
  }

  const handleCheckout = async (amountTendered: number) => {
    if (!validateCustomerSelection()) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const saleTotal = total()
    const change = Math.max(0, amountTendered - saleTotal)
    const isCredit = requiresRegisteredCustomer
    const salePaymentMethod = isCredit ? 'credit' : paymentMethod
    const snapshot = getCustomerSnapshot()

    const { data: sale, error } = await supabase.from('sales').insert({
      business_id: businessId,
      customer_id: snapshot.customerId,
      cashier_id: user.id,
      subtotal: subtotal(),
      discount,
      total: saleTotal,
      payment_method: salePaymentMethod,
      payment_account_id: selectedAccount?.id ?? null,
      amount_tendered: amountTendered,
      change_amount: change,
      customer_type: customerType,
      customer_name_snapshot: snapshot.name,
      customer_mobile_snapshot: snapshot.mobile,
      payment_status: isCredit ? 'outstanding' : 'completed',
      amount_paid: isCredit ? 0 : saleTotal,
      balance_amount: isCredit ? saleTotal : 0,
    }).select().single()

    if (error || !sale) {
      toast.error('Failed to create sale')
      return
    }

    await Promise.all([
      supabase.from('sale_items').insert(
        items.map(item => ({
          sale_id: sale.id,
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.unit_price * item.quantity,
          product_name_snapshot: item.product.name,
          product_sku_snapshot: item.product.sku ?? null,
        }))
      ),
      ...items.map(item =>
        supabase.from('products')
          .update({ stock_quantity: item.product.stock_quantity - item.quantity })
          .eq('id', item.product.id)
      ),
    ])

    if (isCredit && snapshot.customerId && selectedCustomer) {
      await supabase.from('customer_ledger').insert({
        business_id: businessId,
        customer_id: snapshot.customerId,
        sale_id: sale.id,
        type: 'debit',
        amount: saleTotal,
        notes: `Sale ${sale.receipt_number ?? sale.id.slice(0, 8)}`,
      })
      await supabase.from('customers')
        .update({ outstanding_balance: selectedCustomer.outstanding_balance + saleTotal })
        .eq('id', snapshot.customerId)
    }

    toast.success(`Sale complete! ${isCredit ? 'Credit recorded.' : `Change: ${formatCurrency(change)}`}`)
    clearCart()
    setCustomerType('walk_in')
    setGuestName('')
    setGuestMobile('')
    setCheckoutOpen(false)
    router.refresh()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 h-full">
      {/* Product Grid */}
      <div className="lg:col-span-3">
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-3">Point of Sale</h1>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto max-h-[calc(100vh-280px)]">
          {filtered.map(product => (
            <Card
              key={product.id}
              className="cursor-pointer hover:border-primary hover:shadow-sm transition-all active:scale-95"
              onClick={() => addItem(product)}
            >
              <CardContent className="p-3">
                <p className="font-medium text-sm leading-tight mb-1 line-clamp-2">{product.name}</p>
                <p className="text-primary font-bold">{formatCurrency(product.selling_price)}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  {product.stock_quantity} in stock
                </Badge>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-8 text-muted-foreground">No products found</div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="lg:col-span-2">
        <Card className="sticky top-0 h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cart
              {items.length > 0 && <Badge>{items.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Customer */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Customer Type
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {CUSTOMER_TYPES.map(type => (
                  <Button
                    key={type.value}
                    type="button"
                    variant={customerType === type.value ? 'default' : 'outline'}
                    size="sm"
                    className="h-9 px-2 text-xs"
                    onClick={() => handleCustomerTypeChange(type.value)}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>

              {customerType === 'guest' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    placeholder="Guest name"
                    className="h-9 text-sm"
                  />
                  <Input
                    value={guestMobile}
                    onChange={e => setGuestMobile(e.target.value)}
                    placeholder="Mobile number"
                    className="h-9 text-sm"
                  />
                </div>
              )}

              {customerType === 'registered' && (
                <div className="flex gap-2">
                  <Select value={customerId ?? ''} onValueChange={(v: string | null) => setCustomerId(v || null)}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.outstanding_balance > 0 && `(${formatCurrency(c.outstanding_balance)} utang)`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => router.push(`/${businessId}/customers`)}
                    aria-label="Create customer"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Items */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Add items to cart</p>
              ) : (
                items.map(item => (
                  <div key={item.product.id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(item.unit_price)} each</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.product.id, item.quantity - 1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.product.id, item.quantity + 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeItem(item.product.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-medium w-16 text-right">{formatCurrency(item.unit_price * item.quantity)}</span>
                  </div>
                ))
              )}
            </div>

            <Separator />

            {/* Discount */}
            <div className="flex items-center gap-2">
              <span className="text-sm">Discount:</span>
              <Input
                type="number"
                min="0"
                value={discount || ''}
                onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                className="h-8 text-sm"
                placeholder="0.00"
              />
            </div>

            {/* Payment Account Selector */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Received via
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {financialAccounts.map(account => {
                  const Icon = ACCOUNT_TYPE_ICON[account.account_type] ?? Banknote
                  const isSelected = paymentAccountId === account.id
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => setPaymentAccount(account.id, account.legacy_method)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'border-border hover:border-slate-300 hover:bg-slate-50'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate leading-tight">{account.name}</span>
                    </button>
                  )
                })}
              </div>
              {selectedAccount && (
                <p className="text-xs text-muted-foreground">
                  {ACCOUNT_TYPE_LABEL[selectedAccount.account_type]}
                  {selectedAccount.account_type === 'receivable' && ' — will increase customer balance'}
                </p>
              )}
            </div>

            <Separator />

            {/* Totals */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal())}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatCurrency(total())}</span>
              </div>
            </div>

            <Button
              className="w-full gap-2"
              size="lg"
              disabled={items.length === 0}
              onClick={() => {
                if (validateCustomerSelection()) setCheckoutOpen(true)
              }}
            >
              <CheckCircle className="h-5 w-5" />
              Checkout
            </Button>
          </CardContent>
        </Card>
      </div>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        total={total()}
        paymentMethod={requiresRegisteredCustomer ? 'credit' : paymentMethod}
        accountName={selectedAccount?.name ?? null}
        onConfirm={handleCheckout}
      />
    </div>
  )
}
