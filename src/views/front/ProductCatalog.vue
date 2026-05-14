<script setup>
import { reactive } from 'vue'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'
import { useCart } from '@/api/useCart'
import { getProductImageUrl } from '@/api/httpClient'

const state = reactive({
  loading: true,
  products: [],
  error: '',
})

const quantities = reactive({})
const { addItem, itemCount: cartItemCount, totalPrice: cartTotalPrice } = useCart()

// Const pour gérer les statuts de stock
const STOCK_STATUS = {
  AVAILABLE: 'available',
  LOW: 'low',
  OUT_OF_STOCK: 'out_of_stock',
}

const LOW_STOCK_THRESHOLD = 5


const getStockStatus = (quantity) => {
  if (quantity <= 0) return STOCK_STATUS.OUT_OF_STOCK
  if (quantity < LOW_STOCK_THRESHOLD) return STOCK_STATUS.LOW
  return STOCK_STATUS.AVAILABLE
}

const getStockLabel = (quantity, status) => {
  if (status === STOCK_STATUS.OUT_OF_STOCK) return 'Épuisé'
  if (status === STOCK_STATUS.LOW) return `Plus que ${quantity} en stock`
  return 'En stock'
}

const normalizeProductName = (name) => {
  if (typeof name === 'string') return name
  if (Array.isArray(name) && name.length) return name[0]
  if (typeof name === 'object' && name !== null) {
    const vals = Object.values(name)
    if (vals.length) return String(vals[0])
  }
  return 'Produit sans titre'
}

const normalizePrice = (price) => {
  return parseFloat(price || 0).toFixed(2)
}

const loadProducts = async () => {
  state.loading = true
  state.error = ''
  try {
    const api = resourceApi('products')
    const response = await api.list({
      display: '[id,name,price,id_default_image,active,id_tax_rules_group]',
      limit: 50,
    })
    const items = extractItems(response, api.resource)

    // Charger le stock pour tous les produits
    let stockMap = {}
    try {
      const stockApi = resourceApi('stock_availables')
      const stockResponse = await stockApi.list({
        display: '[id_product,quantity]',
        limit: 100,
      })
      console.log('[ProductCatalog] Stock response:', stockResponse)

      // La réponse peut venir directement comme Array ou wrappée dans prestashop
      let stocks = []
      if (Array.isArray(stockResponse)) {
        stocks = stockResponse
      } else if (stockResponse.stock_availables && Array.isArray(stockResponse.stock_availables)) {
        stocks = stockResponse.stock_availables
      } else if (stockResponse.prestashop?.stock_availables) {
        const stocksData = stockResponse.prestashop.stock_availables.stock_available
        stocks = Array.isArray(stocksData) ? stocksData : stocksData ? [stocksData] : []
      }

      console.log('[ProductCatalog] Parsed stocks:', stocks)

      stocks.forEach(stock => {
        const productId = parseInt(stock.id_product)
        const qty = parseInt(stock.quantity || 0)
        // Additionner si plusieurs entrées (multi-entrepôt)
        stockMap[productId] = (stockMap[productId] || 0) + qty
      })
      console.log('[ProductCatalog] Stock map after processing:', stockMap)
    } catch (e) {
      console.warn('[ProductCatalog] Could not load stock - will use product quantity field', e)
      // Fallback : charger quantity du produit directement
      try {
        const apiWithQty = resourceApi('products')
        const prodResponse = await apiWithQty.list({
          display: '[id,quantity]',
          limit: 50,
        })
        const itemsQty = extractItems(prodResponse, apiWithQty.resource)
        itemsQty.forEach(p => {
          stockMap[parseInt(p.id)] = parseInt(p.quantity || 0)
        })
        console.log('[ProductCatalog] Fallback stock map:', stockMap)
      } catch (e2) {
        console.warn('[ProductCatalog] Fallback also failed', e2)
      }
    }

    // Afficher TOUS les produits, même épuisés
    state.products = items
      .filter(p => p.active === '1' || p.active === 1)
      .map(product => {
        const productId = parseInt(product.id)
        const quantity = stockMap[productId] !== undefined ? stockMap[productId] : 0
        return {
          id: productId,
          name: normalizeProductName(product.name),
          price: normalizePrice(product.price),
          quantity: quantity,
          defaultImageId: product.id_default_image,
          imageUrl: product.id_default_image ? getProductImageUrl(productId, product.id_default_image) : '/images/placeholder-product.png',
          stockStatus: getStockStatus(quantity),
          active: product.active,
        }
      })

    console.info('[ProductCatalog] loaded', {
      count: state.products.length,
      withStock: Object.keys(stockMap).length,
      stockMap: stockMap
    })
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error)
    console.error('[ProductCatalog] error loading products', error)
  } finally {
    state.loading = false
  }
}

