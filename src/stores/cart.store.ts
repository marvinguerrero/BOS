import { create } from 'zustand'
import type { CartItem, Product, PaymentMethod } from '@/types'

interface CartState {
  items: CartItem[]
  discount: number
  paymentMethod: PaymentMethod
  paymentAccountId: string | null
  customerId: string | null
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  setDiscount: (discount: number) => void
  setPaymentMethod: (method: PaymentMethod) => void
  setPaymentAccount: (accountId: string, legacyMethod: string) => void
  setCustomerId: (id: string | null) => void
  clearCart: () => void
  subtotal: () => number
  total: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discount: 0,
  paymentMethod: 'cash',
  paymentAccountId: null,
  customerId: null,

  addItem: (product) => {
    set((state) => {
      const existing = state.items.find(i => i.product.id === product.id)
      if (existing) {
        return {
          items: state.items.map(i =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return {
        items: [...state.items, { product, quantity: 1, unit_price: product.selling_price }],
      }
    })
  },

  removeItem: (productId) => {
    set((state) => ({ items: state.items.filter(i => i.product.id !== productId) }))
  },

  updateQuantity: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId)
      return
    }
    set((state) => ({
      items: state.items.map(i =>
        i.product.id === productId ? { ...i, quantity } : i
      ),
    }))
  },

  setDiscount: (discount) => set({ discount }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setPaymentAccount: (accountId, legacyMethod) => set({
    paymentAccountId: accountId,
    paymentMethod: legacyMethod as PaymentMethod,
  }),
  setCustomerId: (customerId) => set({ customerId }),

  clearCart: () => set({
    items: [],
    discount: 0,
    paymentMethod: 'cash',
    paymentAccountId: null,
    customerId: null,
  }),

  subtotal: () => get().items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0),
  total: () => {
    const sub = get().subtotal()
    return Math.max(0, sub - get().discount)
  },
}))
