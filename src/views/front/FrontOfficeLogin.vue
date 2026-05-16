<script setup>
import { reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData'
import { setCustomerId } from '@/api/customerIdentity'
import { useCart } from '@/api/useCart'

const router = useRouter()
const { loadCustomerCart } = useCart()

const state = reactive({
  customers: [],
  loadingList: true,
  error: '',
  loading: false,
})

// Charger la liste des clients réels (groupe 3 = client)
onMounted(async () => {
  try {
    const api = resourceApi('customers')
    const res = await api.list({
      display: '[id,firstname,lastname,email,id_default_group,active]',
      limit: 100,
    })
    const all = extractItems(res, api.resource)
    state.customers = all.filter(c => {
      const active = c.active === '1' || c.active === 1
      const groupId = parseInt(c.id_default_group)
      return active && groupId >= 3
    })
  } catch (e) {
    console.error('[Login] Erreur chargement clients:', e)
  } finally {
    state.loadingList = false
  }
})

const selectCustomer = async (customer) => {
  state.loading = true
  // Connexion directe sans mot de passe selon la directive "à la place du login"
  sessionStorage.removeItem('isAnonymous')
  setCustomerId(customer.id)

  // Charger le dernier panier actif pour ce client
  await loadCustomerCart(customer.id)

  state.loading = false
  router.push('/front/products')
}

const selectAnonymous = async () => {
  state.loading = true
  state.error = ''
  try {
    const email = 'anonyme@presta.local'
    const apiC = resourceApi('customers')
    let customerId = null

    // Chercher si l'utilisateur anonyme existe déjà
    try {
      const resSearch = await apiC.list({ 'filter[email]': `[${email}]`, display: '[id]' })
      const found = extractItems(resSearch, apiC.resource)
      if (found && found.length > 0) {
        customerId = parseInt(found[0].id)
      }
    } catch (e) {
      // Ignorer l'erreur de recherche
    }

    if (!customerId) {
      // Créer le client anonyme unique
      const xmlCustomer = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <customer>
    <id_lang>1</id_lang>
    <id_default_group>1</id_default_group>
    <firstname>Anonyme</firstname>
    <lastname>Visiteur</lastname>
    <email>${email}</email>
    <passwd>12345678</passwd>
    <active>1</active>
    <is_guest>1</is_guest>
  </customer>
</prestashop>`

      const resC = await apiC.create(xmlCustomer)
      const matchC = resC.match(/<id>[^0-9]*(\d+)[^0-9]*<\/id>/i)
      if (!matchC) throw new Error("Échec création client anonyme")
      customerId = parseInt(matchC[1])

      // Créer une adresse par défaut pour l'anonyme
      const xmlAddr = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
  <address>
    <id_customer>${customerId}</id_customer>
    <id_country>8</id_country>
    <alias>Mon adresse</alias>
    <lastname>Visiteur</lastname>
    <firstname>Anonyme</firstname>
    <address1>12 rue de la Paix</address1>
    <postcode>75001</postcode>
    <city>Paris</city>
  </address>
</prestashop>`

      const apiA = resourceApi('addresses')
      await apiA.create(xmlAddr)
    }

    // Connecter l'utilisateur anonyme
    sessionStorage.setItem('isAnonymous', 'true')
    setCustomerId(customerId)

    // Charger le panier partagé pour tous les anonymes
    await loadCustomerCart(customerId)

    router.push('/front/products')
  } catch (error) {
    state.error = 'Erreur lors de la configuration de l\'utilisateur anonyme : ' + error.message
  } finally {
    state.loading = false
  }
}

const getInitials = (c) => {
  const f = (c.firstname || '?')[0].toUpperCase()
  const l = (c.lastname || '?')[0].toUpperCase()
  return f + l
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-logo">🛍️</div>
      <h1 class="login-title">Bienvenue</h1>
      <p class="login-subtitle">Choisissez avec quel utilisateur vous souhaitez naviguer</p>

      <div v-if="state.error" class="error-msg">{{ state.error }}</div>

      <div v-if="state.loadingList || state.loading" class="loading-customers">
        Veuillez patienter...
      </div>

      <div v-else class="customers-grid">
        <!-- Cartes clients -->
        <button
          v-for="c in state.customers"
          :key="c.id"
          class="customer-card"
          @click="selectCustomer(c)"
        >
          <div class="customer-avatar">{{ getInitials(c) }}</div>
          <div class="customer-name">{{ c.firstname }} {{ c.lastname }}</div>
          <div class="customer-email">{{ c.email }}</div>
        </button>

        <!-- Carte Anonyme -->
        <button class="customer-card customer-card--anonymous" @click="selectAnonymous">
          <div class="customer-avatar avatar--anon">👤</div>
          <div class="customer-name">Anonyme</div>
          <div class="customer-email">Naviguer en anonyme</div>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.login-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
  padding: 2.5rem;
  width: 100%;
  max-width: 680px;
}

.login-logo { font-size: 3rem; text-align: center; margin-bottom: 0.5rem; }
.login-title { margin: 0 0 0.3rem; font-size: 1.8rem; text-align: center; color: #1a1a2e; }
.login-subtitle { margin: 0 0 1.5rem; color: #6b7280; text-align: center; }

.loading-customers { text-align: center; color: #6b7280; padding: 2rem; font-weight: 500; }

.customers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}

.customer-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.25rem 1rem;
  background: #f8faff;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
  font-family: inherit;
}
.customer-card:hover {
  border-color: #667eea;
  background: #f0f0ff;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102,126,234,0.15);
}
.customer-card--anonymous {
  border-style: dashed;
  border-color: #d1d5db;
  background: #fafafa;
}
.customer-card--anonymous:hover { border-color: #9ca3af; background: #f3f4f6; }

.customer-avatar {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  font-size: 1.2rem;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}
.avatar--anon { background: linear-gradient(135deg, #9ca3af, #6b7280); font-size: 1.5rem; }

.customer-name { font-weight: 600; font-size: 0.9rem; color: #111827; }
.customer-email { font-size: 0.75rem; color: #6b7280; word-break: break-all; }

.error-msg {
  color: #ef4444;
  font-size: 0.875rem;
  background: #fef2f2;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid #fee2e2;
  margin-bottom: 1rem;
  text-align: center;
}
</style>
