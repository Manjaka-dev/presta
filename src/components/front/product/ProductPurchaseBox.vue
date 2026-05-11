<script setup>
import { computed } from 'vue'

const props = defineProps({ price: { type: String, default: '0.00' }, available: { type: Boolean, default: true }, availabilityLabel: { type: String, default: 'Disponible' }, selectionSummary: { type: String, default: '' }, modelValue: { type: Number, default: 1 } })
const emit = defineEmits(['add', 'update:modelValue'])
const quantity = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', Math.max(1, parseInt(value || 1))) })
</script>

<template>
  <aside class="purchase-box card">
	<div class="purchase-box__price-row">
	  <div class="purchase-box__price">{{ price }}€</div>
	  <span class="purchase-box__availability" :class="{ 'purchase-box__availability--out': !available }">{{ availabilityLabel }}</span>
	</div>
	<p v-if="selectionSummary" class="purchase-box__summary muted">{{ selectionSummary }}</p>
	<div class="purchase-box__actions">
	  <label class="purchase-box__quantity-label" for="product-quantity">Quantité</label>
	  <input id="product-quantity" v-model="quantity" type="number" min="1" class="purchase-box__quantity" :disabled="!available" />
	  <button class="button purchase-box__button" :disabled="!available" @click="emit('add')">{{ available ? 'Ajouter au panier' : 'Rupture de stock' }}</button>
	</div>
  </aside>
</template>

<style scoped>
.purchase-box{display:flex;flex-direction:column;gap:1rem;position:sticky;top:1rem}.purchase-box__price-row{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}.purchase-box__price{font-size:2rem;font-weight:800;color:var(--text)}.purchase-box__availability{padding:.35rem .65rem;border-radius:999px;background:#e9f7ef;color:#18794e;font-size:.82rem;font-weight:700}.purchase-box__availability--out{background:#fee;color:var(--danger)}.purchase-box__summary{font-size:.9rem}.purchase-box__actions{display:grid;grid-template-columns:110px 1fr;gap:.75rem;align-items:end}.purchase-box__quantity-label{grid-column:1 / -1;font-size:.9rem;font-weight:700}.purchase-box__quantity{border:1px solid var(--border);border-radius:10px;padding:.75rem .8rem;font-size:1rem;font-family:inherit}.purchase-box__button{justify-self:stretch}
</style>

