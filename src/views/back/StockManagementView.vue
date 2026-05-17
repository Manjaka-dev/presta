<template>
  <div class="stock-management-container">
    <div class="header">
      <h1>Gestion du Stock</h1>
      <p class="subtitle">Ajouter ou retirer du stock des produits et de leurs déclinaisons</p>
    </div>

    <!-- Section: Ajouter/Retirer du stock -->
    <section class="add-stock-section">
      <h2>Mouvement de Stock</h2>

      <div class="form-group">
        <label for="product-select">Sélectionner un produit :</label>
        <select v-model="form.productId" id="product-select" @change="onProductSelect">
          <option value="">-- Choisir un produit --</option>
          <option v-for="product in products" :key="product.id" :value="product.id">
            {{ getProductName(product) }} (réf: {{ product.reference || product.id }})
          </option>
        </select>
      </div>

      <div class="form-group" v-if="form.productId && state.combinations.length > 0">
        <label for="combination-select">Sélectionner une déclinaison :</label>
        <select v-model="form.productAttributeId" id="combination-select" @change="onCombinationSelect">
          <option value="0">-- Produit principal (sans déclinaison) --</option>
          <option v-for="combo in state.combinations" :key="combo.id" :value="combo.id">
            {{ getCombinationName(combo.associations?.product_option_values) }} (réf: {{ combo.reference || combo.id }})
          </option>
        </select>
      </div>

      <div v-if="form.productId" class="product-info">
        <span v-if="currentStockLoading">⏳ Chargement du stock...</span>
        <template v-else>
          <h3>{{ selectedProductDisplay }}</h3>
          <p>
            <strong>Stock actuel :</strong>
            <span class="stock-value" :class="{ 'text-danger': currentStock <= 0 }">{{ currentStock !== null ? currentStock : '—' }}</span> unités
          </p>
        </template>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="quantity">Quantité (positive pour ajout, négative pour retrait) :</label>
          <input
            v-model.number="form.quantity"
            id="quantity"
            type="number"
            placeholder="ex: 10 ou -5"
          />
        </div>

        <div class="form-group">
          <label for="reason">Raison du mouvement :</label>
          <select v-model="form.reasonId" id="reason">
            <option value="">-- Choisir une raison --</option>
            <option v-for="reason in stockReasons" :key="reason.id" :value="reason.id">
              {{ getReasonName(reason) }}
            </option>
          </select>
        </div>
      </div>

      <button
        @click="addStock"
        :disabled="!isFormValid || isSubmitting"
        class="btn-primary"
      >
        <span v-if="!isSubmitting">✅ Enregistrer le mouvement</span>
        <span v-else>⏳ Traitement...</span>
      </button>

      <div v-if="submitError" class="alert alert-error">{{ submitError }}</div>
      <div v-if="submitSuccess" class="alert alert-success">{{ submitSuccess }}</div>
    </section>

    <!-- Section: Historique des mouvements -->
    <section class="history-section">
      <h2>Historique d'Évolution du Stock</h2>

      <div class="filter-group">
        <div class="form-group">
          <label for="filter-product">Filtrer par produit :</label>
          <select v-model="filterProductId" id="filter-product" @change="applyFilters">
            <option value="">-- Tous les produits --</option>
            <option v-for="product in products" :key="product.id" :value="product.id">
              {{ getProductName(product) }}
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
            @change="applyFilters"
          />
        </div>

        <button @click="loadStockHistory" class="btn-secondary">🔄 Rafraîchir</button>
      </div>

      <div v-if="historyLoading" class="loading">
        ⏳ Chargement de l'historique...
      </div>

      <div v-else-if="Object.keys(stockHistoryGrouped).length === 0" class="no-data">
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
                <th>Date</th>
                <th>Quantité</th>
                <th>Raison</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(movement, idx) in group" :key="idx" :class="movementRowClass(movement)">
                <td>{{ formatDate(movement.date_add) }}</td>
                <td class="quantity" :class="getQuantityClass(movement)">
                  {{ getSignedQuantity(movement) }}
                </td>
                <td>{{ movement.reason }}</td>
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
import { extractItems } from '@/utils/resourceData'
import {
  loadAllProducts,
  loadStockReasons,
  loadStockAvailablesMap,
  loadProductCombinations,
  loadStockAvailable,
  loadStockMovements,
  createStockMovement,
  enrichStockMovements,
} from '@/api/stockService'

// ===== STATE =====
const form = reactive({
  productId: '',
  productAttributeId: '0',
  quantity: 0,
  reasonId: '',
})

const state = reactive({
  loading: false,
  products: [],
  stockReasons: [],
  combinations: [],
  allCombinations: [], // Pour l'enrichissement de l'historique global
  stockHistory: [],
  historyLoading: false,
  stockAvailablesMap: {},
})

