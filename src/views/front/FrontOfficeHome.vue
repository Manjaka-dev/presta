<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

// Redirection automatique vers le catalogue
onMounted(() => {
  router.push('/front/products')
})
</script>

<template>
  <section class="loading">
    <p>Chargement du catalogue...</p>
  </section>
</template>

<style scoped>
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  font-size: 1.1rem;
  color: #666;
}
</style>
