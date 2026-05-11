<script setup>
import { computed } from 'vue'

const props = defineProps({
  images: {
    type: Array,
    default: () => [],
  },
  title: {
    type: String,
    default: '',
  },
  activeIndex: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['select'])

const placeholder = '/images/placeholder-product.png'

const activeImage = computed(() => props.images[props.activeIndex] || props.images[0] || null)
</script>

<template>
  <section class="product-gallery card">
    <div class="product-gallery__main">
      <img
        :src="activeImage?.url || placeholder"
        :alt="title"
        class="product-gallery__image"
      />
    </div>

    <div v-if="images.length > 1" class="product-gallery__thumbs">
      <button
        v-for="(image, index) in images"
        :key="image.id || index"
        type="button"
        class="product-gallery__thumb"
        :class="{ 'product-gallery__thumb--active': index === activeIndex }"
        @click="emit('select', index)"
      >
        <img :src="image.url || placeholder" :alt="`${title} - visuel ${index + 1}`" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.product-gallery {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.product-gallery__main {
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 12px;
  background: linear-gradient(180deg, #f7f8fd 0%, #eef1fb 100%);
}

.product-gallery__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.product-gallery__thumbs {
  display: flex;
  gap: 0.5rem;
  overflow-x: auto;
  padding-bottom: 0.15rem;
}

.product-gallery__thumb {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 0;
  width: 72px;
  height: 72px;
  overflow: hidden;
  cursor: pointer;
  flex: 0 0 auto;
}

.product-gallery__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.product-gallery__thumb--active {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(55, 93, 251, 0.12);
}
</style>