const currentStock = ref(null)
const currentStockLoading = ref(false)
const filterProductId = ref('')
const filterDays = ref(30)
const isSubmitting = ref(false)
const submitError = ref('')
const submitSuccess = ref('')

// ===== COMPUTED =====
const products = computed(() => state.products)
const stockReasons = computed(() => state.stockReasons)

const selectedProduct = computed(() =>
  form.productId ? state.products.find(p => String(p.id) === String(form.productId)) : null
)

const selectedProductDisplay = computed(() => {
  if (!selectedProduct.value) return ''
  let name = getProductName(selectedProduct.value)
  if (form.productAttributeId !== '0') {
    const combo = state.combinations.find(c => String(c.id) === String(form.productAttributeId))
    if (combo) {
      name += ` - ${getCombinationName(combo.associations?.product_option_values)}`
    }
  }
  return name
})

const isFormValid = computed(() =>
  form.productId && form.quantity !== 0 && form.reasonId
)

const historyLoading = computed(() => state.historyLoading)

const stockHistoryGrouped = computed(() => {
  const grouped = {}
  state.stockHistory.forEach(movement => {
    const key = movement.productName || `Produit ${movement.id_product || movement.id_stock}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(movement)
  })
  return grouped
})

// ===== METHODS =====

// Helpers pour nettoyer les noms multilingues
const getProductName = (product) => {
  if (!product || !product.name) return 'Produit inconnu'
  return typeof product.name === 'object' ? (Object.values(product.name)[0] || '') : String(product.name)
}

const getReasonName = (reason) => {
  if (!reason || !reason.name) return 'Raison inconnue'
  return typeof reason.name === 'object' ? (Object.values(reason.name)[0] || '') : String(reason.name)
}

const getCombinationName = (values) => {
    if (!values || !Array.isArray(values)) return ''
    return values.map(v => v.value || v.id).join(', ')
}

// Charge toutes les déclinaisons de tous les produits (pour l'historique)
const loadAllCombinations = async () => {
    try {
        const api = resourceApi('combinations')
        const response = await api.list({ display: 'full', limit: 1000 })
        const items = extractItems(response, api.resource)

        // Pour chaque déclinaison, il faut récupérer les noms des options
        // Mais pour simplifier et optimiser, on va juste stocker les IDs d'options
        // ou essayer de trouver les noms si on a accès à product_option_values.
        // L'API PrestaShop renvoie souvent un nom simplifié si on demande display=full
        state.allCombinations = items
    } catch(e) {
        console.error("Erreur chargement all combinations", e)
    }
}

const loadAllData = async () => {
  try {
    state.loading = true
    const [productsRes, reasons, stockAvailablesMap] = await Promise.all([
      loadAllProducts(),
      loadStockReasons(),
      loadStockAvailablesMap(),
    ])
    state.products = productsRes
    state.stockReasons = reasons
    state.stockAvailablesMap = stockAvailablesMap
    await loadAllCombinations()
  } catch (error) {
    console.error('[StockManagement] Erreur chargement données:', error)
    submitError.value = 'Impossible de charger les données initiales'
  } finally {
    state.loading = false
  }
}

const onProductSelect = async () => {
  submitError.value = ''
  submitSuccess.value = ''
  currentStock.value = null
  form.productAttributeId = '0'
  state.combinations = []

  if (!form.productId) return

  try {
    currentStockLoading.value = true
    // Charger les déclinaisons du produit
    state.combinations = await loadProductCombinations(form.productId)

    // Charger le stock par défaut
    await loadCurrentStock()
  } catch (error) {
    console.error('[StockManagement] Erreur sélection produit:', error)
    submitError.value = "Erreur lors de la sélection du produit."
  } finally {
    currentStockLoading.value = false
  }
}

const onCombinationSelect = async () => {
  submitError.value = ''
  submitSuccess.value = ''
  await loadCurrentStock()
}

const loadCurrentStock = async () => {
  try {
    currentStockLoading.value = true
    const stockAvail = await loadStockAvailable(form.productId, form.productAttributeId)
    currentStock.value = stockAvail ? parseInt(stockAvail.quantity || 0) : 0
  } catch (error) {
    console.error('[StockManagement] Erreur chargement stock actuel:', error)
    currentStock.value = 0
  } finally {
    currentStockLoading.value = false
  }
}

const addStock = async () => {
  if (!isFormValid.value) {
    submitError.value = 'Veuillez remplir tous les champs correctement.'
    return
  }

  isSubmitting.value = true
  submitError.value = ''
  submitSuccess.value = ''

  try {
    const qty = parseInt(form.quantity)
    const { newQty } = await createStockMovement({
      productId: form.productId,
      productAttributeId: form.productAttributeId,
      quantity: qty,
      reasonId: form.reasonId,
    })

    const actionText = qty > 0 ? `Ajout de ${qty}` : `Retrait de ${Math.abs(qty)}`
    submitSuccess.value = `✅ Mouvement enregistré : ${actionText}. Nouveau stock : ${newQty}`

    currentStock.value = newQty
    form.quantity = 0
    form.reasonId = ''

    // Rafraîchir les données
    await Promise.all([loadStockAvailablesMap().then(m => state.stockAvailablesMap = m), loadStockHistory()])
  } catch (error) {
    console.error('[StockManagement] Erreur enregistrement stock:', error)
    submitError.value = error.message || "Erreur lors de l'enregistrement du mouvement."
  } finally {
    isSubmitting.value = false
  }
}

const loadStockHistory = async () => {
  try {
    state.historyLoading = true

    let movements = await loadStockMovements()

    if (filterDays.value) {
      const limitDate = new Date()
      limitDate.setDate(limitDate.getDate() - filterDays.value)
      movements = movements.filter(m => {
        if (!m.date_add) return true
        return new Date(m.date_add) >= limitDate
      })
    }

    const enriched = enrichStockMovements(
      movements,
      state.products,
      state.stockReasons,
      state.stockAvailablesMap,
      state.allCombinations
    )

    if (filterProductId.value) {
      state.stockHistory = enriched.filter(
        m => String(m.id_product) === String(filterProductId.value)
      )
    } else {
      state.stockHistory = enriched
    }
  } catch (error) {
    console.error('[StockManagement] Erreur chargement historique:', error)
    // Ne pas bloquer l'UI si l'historique échoue, juste l'afficher vide ou un message
  } finally {
    state.historyLoading = false
  }
}

const applyFilters = () => loadStockHistory()

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
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
  const effective = qty * sign
  return effective > 0 ? `+${effective}` : String(effective)
}

const getQuantityClass = (movement) => {
  const sign = parseInt(movement.sign || 1)
  return sign > 0 ? 'positive' : 'negative'
}

// ===== LIFECYCLE =====
onMounted(async () => {
  await loadAllData()
  await loadStockHistory()
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

.header h1 { font-size: 2.5rem; color: #333; margin: 0; }
.subtitle { color: #666; font-size: 1.1rem; margin: 0.5rem 0 0 0; }

section {
  background: #f9f9f9;
  border-radius: 12px;
  padding: 2rem;
  margin-bottom: 2rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

section h2 {
  color: #007bff;
  font-size: 1.8rem;
  margin-top: 0;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 0.5rem;
}

.form-group { margin-bottom: 1rem; }

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
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0,123,255,0.1);
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

.product-info h3 { margin: 0 0 0.5rem 0; color: #333; }

.stock-value {
  font-size: 1.3rem;
  font-weight: bold;
  color: #28a745;
}
.text-danger {
  color: #dc3545;
}

.btn-primary, .btn-secondary {
  padding: 0.75rem 2rem;
  font-size: 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  display: inline-block;
}

.btn-primary { background: #007bff; color: white; margin-right: 0.5rem; }
.btn-primary:hover:not(:disabled) { background: #0056b3; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,123,255,0.4); }
.btn-primary:disabled { background: #ccc; cursor: not-allowed; opacity: 0.6; }
.btn-secondary { background: #6c757d; color: white; }
.btn-secondary:hover { background: #545b62; transform: translateY(-2px); }

.alert {
  padding: 1rem;
  border-radius: 6px;
  margin-top: 1rem;
  font-weight: 500;
}

.alert-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
.alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }

.filter-group {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
  align-items: flex-end;
}

.loading, .no-data {
  text-align: center;
  padding: 2rem;
  color: #666;
  font-size: 1.1rem;
  background: white;
  border-radius: 6px;
}

.history-container { background: white; border-radius: 6px; padding: 1rem; }

.product-history {
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 2px solid #e0e0e0;
}

.product-history:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.product-history h3 { color: #333; margin-top: 0; margin-bottom: 1rem; font-size: 1.3rem; }

.history-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1.5rem;
}

.history-table thead { background: #f0f0f0; border-bottom: 2px solid #ddd; }
.history-table th { padding: 0.75rem; text-align: left; font-weight: 600; color: #333; font-size: 0.95rem; }
.history-table td { padding: 0.75rem; border-bottom: 1px solid #eee; font-size: 0.95rem; }
.history-table tr:hover { background: #f9f9f9; }

.quantity { font-weight: bold; text-align: right; }
.quantity.positive { color: #28a745; }
.quantity.negative { color: #dc3545; }
.row-add { background: rgba(40, 167, 69, 0.05); }
.row-remove { background: rgba(220, 53, 69, 0.05); }

@media (max-width: 768px) {
  .stock-management-container { padding: 1rem; }
  .header h1 { font-size: 1.8rem; }
  section { padding: 1rem; }
  .form-row, .filter-group { grid-template-columns: 1fr; }
  .history-table { font-size: 0.85rem; }
  .history-table th, .history-table td { padding: 0.5rem; }
}
</style>