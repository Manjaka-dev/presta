<template>
  <div class="stock-management-container">
    <div class="header">
      <h1>🏢 Gestion du Stock</h1>
      <p class="subtitle">Ajouter ou modifier le stock des produits</p>
    </div>

    <!-- Section: Ajouter du stock -->
    <section class="add-stock-section">
      <h2>Ajouter du Stock</h2>

      <div class="form-group">
        <label for="product-select">Sélectionner un produit :</label>
        <select v-model="form.productId" id="product-select" @change="onProductSelect">
          <option value="">-- Choisir --</option>
          <option v-for="product in products" :key="product.id" :value="product.id">
            {{ product.name }} (ID: {{ product.id }})
          </option>
        </select>
      </div>

      <div v-if="selectedProduct" class="product-info">
        <h3>📦 {{ selectedProduct.name }}</h3>
        <p><strong>Stock actuel :</strong> <span class="stock-value">{{ selectedProduct.quantity }}</span> unités</p>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="quantity">Quantité à ajouter :</label>
          <input
            v-model.number="form.quantity"
            id="quantity"
            type="number"
            min="1"
            placeholder="ex: 10"
          />
        </div>

        <div class="form-group">
          <label for="reason">Raison du mouvement :</label>
          <select v-model="form.reasonId" id="reason">
            <option value="">-- Choisir --</option>
            <option v-for="reason in stockReasons" :key="reason.id" :value="reason.id">
              {{ reason.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="warehouse">Entrepôt :</label>
          <select v-model="form.warehouseId" id="warehouse">
            <option value="">-- Choisir --</option>
            <option v-for="wh in warehouses" :key="wh.id" :value="wh.id">
              {{ wh.name }}
            </option>
          </select>
        </div>
      </div>

      <button
        @click="addStock"
        :disabled="!isFormValid || isSubmitting"
        class="btn-primary"
      >
        <span v-if="!isSubmitting">✅ Ajouter le Stock</span>
        <span v-else>⏳ Traitement...</span>
      </button>

      <div v-if="submitError" class="alert alert-error">
        ❌ {{ submitError }}
      </div>
      <div v-if="submitSuccess" class="alert alert-success">
        ✅ {{ submitSuccess }}
      </div>
    </section>

    <!-- Section: Historique des mouvements -->
    <section class="history-section">
      <h2>📊 Historique d'Évolution du Stock</h2>

      <div class="filter-group">
        <div class="form-group">
          <label for="filter-product">Filtrer par produit :</label>
          <select v-model="filterProductId" id="filter-product" @change="loadStockHistory">
            <option value="">-- Tous les produits --</option>
            <option v-for="product in products" :key="product.id" :value="product.id">
              {{ product.name }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label for="filter-days">Derniers jours :</label>
          <input
            v-model.number="filterDays"
            id="filter-days"
            type="number"
            min="1"
            max="90"
            @change="loadStockHistory"
          />
        </div>

        <button @click="loadStockHistory" class="btn-secondary">🔄 Rafraîchir</button>
      </div>

      <div v-if="historyLoading" class="loading">
        ⏳ Chargement de l'historique...
      </div>

      <div v-else-if="stockHistoryGrouped.length === 0" class="no-data">
        Aucun mouvement de stock enregistré pour les critères sélectionnés.
      </div>

      <div v-else class="history-container">
        <div
          v-for="(group, productName) in stockHistoryGrouped"
          :key="productName"
          class="product-history"
        >
          <h3>{{ productName }}</h3>
          <table class="history-table">
            <thead>
              <tr>
                <th>📅 Date</th>
                <th>📦 Quantité</th>
                <th>🔄 Raison</th>
                <th>🏢 Entrepôt</th>
                <th>👤 Référence</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(movement, idx) in group" :key="idx" :class="movementRowClass(movement)">
                <td>{{ formatDate(movement.date_add) }}</td>
                <td class="quantity" :class="getQuantityClass(movement)">
                  {{ getSignedQuantity(movement) }}
                </td>
                <td>{{ movement.reason }}</td>
                <td>{{ movement.warehouse }}</td>
                <td>{{ movement.reference || '-' }}</td>
              </tr>
            </tbody>
          </table>

          <!-- Graphique d'évolution -->
          <StockTrendChart :movements="group" />
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted } from 'vue'
import StockTrendChart from '@/components/backoffice/stock/StockTrendChart.vue'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'
import {
  loadAllProducts,
  loadStockReasons,
  loadWarehouses,
  loadStockMovements,
  createStockMovement,
  enrichStockMovements,
} from '@/api/stockService'

// ===== STATE =====
const form = reactive({
  productId: '',
  quantity: 1,
  reasonId: '',
  warehouseId: '',
})

const state = reactive({
  loading: false,
  products: [],
  stockReasons: [],
  warehouses: [],
  stockHistory: [],
  historyLoading: false,
})

const filterProductId = ref('')
const filterDays = ref(30)
const isSubmitting = ref(false)
const submitError = ref('')
const submitSuccess = ref('')

// ===== COMPUTED =====
const products = computed(() => state.products)
const stockReasons = computed(() => state.stockReasons)
const warehouses = computed(() => state.warehouses)
const selectedProduct = computed(() => {
  if (!form.productId) return null
  return state.products.find(p => String(p.id) === String(form.productId))
})

const isFormValid = computed(() => {
  return form.productId && form.quantity > 0 && form.reasonId && form.warehouseId
})

const historyLoading = computed(() => state.historyLoading)

const stockHistoryGrouped = computed(() => {
  const grouped = {}
  state.stockHistory.forEach(movement => {
    const productName = movement.productName || `Produit ${movement.id_product}`
    if (!grouped[productName]) {
      grouped[productName] = []
    }
    grouped[productName].push(movement)
  })
  return grouped
})

// ===== METHODS =====

const loadAllData = async () => {
  try {
    state.loading = true
    const [products, reasons, warehouses] = await Promise.all([
      loadAllProducts(),
      loadStockReasons(),
      loadWarehouses(),
    ])
    state.products = products
    state.stockReasons = reasons
    state.warehouses = warehouses
  } catch (error) {
    console.error('[StockManagement] Erreur chargement données:', error)
    submitError.value = 'Impossible de charger les données'
  } finally {
    state.loading = false
  }
}

const onProductSelect = () => {
  submitError.value = ''
  submitSuccess.value = ''
}

const addStock = async () => {
  if (!isFormValid.value) {
    submitError.value = 'Veuillez remplir tous les champs'
    return
  }

  isSubmitting.value = true
  submitError.value = ''
  submitSuccess.value = ''

  try {
    // D'abord, récupérer l'id_stock du produit
    const stocksApi = resourceApi('stocks')
    const stocksResponse = await stocksApi.list({
      'filter[id_product]': String(form.productId),
      display: '[id,id_product]',
      limit: 1,
    })
    const stocks = extractItems(stocksResponse, stocksApi.resource)

    if (!stocks || stocks.length === 0) {
      throw new Error('Aucun stock trouvé pour ce produit')
    }

    const stockId = stocks[0].id

    await createStockMovement({
      stockId: stockId,
      reasonId: form.reasonId,
      quantity: form.quantity,
      sign: 1,
    })

    submitSuccess.value = `✅ Stock ajouté avec succès! +${form.quantity} unités`
    form.quantity = 1
    form.reasonId = ''
    form.warehouseId = ''

    // Rafraîchir les données
    await Promise.all([loadAllData(), loadStockHistory()])
  } catch (error) {
    console.error('[StockManagement] Erreur ajout stock:', error)
    submitError.value = error.message || 'Erreur lors de l\'ajout du stock'
  } finally {
    isSubmitting.value = false
  }
}

const loadStockHistory = async () => {
  try {
    state.historyLoading = true
    const params = {}
    if (filterProductId.value) {
      params['filter[id_product]'] = String(filterProductId.value)
    }

    const movements = await loadStockMovements(params)
    state.stockHistory = enrichStockMovements(
      movements,
      state.products,
      state.stockReasons,
      state.warehouses
    )
  } catch (error) {
    console.error('[StockManagement] Erreur chargement historique:', error)
    submitError.value = 'Erreur lors du chargement de l\'historique'
  } finally {
    state.historyLoading = false
  }
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const movementRowClass = (movement) => {
  const sign = parseInt(movement.sign)
  if (sign > 0) return 'row-add'
  if (sign < 0) return 'row-remove'
  return ''
}

const getSignedQuantity = (movement) => {
  const qty = parseInt(movement.physical_quantity || 0)
  const sign = parseInt(movement.sign || 1)
  const effectiveQty = qty * sign
  return effectiveQty > 0 ? `+${effectiveQty}` : String(effectiveQty)
}

const getQuantityClass = (movement) => {
  const sign = parseInt(movement.sign || 1)
  return sign > 0 ? 'positive' : 'negative'
}

// ===== LIFECYCLE =====
onMounted(() => {
  loadAllData()
  loadStockHistory()
})
</script>

<style scoped>
.stock-management-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.header {
  text-align: center;
  margin-bottom: 3rem;
  padding-bottom: 1rem;
  border-bottom: 3px solid #007bff;
}

.header h1 {
  font-size: 2.5rem;
  color: #333;
  margin: 0;
}

.subtitle {
  color: #666;
  font-size: 1.1rem;
  margin: 0.5rem 0 0 0;
}

section {
  background: #f9f9f9;
  border-radius: 12px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

section h2 {
  color: #007bff;
  font-size: 1.8rem;
  margin-top: 0;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 0.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  font-weight: 600;
  color: #333;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 1rem;
  background: white;
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.product-info {
  background: white;
  border-left: 4px solid #28a745;
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1.5rem;
}

.product-info h3 {
  margin: 0 0 0.5rem 0;
  color: #333;
}

.stock-value {
  font-size: 1.3rem;
  font-weight: bold;
  color: #28a745;
}

.btn-primary,
.btn-secondary {
  padding: 0.75rem 2rem;
  font-size: 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  display: inline-block;
}

.btn-primary {
  background: #007bff;
  color: white;
  margin-right: 0.5rem;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.4);
}

.btn-primary:disabled {
  background: #ccc;
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
  transform: translateY(-2px);
}

.alert {
  padding: 1rem;
  border-radius: 6px;
  margin-top: 1rem;
  font-weight: 500;
}

.alert-error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.alert-success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.filter-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: flex-end;
}

.loading,
.no-data {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-size: 1.1rem;
  background: white;
  border-radius: 6px;
}

.history-container {
  background: white;
  border-radius: 6px;
  padding: 1rem;
}

.product-history {
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 2px solid #e0e0e0;
}

.product-history:last-child {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.product-history h3 {
  color: #333;
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.3rem;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1.5rem;
}

.history-table thead {
  background: #f0f0f0;
  border-bottom: 2px solid #ddd;
}

.history-table th {
  padding: 0.75rem;
  text-align: left;
  font-weight: 600;
  color: #333;
  font-size: 0.95rem;
}

.history-table td {
  padding: 0.75rem;
  border-bottom: 1px solid #eee;
  font-size: 0.95rem;
}

.history-table tr:hover {
  background: #f9f9f9;
}

.quantity {
  font-weight: bold;
  text-align: right;
}

.quantity.positive {
  color: #28a745;
}

.quantity.negative {
  color: #dc3545;
}

.row-add {
  background: rgba(40, 167, 69, 0.05);
}

.row-remove {
  background: rgba(220, 53, 69, 0.05);
}

@media (max-width: 768px) {
  .stock-management-container {
    padding: 1rem;
  }

  .header h1 {
    font-size: 1.8rem;
  }

  section {
    padding: 1rem;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .filter-group {
    grid-template-columns: 1fr;
  }

  .history-table {
    font-size: 0.85rem;
  }

  .history-table th,
  .history-table td {
    padding: 0.5rem;
  }
}
</style>






