<script setup>
import { reactive, onMounted, computed } from 'vue'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'

const state = reactive({
  loading: false,
  error: '',
  totalSales: 0,
  totalPurchase: 0,
  profitByCategory: {},
  stockByCategory: {},
  categories: {}
})

const fetchStats = async () => {
  state.loading = true
  state.error = ''
  try {
    const apiCategories = resourceApi('categories')
    const apiProducts = resourceApi('products')
    const apiOrderDetails = resourceApi('order_details')
    const apiStock = resourceApi('stock_availables')
    const apiOrders = resourceApi('orders')
    const apiStockMvts = resourceApi('stock_movements')

    // Fetch data concurrently
    const [catRes, prodRes, orderDetailsRes, stockRes, ordersRes, stockMvtsRes] = await Promise.all([
      apiCategories.list({ display: '[id,name]', limit: 1000 }),
      apiProducts.list({ display: '[id,id_category_default,price,wholesale_price]', limit: 5000 }),
      apiOrderDetails.list({ display: '[id,id_order,product_id,product_quantity,product_price,total_price_tax_excl,purchase_supplier_price,original_wholesale_price]', limit: 5000 }),
      apiStock.list({ display: '[id,id_product,id_product_attribute,quantity]', limit: 5000 }),
      apiOrders.list({ display: '[id,valid,current_state,total_paid_tax_excl,total_products]', limit: 5000 }),
      apiStockMvts.list({ display: '[id_stock,id_order,physical_quantity,sign]', limit: 5000 })
    ])

    const categories = extractItems(catRes, apiCategories.resource)
    const products = extractItems(prodRes, apiProducts.resource)
    const orderDetails = extractItems(orderDetailsRes, apiOrderDetails.resource)
    const stocks = extractItems(stockRes, apiStock.resource)
    const orders = extractItems(ordersRes, apiOrders.resource)

    // Robust extraction of stock movements
    let stockMvts = []
    if (stockMvtsRes) {
      let data = stockMvtsRes
      if (data.prestashop) data = data.prestashop
      let mvtsContainer = data.stock_mvts || data.stock_mvt
      if (mvtsContainer) {
        if (Array.isArray(mvtsContainer)) {
          stockMvts = mvtsContainer
        } else if (mvtsContainer.stock_mvt) {
          stockMvts = Array.isArray(mvtsContainer.stock_mvt) ? mvtsContainer.stock_mvt : [mvtsContainer.stock_mvt]
        } else {
          stockMvts = [mvtsContainer]
        }
      }
    }

    // Helper to get robust values from fields that might be strings, numbers or object wrappers
    const getVal = (field) => {
      if (field === null || field === undefined) return 0
      if (typeof field === 'object') {
        if (field['#text'] !== undefined) return parseInt(field['#text']) || 0
        const vals = Object.values(field)
        if (vals.length) return parseInt(vals[0]) || 0
      }
      return parseInt(field) || 0
    }

    // Build categories map
    const catMap = {}
    categories.forEach(c => {
      let name = 'Unknown'
      if (typeof c.name === 'string') name = c.name
      else if (c.name && c.name.language) {
        const langArr = Array.isArray(c.name.language) ? c.name.language : [c.name.language]
        name = langArr[0]['#text'] || langArr[0] || 'Unknown'
      }
      catMap[c.id] = name
    })
    state.categories = catMap

    // Build orders map with validity, status, and sales variables
    const ordersMap = {}
    orders.forEach(o => {
      ordersMap[o.id] = {
        valid: String(o.valid) === '1' || o.valid === 1 || o.valid === true,
        statusId: parseInt(o.current_state || 0),
        totalProducts: parseFloat(o.total_products) || 0, // Variable A (HT products without shipping)
        totalPaidTaxExcl: parseFloat(o.total_paid_tax_excl) || 0 // Variable B (HT actually paid by customer)
      }
    })

    // Build products map
    const prodMap = {}
    products.forEach(p => {
      prodMap[p.id] = {
        categoryId: p.id_category_default,
        wholesale_price: parseFloat(p.wholesale_price) || 0,
        price: parseFloat(p.price) || 0
      }
    })

    // Map: id_stock -> id_product
    const stockIdToProductId = {}
    stocks.forEach(st => {
      const stockId = getVal(st.id)
      const productId = getVal(st.id_product)
      if (stockId && productId) {
        stockIdToProductId[stockId] = productId
      }
    })

    // Map: `${orderId}_${productId}` -> net movement quantity
    const orderProductMovements = {}
    stockMvts.forEach(mvt => {
      const mvtStockId = getVal(mvt.id_stock)
      const mvtOrderId = getVal(mvt.id_order)
      const pId = stockIdToProductId[mvtStockId]
      const sign = getVal(mvt.sign)
      const qty = getVal(mvt.physical_quantity)

      if (mvtOrderId && pId) {
        const key = `${mvtOrderId}_${pId}`
        if (!orderProductMovements[key]) {
          orderProductMovements[key] = 0
        }
        orderProductMovements[key] += (qty * sign)
      }
    })

    // 1. Montant Total des Ventes (HT) - Chiffre d'Affaires (CA)
    // We sum Variable B (total_paid_tax_excl) of all orders with status 2 (paiement effectué) or 5 (livré).
    let sumSales = 0
    orders.forEach(o => {
      const statusId = parseInt(o.current_state || 0)
      if (statusId === 2 || statusId === 5) {
        sumSales += parseFloat(o.total_paid_tax_excl) || 0
      }
    })

    // 2. Montant Total d'Achat (HT) & Category Profits (using Real CA Method - Variable B)
    // Loop through order details, keeping only rows corresponding to orders with status 2 or 5.
    let sumPurchases = 0
    const profitByCat = {}
    const reservedQuantityByProduct = {}
    const reservedAlreadyDecrementedByProduct = {}
    const reservedNotDecrementedByProduct = {}

    orderDetails.forEach(od => {
      const orderId = od.id_order
      const order = ordersMap[orderId]
      const statusId = order ? order.statusId : 0
      const isDeliveredOrPaid = statusId === 2 || statusId === 5

      const pId = od.product_id
      const qty = parseInt(od.product_quantity) || 0
      const salePrice = parseFloat(od.product_price) || 0 // unit price
      const totalSale = parseFloat(od.total_price_tax_excl) || (salePrice * qty)

      // Get purchase price at checkout (Variable D): purchase_supplier_price or original_wholesale_price
      const purchasePrice = parseFloat(od.purchase_supplier_price) || parseFloat(od.original_wholesale_price) || 0
      const totalPurchaseForOd = purchasePrice * qty

      const catId = prodMap[pId] ? prodMap[pId].categoryId : 'unknown'

      // Keep only valid orders (delivered or paid) for sales/purchases totals and breakdown
      if (isDeliveredOrPaid) {
        sumPurchases += totalPurchaseForOd

        // Attributed sales using Real CA Method (Variable B distributed proportionally to product shares in the order)
        let realSaleForOd = 0
        if (order.totalProducts > 0) {
          const ratio = totalSale / order.totalProducts
          realSaleForOd = order.totalPaidTaxExcl * ratio
        } else {
          realSaleForOd = totalSale
        }

        if (!profitByCat[catId]) {
          profitByCat[catId] = { sales: 0, purchases: 0, profit: 0 }
        }
        profitByCat[catId].sales += realSaleForOd
        profitByCat[catId].purchases += totalPurchaseForOd
        profitByCat[catId].profit += (realSaleForOd - totalPurchaseForOd)
      }

      // Calculate reserved quantity: order exists, status is not livré (5) and not annulé (6)
      if (statusId !== 5 && statusId !== 6) {
        const key = `${orderId}_${pId}`
        const netMvt = orderProductMovements[key] || 0

        // Determine if stock was already decremented for this item
        const mvtQty = Math.abs(netMvt)
        const decrementedPart = Math.min(qty, mvtQty)
        const nonDecrementedPart = Math.max(0, qty - mvtQty)

        if (!reservedQuantityByProduct[pId]) {
          reservedQuantityByProduct[pId] = 0
          reservedAlreadyDecrementedByProduct[pId] = 0
          reservedNotDecrementedByProduct[pId] = 0
        }
        reservedQuantityByProduct[pId] += qty
        reservedAlreadyDecrementedByProduct[pId] += decrementedPart
        reservedNotDecrementedByProduct[pId] += nonDecrementedPart
      }
    })

    state.totalSales = sumSales
    state.totalPurchase = sumPurchases
    state.profitByCategory = profitByCat

    // Calculate Stock by Category
    const stockByCat = {}
    stocks.forEach(st => {
      // Skip stock for combinations to get the total product stock (id_product_attribute = 0)
      const idAttr = String(getVal(st.id_product_attribute))
      if (idAttr !== '0') return

      const pId = st.id_product
      const catId = prodMap[pId] ? prodMap[pId].categoryId : 'unknown'

      if (!stockByCat[catId]) {
        stockByCat[catId] = { physical: 0, reserved: 0, available: 0 }
      }

      const reserved = reservedQuantityByProduct[pId] || 0
      const reservedAlreadyDec = reservedAlreadyDecrementedByProduct[pId] || 0
      const reservedNotDec = reservedNotDecrementedByProduct[pId] || 0

      // Formule ajustée en prenant en compte les mouvements de stock déjà effectués
      const available = parseInt(st.quantity || 0) - reservedNotDec
      const physical = parseInt(st.quantity || 0) + reservedAlreadyDec

      stockByCat[catId].physical += physical
      stockByCat[catId].reserved += reserved
      stockByCat[catId].available += available
    })

    state.stockByCategory = stockByCat

  } catch (e) {
    console.error('Error fetching stats', e)
    state.error = e.message || 'Erreur lors du chargement des statistiques'
  } finally {
    state.loading = false
  }
}

