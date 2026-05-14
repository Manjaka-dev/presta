<script setup>
import { reactive, computed, onMounted, nextTick } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'
import { useCart } from '@/api/useCart'
import { getProductImageUrl } from '@/api/httpClient'
import ProductMediaGallery from '@/components/front/product/ProductMediaGallery.vue'
import ProductMetaPanel from '@/components/front/product/ProductMetaPanel.vue'
import ProductVariantSelector from '@/components/front/product/ProductVariantSelector.vue'
import ProductPurchaseBox from '@/components/front/product/ProductPurchaseBox.vue'

const route = useRoute(); const { addItem, itemCount: cartItemCount } = useCart(); const productId = parseInt(route.params.id)
const state = reactive({ loading: true, error: '', product: null, images: [], categories: [], combinations: [] })
const view = reactive({ activeImageIndex: 0, quantity: 1, selectedVariants: {} })
const toArray = (v) => Array.isArray(v) ? v : v ? [v] : []
const normalize = (v) => typeof v === 'string' ? v : Array.isArray(v) ? (v[0] || '') : (v && typeof v === 'object' ? String(Object.values(v)[0] || '') : '')
const extractSingleItem = (payload, resource) => { if (!payload || payload.__raw) return null; const d = payload.prestashop || payload; if (Array.isArray(d)) return d[0] || null; for (const k of [resource?.endpoint, resource?.key, 'product', 'products']) { const x = d?.[k]; if (Array.isArray(x)) return x[0] || null; if (x && typeof x === 'object') return x } const a = Object.values(d || {}).find((x) => Array.isArray(x)); return a ? a[0] || null : (d && typeof d === 'object' && 'id' in d ? d : null) }
const imgUrl = (id) => id ? getProductImageUrl(productId, id) : '/images/placeholder-product.png'
const colorMap = { noir: '#111827', black: '#111827', blanc: '#fff', white: '#fff', gris: '#6b7280', gray: '#6b7280', rouge: '#ef4444', red: '#ef4444', bleu: '#3b82f6', blue: '#3b82f6', vert: '#10b981', green: '#10b981', jaune: '#f59e0b', yellow: '#f59e0b', orange: '#f97316', rose: '#ec4899', pink: '#ec4899', violet: '#8b5cf6', purple: '#8b5cf6', marron: '#92400e', brown: '#92400e', beige: '#d6b38a', marine: '#1d4ed8' }
const resolveColor = (n='') => colorMap[String(n).trim().toLowerCase()] || `hsl(${Math.abs([...String(n)].reduce((a,c)=>a+c.charCodeAt(0),0))%360} 72% 55%)`
const isColor = (l='') => /color|couleur|colour|teinte/i.test(l)
const isSize = (l='') => /taille|size|pointure|dimension/i.test(l)
const comboMap = (c) => Object.fromEntries(toArray(c.attributes).map(a => [String(a.groupId), String(a.id)]))

const extractCombinationOptionIds = (combination) => {
  const ids = new Set()
  const walk = (node, parentKey = '') => {
    if (!node) return
    if (Array.isArray(node)) { node.forEach(item => walk(item, parentKey)); return }
    if (typeof node !== 'object') return

    const directId = node.id ?? node.id_product_option_value ?? node.id_option_value ?? node.id_attribute_value
    if (directId !== undefined && directId !== null && String(directId).trim() !== '') {
      const numeric = parseInt(directId)
      if (!Number.isNaN(numeric)) ids.add(numeric)
    }

    for (const [key, value] of Object.entries(node)) {
      const lowerKey = key.toLowerCase()
      if (lowerKey.includes('product_option_value') || lowerKey.includes('option_value') || lowerKey.includes('attribute_value') || lowerKey.includes('attribute')) {
        walk(value, key)
      } else if (parentKey.includes('product_option_values') && (lowerKey === 'id' || lowerKey === '#text')) {
        const numeric = parseInt(value)
        if (!Number.isNaN(numeric)) ids.add(numeric)
      }
    }
  }

  walk(combination?.associations?.product_option_values || combination?.associations || combination)
  return [...ids]
}

