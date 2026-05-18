<script setup>
import { reactive, onMounted } from 'vue'
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

    // Fetch data concurrently
    const [catRes, prodRes, orderDetailsRes, stockRes, ordersRes] = await Promise.all([
      apiCategories.list({ display: '[id,name]', limit: 1000 }),
      apiProducts.list({ display: '[id,id_category_default,price,wholesale_price]', limit: 5000 }),
      apiOrderDetails.list({ display: '[id,id_order,product_id,product_quantity,product_price,total_price_tax_excl,purchase_supplier_price]', limit: 5000 }),
      apiStock.list({ display: '[id,id_product,quantity]', limit: 5000 }), // Removed physical_quantity and reserved_quantity
      apiOrders.list({ display: '[id,valid]', limit: 5000 })
    ])

    const categories = extractItems(catRes, apiCategories.resource)
    const products = extractItems(prodRes, apiProducts.resource)
    const orderDetails = extractItems(orderDetailsRes, apiOrderDetails.resource)
    const stocks = extractItems(stockRes, apiStock.resource)
    const orders = extractItems(ordersRes, apiOrders.resource)

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

    // Build valid orders map
    const validOrdersMap = {}
    orders.forEach(o => {
      // PrestaShop considers valid=1 for paid orders
      validOrdersMap[o.id] = o.valid === '1'
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

    // Calculate Sales and Purchases from Order Details
    let sumSales = 0
    let sumPurchases = 0
    const profitByCat = {}

    orderDetails.forEach(od => {
      // Optional: only consider valid orders
      // if (!validOrdersMap[od.id_order]) return;

      const pId = od.product_id
      const qty = parseInt(od.product_quantity) || 0
      const salePrice = parseFloat(od.product_price) || 0 // unit price
      const totalSale = parseFloat(od.total_price_tax_excl) || (salePrice * qty)

      let wholesalePrice = parseFloat(od.purchase_supplier_price) || 0
      if (!wholesalePrice && prodMap[pId]) {
        wholesalePrice = prodMap[pId].wholesale_price
      }
      const totalPurchaseForOd = wholesalePrice * qty

      sumSales += totalSale
      sumPurchases += totalPurchaseForOd

      const catId = prodMap[pId] ? prodMap[pId].categoryId : 'unknown'
      if (!profitByCat[catId]) {
        profitByCat[catId] = { sales: 0, purchases: 0, profit: 0 }
      }
      profitByCat[catId].sales += totalSale
      profitByCat[catId].purchases += totalPurchaseForOd
      profitByCat[catId].profit += (totalSale - totalPurchaseForOd)
    })

    state.totalSales = sumSales
    state.totalPurchase = sumPurchases
    state.profitByCategory = profitByCat

    // Calculate Stock by Category
    const stockByCat = {}
    stocks.forEach(st => {
      const pId = st.id_product
      // Skip stock for combinations if you only want main product stock (id_product_attribute = 0)
      // Usually stock_availables groups them or gives specific rows. Let's aggregate by product.
      const catId = prodMap[pId] ? prodMap[pId].categoryId : 'unknown'

      if (!stockByCat[catId]) {
        stockByCat[catId] = { available: 0 }
      }
      stockByCat[catId].available += parseInt(st.quantity || 0)
    })

    state.stockByCategory = stockByCat

  } catch (e) {
    console.error('Error fetching stats', e)
    state.error = e.message || 'Erreur lors du chargement des statistiques'
  } finally {
    state.loading = false
  }
}

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
                <th>Quantité Disponible</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(stock, catId) in state.stockByCategory" :key="'stock-'+catId">
                <td>{{ state.categories[catId] || 'Inconnue (ID: ' + catId + ')' }}</td>
                <td>{{ stock.available }}</td>
              </tr>
              <tr v-if="Object.keys(state.stockByCategory).length === 0">
                <td colspan="2" class="text-center">Aucune donnée de stock disponible.</td>
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

.text-green { color: #10b981; font-weight: 500; }
.text-red { color: #ef4444; font-weight: 500; }
.text-center { text-align: center; }
</style>