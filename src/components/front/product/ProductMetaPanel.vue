<script setup>
defineProps({ product: { type: Object, required: true }, categories: { type: Array, default: () => [] }, selectionSummary: { type: String, default: '' } })
</script>

<template>
  <section class="product-meta card">
	<p v-if="selectionSummary" class="product-meta__selection muted">{{ selectionSummary }}</p>
	<h1 class="product-meta__title">{{ product.name }}</h1>
	<p v-if="product.reference" class="product-meta__reference muted">Référence : <strong>{{ product.reference }}</strong></p>
	<div v-if="categories.length" class="product-meta__categories">
	  <span v-for="category in categories" :key="category.id" class="product-meta__chip">{{ category.name }}</span>
	</div>
	<div v-if="product.descriptionShort" class="product-meta__excerpt" v-html="product.descriptionShort"></div>
	<div v-if="product.description" class="product-meta__description">
	  <h2>Description</h2>
	  <div class="product-meta__description-body" v-html="product.description"></div>
	</div>
  </section>
</template>

<style scoped>
.product-meta{display:flex;flex-direction:column;gap:1rem}.product-meta__selection{font-size:.85rem;text-transform:uppercase;letter-spacing:.04em}.product-meta__title{margin:0;font-size:2rem;line-height:1.2}.product-meta__reference{font-size:.92rem}.product-meta__categories{display:flex;flex-wrap:wrap;gap:.5rem}.product-meta__chip{padding:.35rem .7rem;border-radius:999px;background:#eff3ff;color:var(--primary);font-size:.85rem;font-weight:600}.product-meta__excerpt,.product-meta__description-body{color:var(--text);line-height:1.7}.product-meta__description h2{margin:0 0 .75rem;font-size:1.1rem}
</style>

