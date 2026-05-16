import { reactive, computed, ref, watch } from 'vue'
import { createCart, updateCart, deleteCart, calculateCartTaxes, getCartDetails } from './useCheckout'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData'

const CART_ITEMS_KEY = 'client_presta_cart'
const CART_ID_KEY = 'client_presta_cart_id'

// --- Persistence ---
const loadItemsFromStorage = () => {
  try {
    const stored = localStorage.getItem(CART_ITEMS_KEY)
    const parsed = stored ? JSON.parse(stored) : []
    return Array.isArray(parsed) ? parsed : []
  } catch (e) { return [] }
}

const loadCartIdFromStorage = () => {
  const val = localStorage.getItem(CART_ID_KEY)
  return val ? parseInt(val) : null
}

const persist = (items, cartId) => {
  try {
    localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(items))
    if (cartId) localStorage.setItem(CART_ID_KEY, String(cartId))
    else localStorage.removeItem(CART_ID_KEY)
  } catch (e) { /* ignore */ }
}

// --- Global singleton state ---
const cartState = reactive({
  items: loadItemsFromStorage(),
  cartId: loadCartIdFromStorage(),
  syncing: false,
})

// --- Cart API sync ---
const getCustomerId = () => {
  const val = sessionStorage.getItem('customerId') || localStorage.getItem('customerId')
  return val ? parseInt(val) : 2 // fallback client ID
}

const syncWithApi = async () => {
  cartState.syncing = true
  const customerId = getCustomerId()
  let addrId = 1 // Default fallback

  try {
    if (cartState.items.length >= 0) {
      if (!cartState.cartId && cartState.items.length > 0) {
        // Tenter de récupérer l'adresse du client
        if (customerId) {
          try {
            const addrApi = resourceApi('addresses')
            const addrRes = await addrApi.list({ 'filter[id_customer]': `[${customerId}]`, display: '[id]' })
            const addrs = extractItems(addrRes, addrApi.resource)
            if (addrs && addrs.length > 0) addrId = parseInt(addrs[0].id)
          } catch (e) {
            // Ignorer si l'adresse ne charge pas, on garde 1
          }
        }
        
        const newCartId = await createCart({
          customerId: customerId || 1,
          addressId: addrId,
          items: cartState.items,
        })
        cartState.cartId = newCartId
      } else if (cartState.cartId) {
        // Le panier existe, on le met à jour (même avec 0 articles pour vider cart_rows)
        await updateCart(cartState.cartId, {
          customerId: customerId || 1,
          addressId: addrId,
          items: cartState.items,
        })
      }
    }
  } catch (e) {
    console.error('[useCart] syncWithApi error:', e.message)
  } finally {
    persist(cartState.items, cartState.cartId)
    cartState.syncing = false
  }
}

const loadCustomerCart = async (customerId) => {
  try {
    const api = resourceApi('carts')
    const res = await api.list({
      'filter[id_customer]': `[${customerId}]`,
      sort: '[date_upd_DESC]',
      limit: 1,
      display: 'full'
    })
    const carts = extractItems(res, api.resource)
    if (carts && carts.length > 0) {
       const cartId = carts[0].id
       // Vérifier si ce panier est déjà commandé
       const orderApi = resourceApi('orders')
       const orderRes = await orderApi.list({
         'filter[id_cart]': `[${cartId}]`,
         limit: 1,
         display: '[id]'
       }).catch(() => null)
       const orders = orderRes ? extractItems(orderRes, orderApi.resource) : []
       
       if (orders.length === 0) {
         // Le panier est toujours actif/abandonné
         const details = await getCartDetails(cartId)
         cartState.cartId = parseInt(cartId)
         cartState.items = details.items || []
         persist(cartState.items, cartState.cartId)
         return
       }
    }
  } catch (e) {
    console.warn("[useCart] Could not load customer cart", e.message)
  }
  
  // S'il n'y a pas de panier actif, on vide le local state
  cartState.cartId = null
  cartState.items = []
  persist([], null)
}

// --- Composable ---
export const useCart = () => {
  const totalPrice = ref('0.00')

  const recalculateTotals = async () => {
    const sub = cartState.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.quantity) || 0), 0)
    try {
      const { totalTaxAmount } = await calculateCartTaxes(cartState.items)
      totalPrice.value = (sub + totalTaxAmount).toFixed(2)
    } catch {
      totalPrice.value = sub.toFixed(2)
    }
  }

  watch(() => cartState.items, recalculateTotals, { deep: true, immediate: true })

  const addItem = async (product, quantity = 1, maxQuantity = null) => {
    const itemKey = product.itemKey || `${product.id}${product.combinationId ? `:${product.combinationId}` : ''}`
    const existing = cartState.items.find(i => (i.itemKey || String(i.id)) === itemKey)

    let newQty = quantity
    if (existing) newQty = existing.quantity + quantity

    if (maxQuantity !== null && newQty > maxQuantity) {
      throw new Error(`Quantité demandée (${newQty}) supérieure au stock disponible (${maxQuantity}).`)
    }

    if (existing) {
      existing.quantity = newQty
    } else {
      cartState.items.push({
        id: product.id,
        itemKey,
        combinationId: product.combinationId || null,
        name: product.name,
        price: parseFloat(product.price),
        quantity: newQty,
        maxQuantity,
        imageUrl: product.imageUrl,
        variantLabel: product.variantLabel || '',
        id_tax_rules_group: product.id_tax_rules_group || 0,
      })
    }
    await syncWithApi()
  }

  const removeItem = async (identifier) => {
    const idx = cartState.items.findIndex(i => (i.itemKey || String(i.id)) === String(identifier) || i.id === identifier)
    if (idx === -1) return

    cartState.items.splice(idx, 1)
    await syncWithApi()
  }

  const updateQuantity = async (identifier, quantity) => {
    const item = cartState.items.find(i => (i.itemKey || String(i.id)) === String(identifier) || i.id === identifier)
    if (!item) return
    let newQty = Math.max(1, quantity)
    if (item.maxQuantity !== null && newQty > item.maxQuantity) {
      newQty = item.maxQuantity
      console.warn(`[useCart] Quantity capped at ${item.maxQuantity}`)
    }
    item.quantity = newQty
    await syncWithApi()
  }

  const clearCart = async () => {
    cartState.items = []
    // On retire le cartId local pour abandonner le panier dans la base de données
    // Le prochain addItem créera un nouveau panier
    cartState.cartId = null
    persist([], null)
  }

  const items = computed(() => cartState.items)
  const cartId = computed(() => cartState.cartId)
  const syncing = computed(() => cartState.syncing)
  const itemCount = computed(() => cartState.items.reduce((s, i) => s + i.quantity, 0))

  return {
    items,
    itemCount,
    totalPrice,
    cartId,
    syncing,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    loadCustomerCart,
  }
}