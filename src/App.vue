<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const isAnonymous = computed(() => sessionStorage.getItem('isAnonymous') === 'true')
const isFrontRoute = computed(() => route.path.startsWith('/front'))

const loginFromAnonymous = () => {
  router.push({ name: 'front-login' })
}
</script>

<template>
  <!-- Bandeau connexion pour les anonymes -->
  <div v-if="isFrontRoute && isAnonymous" class="anon-banner">
    <span>👤 Vous naviguez en mode <strong>anonyme</strong></span>
    <button @click="loginFromAnonymous" class="anon-btn">Se connecter</button>
  </div>
  <RouterView />
</template>

<style>
.anon-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.6rem 1.5rem;
  background: linear-gradient(90deg, #f59e0b, #d97706);
  color: white;
  font-size: 0.9rem;
  position: sticky;
  top: 0;
  z-index: 100;
}
.anon-btn {
  padding: 0.35rem 1rem;
  background: white;
  color: #d97706;
  border: none;
  border-radius: 20px;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
  transition: opacity 0.2s;
}
.anon-btn:hover { opacity: 0.85; }
</style>