const selectedCombination = computed(() => {
  if (!state.combinations.length) return null
  const selected = Object.entries(view.selectedVariants).filter(([, v]) => v)
  if (!selected.length) return state.combinations.find(c => c.quantity > 0) || state.combinations[0] || null
  return state.combinations.find(c => selected.every(([gid, oid]) => comboMap(c)[String(gid)] === String(oid))) || null
})
const selectionSummary = computed(() => selectedCombination.value ? selectedCombination.value.attributes.map(a => a.name).join(' · ') : '')
const currentPrice = computed(() => ((parseFloat(state.product?.price || 0)) + (parseFloat(selectedCombination.value?.price || 0))).toFixed(2))
const hasVariants = computed(() => groups.value.length > 0)
const availableQty = computed(() => hasVariants.value && !selectedCombination.value ? 0 : (selectedCombination.value ? parseInt(selectedCombination.value.quantity || 0) : parseInt(state.product?.quantity || 0)))
const isAvailable = computed(() => availableQty.value > 0)
const availLabel = computed(() => hasVariants.value && !selectedCombination.value ? 'Choisissez vos options' : (isAvailable.value ? `Disponible (${availableQty.value})` : 'Rupture de stock'))
const activeImageUrl = computed(() => state.images[view.activeImageIndex]?.url || state.images[0]?.url || '/images/placeholder-product.png')

const groups = computed(() => {
  const map = new Map()
  state.combinations.forEach(c => c.attributes.forEach(a => {
    const gid = String(a.groupId), oid = String(a.id)
    if (!map.has(gid)) map.set(gid, { id: gid, label: a.group, type: isColor(a.group) ? 'color' : isSize(a.group) ? 'size' : 'default', options: new Map() })
    const g = map.get(gid)
    if (!g.options.has(oid)) g.options.set(oid, { id: oid, label: a.name, swatchColor: resolveColor(a.name), available: false })
  }))
  return [...map.values()].map(g => ({ ...g, options: [...g.options.values()].map(o => ({ ...o, available: state.combinations.some(c => parseInt(c.quantity || 0) > 0 && comboMap(c)[g.id] === o.id && Object.entries(view.selectedVariants).every(([sg, so]) => !so || sg === g.id || comboMap(c)[String(sg)] === String(so))) })) }))
})

const selectVariant = async ({ groupId, optionId }) => { 
  view.selectedVariants[String(groupId)] = String(optionId)
  await nextTick()
  const combination = selectedCombination.value
  
  if (combination && combination.imageId) {
    const idx = state.images.findIndex(img => String(img.id) === String(combination.imageId))
    if (idx !== -1) {
      view.activeImageIndex = idx
    } else {
      const newImg = { id: combination.imageId, url: imgUrl(combination.imageId) }
      state.images.push(newImg)
      view.activeImageIndex = state.images.length - 1
    }
  } else {
    view.activeImageIndex = 0 
  }
}
const seed = () => { const c = state.combinations.find(x => x.quantity > 0) || state.combinations[0]; if (c) c.attributes.forEach(a => { if (!view.selectedVariants[String(a.groupId)]) view.selectedVariants[String(a.groupId)] = String(a.id) }) }

const add = () => {
  if (!state.product || !isAvailable.value) return;

  const key = selectedCombination.value ? `${state.product.id}:${selectedCombination.value.id}` : `${state.product.id}`;
  const maxQty = availableQty.value;

  try {
    addItem({
      id: state.product.id,
      combinationId: selectedCombination.value?.id || null,
      itemKey: key,
      name: state.product.name,
      variantLabel: selectionSummary.value,
      price: currentPrice.value,
      imageUrl: activeImageUrl.value,
      id_tax_rules_group: state.product.id_tax_rules_group
    }, view.quantity, maxQty);

    state.error = `${state.product.name} ajouté au panier !`;
    setTimeout(() => { if (state.error.includes('ajouté au panier')) state.error = '' }, 1500)
  } catch (error) {
    state.error = error.message;
  }
}

