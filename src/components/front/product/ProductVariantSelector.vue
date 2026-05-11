<script setup>
import { computed } from 'vue'

const props = defineProps({
  groups: { type: Array, default: () => [] },
  selectedValues: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['select'])

const knownColors = {
  noir: '#111827', black: '#111827', blacke: '#111827',
  blanc: '#ffffff', white: '#ffffff',
  gris: '#6b7280', gray: '#6b7280', grey: '#6b7280',
  rouge: '#ef4444', red: '#ef4444',
  bleu: '#3b82f6', blue: '#3b82f6',
  vert: '#10b981', green: '#10b981',
  jaune: '#f59e0b', yellow: '#f59e0b',
  orange: '#f97316',
  rose: '#ec4899', pink: '#ec4899',
  violet: '#8b5cf6', purple: '#8b5cf6',
  marron: '#92400e', brown: '#92400e',
  beige: '#d6b38a', marine: '#1d4ed8',
}

const hashColor = (text = '') => {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = text.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 72% 55%)`
}

const resolveSwatchColor = (label = '') => {
  const normalized = String(label).trim().toLowerCase()
  return knownColors[normalized] || knownColors[normalized.replace(/^l'|^la |^le |^les /, '')] || hashColor(normalized)
}

const isColorGroup = (group) => /color|couleur|colour|teinte|shade|nuance/i.test(group?.label || '')
const isSizeGroup = (group) => /taille|size|pointure|dimension|format/i.test(group?.label || '')

const titleFor = (group) => {
  if (!group?.label) return 'Option'
  return group.label.charAt(0).toUpperCase() + group.label.slice(1)
}

const groupsWithDecorations = computed(() => props.groups.map(group => ({
  ...group,
  isColor: isColorGroup(group),
  isSize: isSizeGroup(group),
  title: titleFor(group),
  options: (group.options || []).map(option => ({
    ...option,
    swatchColor: option.swatchColor || resolveSwatchColor(option.label),
  })),
})))
</script>

<template>
  <section v-if="groupsWithDecorations.length" class="variant-selector card">
    <div v-for="group in groupsWithDecorations" :key="group.id" class="variant-selector__group">
      <div class="variant-selector__header">
        <h2>{{ group.title }}</h2>
      </div>

      <div class="variant-selector__options" :class="{ 'variant-selector__options--color': group.isColor, 'variant-selector__options--size': group.isSize }">
        <button
          v-for="option in group.options"
          :key="option.id"
          type="button"
          class="variant-option"
          :class="{
            'variant-option--active': String(selectedValues[group.id]) === String(option.id),
            'variant-option--color': group.isColor,
            'variant-option--size': group.isSize,
          }"
          :disabled="!option.available"
          @click="emit('select', { groupId: group.id, optionId: option.id })"
        >
          <span
            v-if="group.isColor"
            class="variant-option__swatch"
            :style="{ background: option.swatchColor }"
            :title="option.label"
          />
          <span class="variant-option__label">{{ option.label }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.variant-selector{display:flex;flex-direction:column;gap:1rem}.variant-selector__group{display:flex;flex-direction:column;gap:.65rem;padding-bottom:1rem;border-bottom:1px solid var(--border)}.variant-selector__group:last-child{padding-bottom:0;border-bottom:none}.variant-selector__header h2{margin:0;font-size:1rem;font-weight:700}.variant-selector__options{display:flex;flex-wrap:wrap;gap:.5rem}.variant-option{display:inline-flex;align-items:center;gap:.55rem;border:1px solid var(--border);background:#fff;border-radius:999px;padding:.55rem .85rem;cursor:pointer;font-weight:600;color:var(--text);transition:.15s ease}.variant-option:hover:not(:disabled){border-color:var(--primary)}.variant-option:disabled{opacity:.45;cursor:not-allowed}.variant-option--active{border-color:var(--primary);box-shadow:0 0 0 2px rgba(55,93,251,.12)}.variant-option--color{border-radius:16px;min-width:72px;justify-content:center}.variant-option__swatch{width:16px;height:16px;border-radius:999px;border:1px solid rgba(0,0,0,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}.variant-option__label{font-size:.92rem}.variant-option--size{min-width:56px;justify-content:center}
</style>

