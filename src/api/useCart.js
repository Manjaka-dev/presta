import { reactive, computed } from 'vue'

const CART_STORAGE_KEY = 'client_presta_cart'

const loadCartFromStorage = () => {
  try {
    const stored = localStorage.getItem(CART_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (e) {
    console.warn('[useCart] Failed to load cart from localStorage:', e)
    return []
  }
}

const saveCartToStorage = (items) => {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  } catch (e) {
    console.warn('[useCart] Failed to save cart to localStorage:', e)
  }
}

const cartState = reactive({
  items: loadCartFromStorage(),
})

export const useCart = () => {
  const addItem = (product, quantity = 1) => {
    const itemKey = product.itemKey || `${product.id}${product.combinationId ? `:${product.combinationId}` : ''}`
    const existingItem = cartState.items.find(item => (item.itemKey || String(item.id)) === itemKey)
    if (existingItem) {
      existingItem.quantity += quantity
    } else {
      cartState.items.push({
        id: product.id,
        itemKey,
        combinationId: product.combinationId || null,
        name: product.name,
        price: parseFloat(product.price),
        quantity: quantity,
        imageUrl: product.imageUrl,
        variantLabel: product.variantLabel || '',
      })
    }
    saveCartToStorage(cartState.items)
  }

  const removeItem = (identifier) => {
    const index = cartState.items.findIndex(item => (item.itemKey || String(item.id)) === String(identifier) || item.id === identifier)
    if (index > -1) {
      cartState.items.splice(index, 1)
    }
    saveCartToStorage(cartState.items)
  }

  const updateQuantity = (identifier, quantity) => {
    const item = cartState.items.find(i => (i.itemKey || String(i.id)) === String(identifier) || i.id === identifier)
    if (item) {
      item.quantity = Math.max(1, quantity)
    }
    saveCartToStorage(cartState.items)
  }

  const clearCart = () => {
    cartState.items = []
    saveCartToStorage(cartState.items)
  }

  const itemCount = computed(() => {
    return cartState.items.reduce((sum, item) => sum + item.quantity, 0)
  })

  const totalPrice = computed(() => {
    return cartState.items
      .reduce((sum, item) => sum + item.price * item.quantity, 0)
      .toFixed(2)
  })

  const items = computed(() => cartState.items)

  return {
    items,
    itemCount,
    totalPrice,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  }
}