const load = async () => {
  state.loading = true; state.error = ''; console.info('[ProductDetail] load start', { route: route.fullPath, productId })
  try {
    const api = resourceApi('products'); const r = await api.get(productId, { display: 'full' }); console.info('[ProductDetail] product response', r)
    let p = extractSingleItem(r, api.resource)
    if (!p) { const lr = await api.list({ display: 'full', limit: 250 }); const items = extractItems(lr, api.resource); p = items.find(i => parseInt(i.id) === productId) || null; console.info('[ProductDetail] product list fallback', { count: items.length, found: Boolean(p) }) }
    if (!p) { state.error = `Produit non trouvé (id=${productId})`; return }
    const stockApi = resourceApi('stock_availables'); const stockR = await stockApi.list({ display: '[id_product,id_product_attribute,quantity]', limit: 500 }); const stocks = extractItems(stockR, stockApi.resource); const ps = stocks.filter(s => parseInt(s.id_product) === productId); const qty = ps.reduce((s, x) => s + parseInt(x.quantity || 0), 0); console.info('[ProductDetail] stock parsed', { totalEntries: stocks.length, productEntries: ps.length, productQuantity: qty })
    state.product = { id: productId, name: normalize(p.name), description: normalize(p.description), descriptionShort: normalize(p.description_short), price: parseFloat(p.price || 0).toFixed(2), quantity: qty, reference: p.reference, defaultImageId: p.id_default_image, id_tax_rules_group: p.id_tax_rules_group || 0 }
    console.info('[ProductDetail] product data resolved', state.product)
    try { const imgApi = resourceApi('images_products'); const imgR = await imgApi.get(productId); const imgList = extractItems(imgR, imgApi.resource); state.images = imgList.map(i => ({ id: i.id || i.id_image || i, url: imgUrl(i.id || i.id_image || i) })); console.info('[ProductDetail] images parsed', { totalEntries: imgList.length }) } catch (e) { console.warn('[ProductDetail] Could not load images', e) }
    try { const cApi = resourceApi('categories'); const cR = await cApi.list({ display: '[id,name]', limit: 500 }); const cats = extractItems(cR, cApi.resource); const ids = toArray(p.associations?.categories?.category).map(c => parseInt(c.id || c)).filter(Boolean); state.categories = cats.filter(c => ids.length === 0 || ids.includes(parseInt(c.id))).map(c => ({ id: c.id, name: normalize(c.name) })); console.info('[ProductDetail] categories parsed', { totalEntries: cats.length, selectedIds: ids, productCategories: state.categories.length }) } catch (e) { console.warn('[ProductDetail] Could not load categories', e) }
    const gApi = resourceApi('product_options'); const vApi = resourceApi('product_option_values'); const [gR, vR] = await Promise.all([gApi.list({ display: '[id,name]', limit: 500 }), vApi.list({ display: '[id,id_attribute_group,name]', limit: 1000 })]); const gItems = extractItems(gR, gApi.resource); const vItems = extractItems(vR, vApi.resource); const gMap = Object.fromEntries(gItems.map(g => [parseInt(g.id), normalize(g.name)])); const vMap = Object.fromEntries(vItems.map(v => [parseInt(v.id), { name: normalize(v.name), groupId: parseInt(v.id_attribute_group) }])); console.info('[ProductDetail] option maps loaded', { groups: gItems.length, values: vItems.length })
    const combApi = resourceApi('combinations'); const combR = await combApi.list({ display: 'full', limit: 1000 }); const combs = extractItems(combR, combApi.resource).filter(c => parseInt(c.id_product) === productId); const sR = await stockApi.list({ display: '[id_product,id_product_attribute,quantity]', limit: 1000 }); const sItems = extractItems(sR, stockApi.resource); const sMap = Object.fromEntries(sItems.filter(s => parseInt(s.id_product) === productId).map(s => [parseInt(s.id_product_attribute), parseInt(s.quantity || 0)]))
    state.combinations = combs.map(c => { 
      const ids = extractCombinationOptionIds(c); 
      const attrs = ids.map(id => { const v = vMap[id]; return { id, groupId: v?.groupId || 0, group: v ? gMap[v.groupId] : 'Option', name: v?.name || `#${id}` } }); 
      let imageId = null;
      const imagesData = c.associations?.images;
      if (imagesData) {
        const imgList = Array.isArray(imagesData) ? imagesData : (imagesData.image ? (Array.isArray(imagesData.image) ? imagesData.image : [imagesData.image]) : []);
        if (imgList.length && imgList[0].id) imageId = imgList[0].id;
      }
      console.info('[ProductDetail] combination parsed', { combinationId: c.id, optionIds: ids, attributes: attrs.length, imageId }); 
      return { id: c.id, reference: c.reference, price: parseFloat(c.price || 0), quantity: sMap[parseInt(c.id)] || 0, attributes: attrs, imageId } 
    }); 
    console.info('[ProductDetail] combinations loaded', { totalEntries: combs.length, productCombinations: state.combinations.length }); seed()
    if (!state.images.length && state.product.defaultImageId) state.images = [{ id: state.product.defaultImageId, url: imgUrl(state.product.defaultImageId) }]
    console.info('[ProductDetail] loaded', { productId, name: state.product.name })
  } catch (e) { state.error = e instanceof Error ? e.message : String(e); console.error('[ProductDetail] error', e) }
  finally { console.info('[ProductDetail] load finished', { productId, hasProduct: Boolean(state.product) }); state.loading = false }
}

