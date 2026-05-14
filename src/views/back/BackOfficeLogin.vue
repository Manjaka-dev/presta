<script setup>
import { reactive } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const state = reactive({
  email: '',
  password: '',
  error: '',
  loading: false
})

const handleLogin = () => {
  state.error = ''
  state.loading = true
  
  setTimeout(() => {
    // Vérification en dur (===)
    if (state.email === 'admin@admin.com' && state.password === 'admin') {
      sessionStorage.setItem('isAdminLoggedIn', 'true')
      router.push('/back')
    } else {
      state.error = 'Identifiants incorrects.'
    }
    state.loading = false
  }, 500)
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h1 class="title">Administration</h1>
      <p class="subtitle">Connectez-vous à votre espace backoffice</p>
      
      <form @submit.prevent="handleLogin" class="form">
        <div class="form-group">
          <label for="email">Adresse e-mail</label>
          <input 
            type="email" 
            id="email" 
            value="admin@admin.com"
            v-model="state.email" 
            placeholder="admin@admin.com"
            required
          />
        </div>
        
        <div class="form-group">
          <label for="password">Mot de passe</label>
          <input 
            type="password" 
            id="password" 
            v-model="state.password" 
            value="admin"
            placeholder="••••••"
            required
          />
        </div>
        
        <div v-if="state.error" class="error-msg">
          {{ state.error }}
        </div>
        
        <button type="submit" class="btn" :disabled="state.loading">
          {{ state.loading ? 'Connexion...' : 'Se connecter' }}
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
  min-height: 100vh;
  background-color: #f3f4f6;
}

.login-card {
  background: white;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
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
  background-color: #3b82f6;
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
  background-color: #2563eb;
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
