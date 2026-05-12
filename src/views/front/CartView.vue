<script setup>
import { useRouter } from 'vue-router'
import { useCart } from '@/api/useCart'

const router = useRouter()
const { items, totalPrice, removeItem, updateQuantity, clearCart } = useCart()

const handleQuantityChange = (identifier, newQty) => {
  if (newQty <= 0) {
    removeItem(identifier)
  } else {
    updateQuantity(identifier, newQty)
  }
}

const proceedToCheckout = () => {
  if (items.value.length === 0) {
    alert('Votre panier est vide')
    return
  }
  router.push({ name: 'front-checkout' })
}
</script>

<template>
  <section class="cart-view">
    <header class="cart-header">
      <h2>Votre Panier</h2>
      <button v-if="items.length > 0" class="button button--ghost button--small" @click="clearCart">
        Vider le panier
      </button>
    </header>

    <!-- Empty State -->
    <div v-if="items.length === 0" class="empty-cart">
      <p class="muted">Votre panier est vide.</p>
      <RouterLink to="/front/products" class="button button--ghost">
        Continuer vos achats
      </RouterLink>
    </div>

    <!-- Cart Items -->
    <div v-else>
      <div class="cart-items">
        <div v-for="item in items" :key="item.itemKey || item.id" class="cart-item">
          <!-- Product Image -->
          <div class="cart-item__image">
            <img :src="item.imageUrl" :alt="item.name" />
          </div>

          <!-- Product Info -->
          <div class="cart-item__info">
            <h4 class="cart-item__name">{{ item.name }}</h4>
            <p v-if="item.variantLabel" class="cart-item__variant muted">{{ item.variantLabel }}</p>
            <p class="cart-item__price">{{ parseFloat(item.price).toFixed(2) }}€</p>
          </div>

          <!-- Quantity Control -->
          <div class="cart-item__quantity">
            <label :for="`qty-${item.itemKey || item.id}`" class="sr-only">Quantité</label>
            <input
              :id="`qty-${item.itemKey || item.id}`"
              :value="item.quantity"
              type="number"
              min="1"
              @change="(e) => handleQuantityChange(item.itemKey || item.id, parseInt(e.target.value))"
              class="quantity-input"
            />
          </div>

          <!-- Item Total -->
          <div class="cart-item__total">
            {{ (item.price * item.quantity).toFixed(2) }}€
          </div>

          <!-- Remove Button -->
          <button
            class="button button--ghost button--small"
            @click="removeItem(item.itemKey || item.id)"
            title="Supprimer du panier"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Cart Summary -->
      <div class="cart-summary">
        <div class="summary-row">
          <span>Sous-total :</span>
          <strong>{{ totalPrice }}€</strong>
        </div>
        <div class="summary-row">
          <span>Frais de livraison :</span>
          <strong>Gratuit</strong>
        </div>
        <div class="summary-row summary-row--total">
          <span>Total :</span>
          <strong>{{ totalPrice }}€</strong>
        </div>

        <!-- Actions -->
        <div class="cart-actions">
          <RouterLink to="/front/products" class="button button--ghost">
            Continuer vos achats
          </RouterLink>
          <button class="button button--primary" @click="proceedToCheckout">
            Procéder au paiement
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cart-view {
  padding: 2rem 1rem;
  max-width: 800px;
  margin: 0 auto;
}

.cart-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.cart-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.empty-cart {
  text-align: center;
  padding: 3rem 1rem;
  background: #f9f9f9;
  border-radius: 8px;
  color: #666;
}

.empty-cart p {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}

.cart-items {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
}

.cart-item {
  display: grid;
  grid-template-columns: 80px 1fr auto auto auto;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background: white;
}

.cart-item__image {
  width: 80px;
  height: 80px;
  background: #f5f5f5;
  border-radius: 4px;
  overflow: hidden;
}

.cart-item__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cart-item__info {
  min-width: 0;
}

.cart-item__name {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cart-item__price {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
}

.cart-item__variant {
  margin: 0.15rem 0 0.25rem;
  font-size: 0.82rem;
}

.cart-item__quantity {
  display: flex;
}

.quantity-input {
  width: 60px;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
  font-size: 0.9rem;
  font-family: inherit;
}

.quantity-input:focus {
  outline: none;
  border-color: var(--primary, #0066cc);
}

.cart-item__total {
  min-width: 80px;
  text-align: right;
  font-weight: 600;
  font-size: 0.95rem;
}

.cart-item .button {
  padding: 0.35rem 0.5rem;
  min-width: 40px;
}

.cart-summary {
  background: #f9f9f9;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.95rem;
}

.summary-row--total {
  border-top: 2px solid #e0e0e0;
  padding-top: 0.75rem;
  margin-top: 0.75rem;
  font-size: 1.1rem;
  font-weight: 600;
}

.cart-actions {
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;
}

.cart-actions .button {
  flex: 1;
  padding: 0.75rem;
  text-align: center;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .cart-item {
    grid-template-columns: 60px 1fr;
    gap: 0.75rem;
  }

  .cart-item__image {
    width: 60px;
    height: 60px;
    grid-column: 1;
    grid-row: 1;
  }

  .cart-item__info {
    grid-column: 2;
    grid-row: 1 / 3;
  }

  .cart-item__quantity {
    grid-column: 1;
    grid-row: 2;
  }

  .cart-item__total {
    grid-column: 2;
    grid-row: 2;
  }

  .cart-item .button {
    grid-column: 2;
    grid-row: 3;
    justify-self: end;
  }

  .cart-actions {
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .cart-view {
    padding: 1rem;
  }

  .cart-header h2 {
    font-size: 1.25rem;
  }

  .cart-item {
    grid-template-columns: 50px 1fr;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .cart-item__image {
    width: 50px;
    height: 50px;
  }

  .cart-summary {
    padding: 1rem;
  }
}
</style>

