<script setup>
import { reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData'
import { setCustomerId } from '@/api/customerIdentity'

const router = useRouter()

const state = reactive({
  step: 'list', // 'list' | 'password'
  customers: [],
  loadingList: true,
  selectedCustomer: null,
  email: '',
  password: '',
  error: '',
  loading: false,
})

const HARDCODED_PASSWORD = 'client'

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

const selectCustomer = (customer) => {
  state.selectedCustomer = customer
  state.email = customer.email
  state.step = 'password'
  state.error = ''
  state.password = ''
}

const selectAnonymous = () => {
  sessionStorage.setItem('customerId', '0')
  sessionStorage.setItem('isAnonymous', 'true')
  router.push('/front/products')
}

const goBack = () => {
  state.step = 'list'
  state.selectedCustomer = null
  state.password = ''
  state.error = ''
}

const handleLogin = async () => {
  state.error = ''
  if (state.password !== HARDCODED_PASSWORD) {
    state.error = 'Mot de passe incorrect.'
    return
  }
  state.loading = true
  try {
    const api = resourceApi('customers')
    const response = await api.list({ 'filter[email]': `[${state.email}]`, display: 'full' })
    const customers = extractItems(response, api.resource)
    if (!customers || customers.length === 0) {
      state.error = 'Aucun compte trouvé avec cette adresse email.'
      return
    }
    const customer = customers[0]
    if (customer.active !== '1') { state.error = 'Ce compte est inactif.'; return }
    const groupId = parseInt(customer.id_default_group)
    if (groupId < 3) { state.error = 'Compte visiteur ou invité non autorisé.'; return }
    sessionStorage.removeItem('isAnonymous')
    setCustomerId(customer.id)
    router.push('/front/products')
  } catch (error) {
    state.error = 'Une erreur est survenue lors de la vérification du compte.'
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
      <h1 class="login-title">Connexion</h1>

      <!-- ÉTAPE 1 : Sélection du client -->
      <div v-if="state.step === 'list'">
        <p class="login-subtitle">Choisissez votre compte</p>

        <div v-if="state.loadingList" class="loading-customers">
          Chargement des comptes…
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
            <div class="customer-email">Continuer sans compte</div>
          </button>
        </div>
      </div>

      <!-- ÉTAPE 2 : Saisie du mot de passe -->
      <div v-else-if="state.step === 'password'">
        <div class="selected-customer">
          <div class="customer-avatar sm">{{ getInitials(state.selectedCustomer) }}</div>
          <div>
            <strong>{{ state.selectedCustomer.firstname }} {{ state.selectedCustomer.lastname }}</strong>
            <div class="customer-email">{{ state.email }}</div>
          </div>
        </div>

        <form @submit.prevent="handleLogin" class="password-form">
          <div class="form-group">
            <label for="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              v-model="state.password"
              placeholder="Votre mot de passe"
              autofocus
              required
            />
          </div>
          <div v-if="state.error" class="error-msg">{{ state.error }}</div>
          <div class="form-actions">
            <button type="button" class="btn btn--ghost" @click="goBack">← Retour</button>
            <button type="submit" class="btn btn--primary" :disabled="state.loading">
              {{ state.loading ? 'Vérification…' : 'Se connecter' }}
            </button>
          </div>
        </form>
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

.loading-customers { text-align: center; color: #6b7280; padding: 2rem; }

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
.customer-avatar.sm { width: 44px; height: 44px; font-size: 1rem; }

.customer-name { font-weight: 600; font-size: 0.9rem; color: #111827; }
.customer-email { font-size: 0.75rem; color: #6b7280; word-break: break-all; }

.selected-customer {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f0f0ff;
  border-radius: 10px;
  margin-bottom: 1.5rem;
}

.password-form { display: flex; flex-direction: column; gap: 1.25rem; }

.form-group { display: flex; flex-direction: column; gap: 0.5rem; }
.form-group label { font-size: 0.875rem; font-weight: 500; color: #374151; }
.form-group input {
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s;
}
.form-group input:focus { border-color: #667eea; box-shadow: 0 0 0 3px rgba(102,126,234,0.15); }

.error-msg {
  color: #ef4444;
  font-size: 0.875rem;
  background: #fef2f2;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid #fee2e2;
}

.form-actions { display: flex; gap: 0.75rem; }

.btn {
  flex: 1;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.btn--primary { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
.btn--primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
.btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
.btn--ghost { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.btn--ghost:hover { background: #e5e7eb; }
</style>
