<script setup>
import { useRouter } from 'vue-router'

const router = useRouter()

const handleLogout = () => {
  sessionStorage.removeItem('isAdminLoggedIn')
  router.push('/back/login')
}
</script>

<template>
  <section class="home">
    <div class="home__content">
      <h1>Back Office</h1>
      <p class="muted">Point d'entree du back office.</p>
      <div class="button-row" style="justify-content: center; flex-wrap: wrap;">
        <RouterLink to="/back/dashboard" class="button button--primary">Dashboard</RouterLink>
        <RouterLink to="/back/statistics" class="button button--primary">Statistiques</RouterLink>
        <RouterLink to="/back/orders" class="button">Commandes</RouterLink>
        <RouterLink to="/back/import" class="button">Import CSV</RouterLink>
        <RouterLink to="/back/reset" class="button">Reset data</RouterLink>
        <RouterLink to="/back/stock" class="button">Stock</RouterLink>
        <RouterLink to="/" class="button button--ghost">Retour accueil</RouterLink>
        <button @click="handleLogout" class="button button--danger">Déconnexion</button>
      </div>
    </div>
  </section>
</template>