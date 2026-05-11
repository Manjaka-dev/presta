<script setup>
import { ref, onMounted, watch } from 'vue'
import AdminNavbar from '../components/AdminNavbar.vue'

// collapsed state for the side navigation; passed to AdminNavbar via default v-model (modelValue)
const COLLAPSED_KEY = 'admin_sidebar_collapsed'
const collapsed = ref(false)

onMounted(() => {
  try {
    const s = localStorage.getItem(COLLAPSED_KEY)
    collapsed.value = s === '1'
  } catch (e) {
    collapsed.value = false
  }
})

watch(collapsed, (v) => {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0')
  } catch (e) {}
})
</script>

<template>
  <div :class="['admin-layout', { 'admin-layout--collapsed': collapsed }]">
    <!-- use default v-model (modelValue) expected by AdminNavbar -->
    <AdminNavbar v-model="collapsed" />
    <main class="admin-layout__content">
      <RouterView />
    </main>
  </div>
</template>