const initializeQuantity = (productId) => {
  if (!quantities[productId]) {
    quantities[productId] = 1
  }
}

const addToCart = (product) => {
  const qty = quantities[product.id] || 1
  const numQty = parseInt(qty)

  if (numQty <= 0) {
    state.error = 'La quantité doit être supérieure à 0'
    return
  }

  if (numQty > product.quantity) {
    state.error = `Stock insuffisant pour ${product.name}. Disponible : ${product.quantity}`
    return
  }

  try {
    addItem(product, numQty, product.quantity)

    // Reset quantity input
    quantities[product.id] = 1

    // Feedback visuel
    state.error = `${product.name} ajouté au panier (×${numQty})`
    setTimeout(() => {
      if (state.error.includes('ajouté au panier')) {
        state.error = ''
      }
    }, 2000)

    console.info('[ProductCatalog] item added to cart', {
      product: product.name,
      quantity: numQty,
      cartTotal: cartItemCount.value,
    })
  } catch (error) {
    state.error = error.message
  }
}

const handleImageError = (event) => {
  event.target.src = '/images/placeholder-product.png'
}

// Load products on mount
loadProducts()
</script>

<template>
  <section class="product-catalog">
    <header class="catalog-header">
      <div class="catalog-header__title">
        <h1>Catalogue Produits</h1>
        <p class="muted">Parcourez notre sélection de produits</p>
      </div>
      <div class="catalog-header__cart">
        <RouterLink to="/front/orders" class="button button--ghost">
          Mes commandes
        </RouterLink>
        <RouterLink to="/front/cart" class="button button--primary">
          🛒 Panier
          <span v-if="cartItemCount > 0" class="badge">{{ cartItemCount }}</span>
        </RouterLink>
      </div>
    </header>

    <!-- Error Block -->
    <div v-if="state.error && !state.error.includes('ajouté au panier')" class="error-block">
      <p>{{ state.error }}</p>
    </div>

    <!-- Success Message -->
    <div v-if="state.error && state.error.includes('ajouté au panier')" class="success-block">
      <p>✓ {{ state.error }}</p>
    </div>

    <!-- Loading State -->
    <div v-if="state.loading" class="loading-state">
      <p>Chargement des produits...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="state.products.length === 0" class="empty-state">
      <p class="muted">Aucun produit disponible pour le moment.</p>
    </div>

    <!-- Products Grid -->
    <div v-else class="products-grid">
      <div v-for="product in state.products" :key="product.id" class="product-card">
        <!-- Product Image -->
        <RouterLink
          :to="{ name: 'front-product-detail', params: { id: product.id } }"
          class="product-card__image"
          :aria-label="`Voir la fiche de ${product.name}`"
        >
          <img :src="product.imageUrl" :alt="product.name" @error="handleImageError" />
          <div v-if="product.stockStatus === 'out_of_stock'" class="stock-badge stock-badge--out">
            Épuisé
          </div>
          <div v-else-if="product.stockStatus === 'low'" class="stock-badge stock-badge--low">
            Stock faible
          </div>
        </RouterLink>

        <!-- Product Info -->
        <div class="product-card__info">
          <RouterLink
            :to="{ name: 'front-product-detail', params: { id: product.id } }"
            class="product-card__name"
          >
            {{ product.name }}
          </RouterLink>
          <p class="product-card__price">{{ product.price }}€</p>
          <p class="product-card__stock" :class="`stock-status-${product.stockStatus}`">
            {{ getStockLabel(product.quantity, product.stockStatus) }}
          </p>
        </div>

        <!-- Product Actions -->
        <div class="product-card__actions">
          <div v-if="product.stockStatus !== 'out_of_stock'" class="quantity-input">
            <label for="qty-{{ product.id }}" class="quantity-label">Quantité :</label>
            <input
              :id="`qty-${product.id}`"
              v-model.number="quantities[product.id]"
              type="number"
              min="1"
              :max="product.quantity"
              @focus="initializeQuantity(product.id)"
              class="quantity-field"
            />
          </div>
          <button
            :disabled="product.stockStatus === 'out_of_stock'"
            class="button button--secondary"
            @click="addToCart(product)"
          >
            {{ product.stockStatus === 'out_of_stock' ? 'Indisponible' : 'Ajouter au panier' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Cart Summary (floating) -->
    <div v-if="cartItemCount > 0" class="cart-summary">
      <p>Total panier : <strong>{{ cartTotalPrice }}€</strong></p>
    </div>
  </section>
</template>

<style scoped>
.product-catalog {
  padding: 2rem 1rem;
  max-width: 1200px;
  margin: 0 auto;
}

.catalog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.catalog-header__title h1 {
  margin: 0;
  font-size: 2rem;
}

.catalog-header__title p {
  margin: 0.5rem 0 0;
}

.catalog-header__cart {
  position: relative;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  height: 1.5rem;
  margin-left: 0.5rem;
  padding: 0 0.5rem;
  background: #ff6b6b;
  color: white;
  border-radius: 10px;
  font-size: 0.75rem;
  font-weight: 600;
}

.error-block {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: var(--danger, #c33);
}

.error-block p {
  margin: 0;
  font-size: 0.9rem;
}

.success-block {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  color: #155724;
}

.success-block p {
  margin: 0;
  font-size: 0.9rem;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  background: #f9f9f9;
  border-radius: 8px;
  color: #666;
}

.loading-state p,
.empty-state p {
  margin: 0;
  font-size: 1.1rem;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
}

.product-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: box-shadow 0.2s, transform 0.2s;
}

.product-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.product-card__image {
  position: relative;
  width: 100%;
  height: 250px;
  background: #f5f5f5;
  overflow: hidden;
  display: block;
  text-decoration: none;
}

.product-card__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.stock-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.35rem 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.stock-badge--out {
  background: #c33;
  color: white;
}

.stock-badge--low {
  background: #ff9800;
  color: white;
}

.product-card__info {
  padding: 1rem;
  flex: 1;
}

.product-card__name {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 600;
  line-height: 1.3;
}

.product-card__price {
  margin: 0.25rem 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--primary, #0066cc);
}

.product-card__stock {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
}

.stock-status-available {
  color: #27ae60;
}

.stock-status-low {
  color: #ff9800;
}

.stock-status-out_of_stock {
  color: #c33;
}

.product-card__actions {
  padding: 0 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quantity-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.quantity-label {
  font-size: 0.85rem;
  font-weight: 500;
  min-width: 70px;
}

.quantity-field {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.9rem;
  font-family: inherit;
}

.quantity-field:focus {
  outline: none;
  border-color: var(--primary, #0066cc);
  box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.1);
}

.button--secondary {
  width: 100%;
  padding: 0.75rem;
  background: var(--primary, #0066cc);
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.button--secondary:hover:not(:disabled) {
  background: #0052a3;
}

.button--secondary:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.cart-summary {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: var(--primary, #0066cc);
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  font-weight: 600;
}

.cart-summary p {
  margin: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .product-catalog {
    padding: 1rem;
  }

  .catalog-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .catalog-header__title h1 {
    font-size: 1.5rem;
  }

  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1rem;
  }

  .product-card__image {
    height: 200px;
  }

  .cart-summary {
    bottom: auto;
    top: auto;
    left: 1rem;
    right: 1rem;
    margin-top: 2rem;
  }
}

@media (max-width: 480px) {
  .products-grid {
    grid-template-columns: 1fr;
  }

  .product-card__price {
    font-size: 1.25rem;
  }

  .catalog-header__title h1 {
    font-size: 1.25rem;
  }
}
</style>
