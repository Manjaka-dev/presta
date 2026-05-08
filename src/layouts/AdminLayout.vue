<script setup>
import AdminNavbar from '../components/AdminNavbar.vue'
</script>

<template>
  <div class="admin-layout">
    <AdminNavbar />
    <main class="admin-layout__content">
      <RouterView />
    </main>
  </div>
</template>

