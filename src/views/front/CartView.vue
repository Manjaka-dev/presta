<script setup>
import { reactive, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCart } from '@/api/useCart'
import { createOrder, createCart, updateCart, validateCheckoutData } from '@/api/useCheckout'
import { useCustomer, setCustomerId } from '@/api/customerIdentity'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'

const router = useRouter()
const { items, totalPrice, cartId, syncing, removeItem, updateQuantity, clearCart } = useCart()
const { customer, loadCustomer } = useCustomer()

const state = reactive({
  loading: false,
  error: '',
  success: false,
  orderId: null,
  step: 'cart', // 'cart', 'login', 'summary', 'confirmation'
  paymentMethod: 'cod', // 'cod' for Cash on Delivery
})

const loginState = reactive({
  customers: [],
  selectedCustomerId: '',
  password: '',
  loadingCustomers: false,
  error: '',
})

const loadLoginCustomers = async () => {
  loginState.loadingCustomers = true
  loginState.error = ''
  try {
    const api = resourceApi('customers')
    const res = await api.list({
      display: '[id,firstname,lastname,email,id_default_group,active]',
      limit: 100,
    })
    const all = extractItems(res, api.resource)
    loginState.customers = all.filter(c => {
      const active = c.active === '1' || c.active === 1
      const groupId = parseInt(c.id_default_group)
      return active && groupId >= 3
    })
    if (loginState.customers.length > 0) {
      loginState.selectedCustomerId = loginState.customers[0].id
    }
  } catch (e) {
    loginState.error = 'Erreur lors du chargement des clients'
    console.error('[CartView] loadLoginCustomers error:', e)
  } finally {
    loginState.loadingCustomers = false
  }
}

const handleCheckoutLogin = async () => {
  if (!loginState.selectedCustomerId) {
    loginState.error = 'Veuillez sélectionner un client'
    return
  }

  state.loading = true
  loginState.error = ''
  try {
    // 1. Enregistrer la session de l'utilisateur connecté
    sessionStorage.removeItem('isAnonymous')
    setCustomerId(loginState.selectedCustomerId)

    // 2. Charger le profil du client (et son adresse)
    await loadCustomer()

    // 3. Associer le panier temporaire anonyme (si existant) à cet utilisateur dans PrestaShop
    if (cartId.value && customer.value) {
      try {
        const freshAddressId = customer.value.addressId || 1
        await updateCart(cartId.value, {
          customerId: customer.value.id,
          addressId: freshAddressId,
          items: items.value,
        })
      } catch (cartErr) {
        console.warn('[CartView] Échec association panier, poursuite création fresh cart au paiement:', cartErr.message)
      }
    }

    // 4. Passer au résumé de commande
    state.step = 'summary'
  } catch (err) {
    loginState.error = 'Erreur de connexion : ' + err.message
  } finally {
    state.loading = false
  }
}

const handleQuantityChange = (identifier, newQty) => {
  if (newQty <= 0) {
    removeItem(identifier)
  } else {
    updateQuantity(identifier, newQty)
  }
}

const proceedToCheckout = () => {
  if (items.value.length === 0) {
    state.error = 'Votre panier est vide'
    return
  }
  const isAnonymous = sessionStorage.getItem('isAnonymous') === 'true'
  if (isAnonymous) {
    state.step = 'login'
    loadLoginCustomers()
  } else {
    state.step = 'summary'
  }
}

const placeOrder = async () => {
  state.loading = true
  state.error = ''
  state.success = false

  try {
    // Ensure customer is loaded
    if (!customer.value) {
      await loadCustomer()
    }
    if (!customer.value) {
      throw new Error('Client non identifié. Veuillez vous connecter.')
    }

    const checkoutData = {
      customerId: customer.value.id,
      addressId: customer.value.addressId || 1,
      items: items.value,
      paymentModule: 'ps_cashondelivery',
    }

    const { isValid, errors } = await validateCheckoutData(checkoutData)
    if (!isValid) {
      throw new Error(errors.join(', '))
    }

    // Créer un nouveau panier "frais" au moment de la commande
    // (les paniers pré-créés peuvent être rejetés par PrestaShop à cause de la session PHP)
    const freshCartId = await createCart({
      customerId: checkoutData.customerId,
      addressId: checkoutData.addressId,
      items: checkoutData.items,
    })

    checkoutData.cartId = freshCartId
    checkoutData.statusId = 2 // Paiement effectué

    const result = await createOrder(checkoutData)
    if (result.success) {
      state.success = true
      state.orderId = result.orderId
      state.step = 'confirmation'
      clearCart()
    } else {
      throw new Error(result.message || 'Une erreur est survenue lors de la création de la commande.')
    }
  } catch (error) {
    state.error = error.message
  } finally {
    state.loading = false
  }
}

const backToCart = () => {
  state.step = 'cart'
}
</script>