const totals = computed(() => {
  let sales = 0
  let purchases = 0
  let profit = 0
  Object.values(state.profitByCategory).forEach(stats => {
    sales += stats.sales
    purchases += stats.purchases
    profit += stats.profit
  })
  return { sales, purchases, profit }
})

onMounted(() => {
  fetchStats()
})

const formatEur = (amount) => {
  return Number(amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}
</script>

<template>
  <section class="statistics">
    <header class="statistics-header">
      <h1>📈 Statistiques</h1>
      <p class="muted">Vue d'ensemble des ventes, achats et stocks (Hors Taxes)</p>
    </header>

    <div v-if="state.loading" class="loading-block">
      Chargement des statistiques...
    </div>

    <div v-else-if="state.error" class="error-block">
      {{ state.error }}
    </div>

    <div v-else>
      <!-- KPI Global -->
      <div class="kpi-grid">
        <div class="kpi-card kpi-card--blue">
          <div class="kpi-label">Montant Total des Ventes (HT)</div>
          <div class="kpi-value">{{ formatEur(state.totalSales) }}</div>
        </div>
        <div class="kpi-card kpi-card--red">
          <div class="kpi-label">Montant Total d'Achat (HT)</div>
          <div class="kpi-value">{{ formatEur(state.totalPurchase) }}</div>
        </div>
        <div class="kpi-card kpi-card--green">
          <div class="kpi-label">Bénéfice Global (HT)</div>
          <div class="kpi-value">{{ formatEur(state.totalSales - state.totalPurchase) }}</div>
        </div>
      </div>

      <!-- Bénéfice par Catégorie -->
      <div class="stats-section">
        <h2>Bénéfice par Catégorie (HT)</h2>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Ventes (HT)</th>
                <th>Achats (HT)</th>
                <th>Bénéfice (HT)</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(stats, catId) in state.profitByCategory" :key="catId">
                <td>{{ state.categories[catId] || 'Inconnue (ID: ' + catId + ')' }}</td>
                <td>{{ formatEur(stats.sales) }}</td>
                <td>{{ formatEur(stats.purchases) }}</td>
                <td :class="stats.profit >= 0 ? 'text-green' : 'text-red'">
                  {{ formatEur(stats.profit) }}
                </td>
              </tr>
              <tr v-if="Object.keys(state.profitByCategory).length === 0">
                <td colspan="4" class="text-center">Aucune donnée de vente disponible.</td>
              </tr>
            </tbody>
            <tfoot v-if="Object.keys(state.profitByCategory).length > 0">
              <tr>
                <td>Total</td>
                <td>{{ formatEur(totals.sales) }}</td>
                <td>{{ formatEur(totals.purchases) }}</td>
                <td :class="totals.profit >= 0 ? 'text-green' : 'text-red'">
                  {{ formatEur(totals.profit) }}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Stock par Catégorie -->
      <div class="stats-section">
        <h2>Stock par Catégorie</h2>
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>Catégorie</th>
                <th>Qté physique</th>
                <th>Qté réservée</th>
                <th>Qté disponible</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(stock, catId) in state.stockByCategory" :key="'stock-'+catId">
                <td>{{ state.categories[catId] || 'Inconnue (ID: ' + catId + ')' }}</td>
                <td>{{ stock.physical }}</td>
                <td>{{ stock.reserved }}</td>
                <td>{{ stock.available }}</td>
              </tr>
              <tr v-if="Object.keys(state.stockByCategory).length === 0">
                <td colspan="4" class="text-center">Aucune donnée de stock disponible.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.statistics {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.statistics-header {
  margin-bottom: 2rem;
}

.statistics-header h1 {
  margin: 0;
  font-size: 2rem;
}

.muted {
  color: #6b7280;
  margin: 0.25rem 0 0;
}

.loading-block {
  padding: 3rem;
  text-align: center;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 10px;
  font-size: 1.1rem;
}

.error-block {
  background: #fef2f2;
  border: 1px solid #fee2e2;
  border-radius: 8px;
  padding: 1rem;
  color: #ef4444;
  margin-bottom: 1rem;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2.5rem;
}

.kpi-card {
  background: white;
  border-radius: 14px;
  padding: 1.5rem;
  border-left: 5px solid transparent;
  box-shadow: 0 2px 10px rgba(0,0,0,0.07);
}

.kpi-card--blue { border-color: #3b82f6; }
.kpi-card--red { border-color: #ef4444; }
.kpi-card--green { border-color: #10b981; }

.kpi-label {
  font-size: 0.9rem;
  color: #6b7280;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.kpi-value {
  font-size: 2rem;
  font-weight: 700;
  color: #111827;
}

.stats-section {
  margin-top: 2rem;
}

.stats-section h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: #374151;
}

.table-container {
  background: white;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}

.table th, .table td {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}

.table th {
  background-color: #f9fafb;
  font-weight: 600;
  color: #4b5563;
}

.table tbody tr:hover {
  background-color: #f3f4f6;
}

.table tfoot tr {
  font-weight: bold;
  background-color: #f9fafb;
  border-top: 2px solid #e5e7eb;
}

.table tfoot td {
  padding: 1rem;
}

.text-green { color: #10b981; font-weight: 500; }
.text-red { color: #ef4444; font-weight: 500; }
.text-center { text-align: center; }
</style>