<script setup>
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData'
import { setCustomerId } from '@/api/customerIdentity'

const router = useRouter()

const state = reactive({
  email: '',
  password: '',
  error: '',
  loading: false
})

const HARDCODED_PASSWORD = 'client'

const handleLogin = async () => {
  state.error = ''
  
  // if (state.password !== HARDCODED_PASSWORD) {
  //   state.error = 'Mot de passe incorrect.'
  //   return
  // }

  state.loading = true
  
  try {
    const api = resourceApi('customers')
    // Utiliser le filtre direct sans crochets autour de la valeur comme stipulé dans les bonnes pratiques du projet
    const response = await api.list({
      'filter[email]': state.email,
      display: 'full'
    })
    
    const customers = extractItems(response, api.resource)
    
    if (!customers || customers.length === 0) {
      state.error = 'Aucun compte trouvé avec cette adresse email.'
      return
    }
    
    const customer = customers[0]
    
    // Vérifier la validité (active = 1) et si c'est un vrai client (groupe par défaut > 2, car 1=visiteur, 2=invité)
    if (customer.active !== '1') {
      state.error = 'Ce compte est inactif.'
      return
    }
    
    const groupId = parseInt(customer.id_default_group)
    if (groupId === 1 || groupId === 2) {
      state.error = 'Ce compte appartient à un visiteur ou invité, pas à un vrai client.'
      return
    }
    
    // Tout est bon
    setCustomerId(customer.id)
    router.push('/front/products')
    
  } catch (error) {
    console.error('Erreur lors de la connexion:', error)
    state.error = 'Une erreur est survenue lors de la vérification du compte.'
  } finally {
    state.loading = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h1 class="title">Connexion Client</h1>
      <p class="subtitle">Accédez à votre espace d'achat</p>
      
      <form @submit.prevent="handleLogin" class="form">
        <div class="form-group">
          <label for="email">Adresse e-mail</label>
          <input 
            type="email" 
            id="email" 
            v-model="state.email" 
            placeholder="votre@email.com"
            required
          />
        </div>
        
        <div class="form-group">
          <label for="password">Mot de passe</label>
          <input 
            type="password" 
            id="password" 
            v-model="state.password" 
            placeholder="Mot de passe"
            required
          />
        </div>
        
        <div v-if="state.error" class="error-msg">
          {{ state.error }}
        </div>
        
        <button type="submit" class="btn" :disabled="state.loading">
          {{ state.loading ? 'Vérification...' : 'Se connecter' }}
        </button>
      </form>
      
      <div class="back-link">
        <RouterLink to="/">Retour à l'accueil du site</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 100px); /* Ajuster selon le layout du site */
  padding: 2rem;
}

.login-card {
  background: white;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border: 1px solid #e5e7eb;
  width: 100%;
  max-width: 400px;
}

.title {
  margin: 0 0 0.5rem;
  font-size: 1.75rem;
  color: #111827;
  text-align: center;
}

.subtitle {
  margin: 0 0 2rem;
  color: #6b7280;
  text-align: center;
  font-size: 0.9rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
}

.form-group input {
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 1rem;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.error-msg {
  color: #ef4444;
  font-size: 0.875rem;
  text-align: center;
  background: #fef2f2;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid #fee2e2;
}

.btn {
  background-color: #10b981; /* Vert pour le front office pour différencier du backoffice (bleu) */
  color: white;
  border: none;
  padding: 0.75rem;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
  margin-top: 0.5rem;
}

.btn:hover:not(:disabled) {
  background-color: #059669;
}

.btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.back-link {
  margin-top: 1.5rem;
  text-align: center;
  font-size: 0.875rem;
}

.back-link a {
  color: #6b7280;
  text-decoration: none;
}

.back-link a:hover {
  color: #374151;
  text-decoration: underline;
}
</style>