<template>
  <section class="cart-view">
    <!-- Step: Cart -->
    <div v-if="state.step === 'cart'">
      <header class="cart-header">
        <h2>Votre Panier</h2>
        <button v-if="items.length > 0" class="button button--ghost button--small" @click="clearCart">
          Vider le panier
        </button>
      </header>

      <div v-if="items.length === 0" class="empty-cart">
        <p class="muted">Votre panier est vide.</p>
        <RouterLink to="/front/products" class="button button--ghost">
          Continuer vos achats
        </RouterLink>
      </div>

      <div v-else>
        <div class="cart-items">
          <div v-for="item in items" :key="item.itemKey || item.id" class="cart-item">
            <div class="cart-item__image">
              <img :src="item.imageUrl" :alt="item.name" />
            </div>
            <div class="cart-item__info">
              <h4 class="cart-item__name">{{ item.name }}</h4>
              <p v-if="item.variantLabel" class="cart-item__variant muted">{{ item.variantLabel }}</p>
              <p class="cart-item__price">{{ parseFloat(item.price).toFixed(2) }}€</p>
            </div>
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
            <div class="cart-item__total">
              {{ (item.price * item.quantity).toFixed(2) }}€
            </div>
            <button
              class="button button--ghost button--small"
              @click="removeItem(item.itemKey || item.id)"
              title="Supprimer du panier"
            >
              ✕
            </button>
          </div>
        </div>
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
    </div>

    <!-- Step: Login (Checkout integration for Anonymous users) -->
    <div v-if="state.step === 'login'">
      <header class="cart-header">
        <h2>Identification client</h2>
      </header>
      <div class="login-checkout-card">
        <p class="login-checkout-subtitle">Sélectionnez votre compte client pour finaliser et valider votre commande.</p>
        
        <div v-if="loginState.loadingCustomers" class="loading-spinner">
          Chargement de la liste des clients...
        </div>
        
        <form v-else @submit.prevent="handleCheckoutLogin" class="login-checkout-form">
          <div class="form-group">
            <label for="checkout-user-select">Compte Client :</label>
            <select id="checkout-user-select" v-model="loginState.selectedCustomerId" class="form-select">
              <option v-for="c in loginState.customers" :key="c.id" :value="c.id">
                {{ c.firstname }} {{ c.lastname }} ({{ c.email }})
              </option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="checkout-password">Mot de passe :</label>
            <input 
              id="checkout-password"
              v-model="loginState.password" 
              type="password" 
              placeholder="Entrez un mot de passe"
              class="form-input" 
            />
          </div>
          
          <div v-if="loginState.error" class="error-block">
            <p>{{ loginState.error }}</p>
          </div>
          
          <div class="cart-actions">
            <button type="button" class="button button--ghost" @click="backToCart">Retour au panier</button>
            <button type="submit" class="button button--primary" :disabled="state.loading">
              {{ state.loading ? 'Connexion...' : 'Se connecter et continuer' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Step: Summary -->
    <div v-if="state.step === 'summary'">
      <header class="cart-header">
        <h2>Récapitulatif de la commande</h2>
      </header>
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
        <div class="payment-selection">
          <h4>Méthode de paiement</h4>
          <label>
            <input type="radio" v-model="state.paymentMethod" value="cod" checked>
            Paiement à la livraison
          </label>
        </div>
        <div v-if="state.error" class="error-block">
          <p>{{ state.error }}</p>
        </div>
        <div class="cart-actions">
          <button class="button button--ghost" @click="backToCart">Retour au panier</button>
          <button class="button button--primary" @click="placeOrder" :disabled="state.loading">
            {{ state.loading ? 'Validation...' : 'Valider la commande' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Step: Confirmation -->
    <div v-if="state.step === 'confirmation'">
      <header class="cart-header">
        <h2>Commande validée !</h2>
      </header>
      <div class="success-block">
        <p>Votre commande n°{{ state.orderId }} a été enregistrée avec succès.</p>
        <RouterLink to="/front/orders" class="button button--primary">
          Voir mes commandes
        </RouterLink>
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

.payment-selection {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e0e0e0;
}

.error-block, .success-block {
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 6px;
}

.error-block {
  background: #fee;
  border: 1px solid #fcc;
  color: var(--danger);
}

.success-block {
  background: #e9f7ef;
  border: 1px solid #b8e9c5;
  color: #18794e;
  text-align: center;
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

.login-checkout-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  max-width: 500px;
  margin: 2rem auto;
}

.login-checkout-subtitle {
  color: #666;
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
  text-align: center;
  line-height: 1.4;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #333;
}

.form-select, .form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 1rem;
  font-family: inherit;
  background-color: #fafafa;
  transition: all 0.2s ease;
}

.form-select:focus, .form-input:focus {
  outline: none;
  border-color: var(--primary, #0066cc);
  background-color: white;
  box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.15);
}

.loading-spinner {
  text-align: center;
  padding: 2rem;
  color: #666;
}
</style>