onMounted(() => { console.info('[ProductDetail] mounted', { routeParams: route.params, productId }); if (!productId || isNaN(productId)) { state.error = 'ID produit invalide'; return } load() })
</script>

<template>
  <section class="product-page">
    <div class="product-header-nav">
      <nav class="breadcrumb"><RouterLink to="/front/products">Catalogue</RouterLink><span v-if="state.product" class="breadcrumb__sep">/</span><span v-if="state.product" class="breadcrumb__current">{{ state.product.name }}</span></nav>
      <div class="cart-actions-nav">
        <RouterLink to="/front/cart" class="button button--primary button--small">
          Voir le panier <span v-if="cartItemCount > 0">({{ cartItemCount }})</span>
        </RouterLink>
      </div>
    </div>
    <div v-if="state.loading" class="page-state card"><p>Chargement du produit...</p></div>
    <div v-else-if="state.error && !state.error.includes('ajouté au panier')" class="page-state card page-state--error"><p>{{ state.error }}</p><RouterLink to="/front/products" class="button button--ghost">Retour au catalogue</RouterLink></div>
    <div v-if="state.error && state.error.includes('ajouté au panier')" class="page-state card page-state--success"><p>✓ {{ state.error }}</p></div>
    <div v-else-if="state.product" class="product-layout">
      <ProductMediaGallery :images="state.images" :title="state.product.name" :active-index="view.activeImageIndex" @select="view.activeImageIndex = $event" />
      <div class="product-layout__content">
        <ProductMetaPanel :product="state.product" :categories="state.categories" :selection-summary="selectionSummary" />
        <ProductVariantSelector v-if="groups.length" :groups="groups" :selected-values="view.selectedVariants" @select="selectVariant" />
        <ProductPurchaseBox v-model="view.quantity" :price="currentPrice" :available="isAvailable" :availability-label="availLabel" :selection-summary="selectionSummary" @add="add" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.product-page{max-width:1280px;margin:0 auto;padding:1rem}.breadcrumb{display:flex;gap:.5rem;color:var(--muted);font-size:.92rem;align-items:center}.breadcrumb__sep{opacity:.6}.breadcrumb__current{color:var(--text);font-weight:700}.page-state{display:flex;align-items:center;justify-content:space-between;gap:1rem;min-height:140px}.page-state--error{background:#fff2f2;color:var(--danger)}.page-state--success{background:#eefaf1;color:#18794e}.product-layout{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:1.5rem;align-items:start}.product-layout__content{display:flex;flex-direction:column;gap:1rem}
.product-header-nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
@media (max-width:960px){.product-layout{grid-template-columns:1fr}.product-layout__content{order:2}}
</style>
