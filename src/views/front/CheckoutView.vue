<script setup>
import { reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useCart } from '@/api/useCart'
import { createCart, createOrder, getCartStatus, getOrderStatus, validateCheckoutData, getCustomerAddresses } from '@/api/useCheckout'

const router = useRouter()
const { items: cartItems, totalPrice, removeItem, updateQuantity, clearCart } = useCart()

const STEPS = { CART: 'cart', CUSTOMER: 'customer', PAYMENT: 'payment', CONFIRM: 'confirm', SUCCESS: 'success' }

const state = reactive({
  currentStep: STEPS.CART,
  loading: false,
  error: '',
  customerId: localStorage.getItem('customerId') || '2',
  paymentModule: 'bank-transfer',
  addresses: [],
  selectedAddressId: null,
  orderCreated: null,
})

const handleQuantityChange = (identifier, newQty) => {
  newQty <= 0 ? removeItem(identifier) : updateQuantity(identifier, newQty)
}

const goToStep = async (step) => {
  if (step === STEPS.CUSTOMER && !state.addresses.length) {
    state.loading = true
    try {
      state.addresses = await getCustomerAddresses(parseInt(state.customerId))
      if (state.addresses.length) state.selectedAddressId = state.addresses[0].id
      else { state.selectedAddressId = 1; state.addresses = [{ id: 1, firstname: 'Test', lastname: 'User', address1: 'Adresse défaut' }] }
    } catch (e) { state.selectedAddressId = 1; state.addresses = [{ id: 1, firstname: 'Test', lastname: 'User', address1: 'Adresse défaut' }] }
    finally { state.loading = false }
  }
  state.currentStep = step
  state.error = ''
}

const nextStep = () => {
  const steps = [STEPS.CART, STEPS.CUSTOMER, STEPS.PAYMENT, STEPS.CONFIRM, STEPS.SUCCESS]
  const idx = steps.indexOf(state.currentStep)
  if (idx < steps.length - 1) goToStep(steps[idx + 1])
}

const prevStep = () => {
  const steps = [STEPS.CART, STEPS.CUSTOMER, STEPS.PAYMENT, STEPS.CONFIRM, STEPS.SUCCESS]
  const idx = steps.indexOf(state.currentStep)
  if (idx > 0) goToStep(steps[idx - 1])
}

const submitOrder = async () => {
  state.loading = true; state.error = ''
  try {
    // Créer le panier d'abord
    const cartId = await createCart({
      customerId: parseInt(state.customerId),
      addressId: parseInt(state.selectedAddressId),
      items: cartItems.value.map(item => ({ id: item.id, combinationId: item.combinationId, name: item.name, price: item.price, quantity: item.quantity })),
    })

    state.orderCreated = await createOrder({
      customerId: parseInt(state.customerId),
      addressId: parseInt(state.selectedAddressId),
      paymentModule: state.paymentModule,
      cartId: cartId,
      items: cartItems.value.map(item => ({ id: item.id, combinationId: item.combinationId, name: item.name, price: item.price, quantity: item.quantity })),
    })
    state.currentStep = STEPS.SUCCESS; clearCart()
    setTimeout(() => router.push({ name: 'front-orders' }), 3000)
  } catch (error) { state.error = error instanceof Error ? error.message : String(error) }
  finally { state.loading = false }
}
</script>

<template>
  <section class="checkout">
    <div class="checkout-container">
      <header class="checkout-header">
        <h1>Commande</h1>
        <div class="checkout-steps">
          <div :class="{step: true, active: state.currentStep === STEPS.CART}"><span>1 Panier</span></div>
          <div :class="{step: true, active: state.currentStep === STEPS.CUSTOMER}"><span>2 Client</span></div>
          <div :class="{step: true, active: state.currentStep === STEPS.PAYMENT}"><span>3 Paiement</span></div>
          <div :class="{step: true, active: state.currentStep === STEPS.CONFIRM}"><span>4 Confirm</span></div>
        </div>
      </header>

      <div v-if="state.error" class="error-block"><p>{{ state.error }}</p></div>
      <div v-if="state.loading" class="loading-state"><p>Traitement...</p></div>

      <div v-else-if="state.currentStep === STEPS.CART" class="checkout-section">
        <h2>Panier</h2>
        <div v-if="cartItems.length === 0" class="empty"><p>Vide</p></div>
        <div v-else>
          <div class="items-list">
            <div v-for="item in cartItems" :key="item.id" class="item-row">
              <div class="item-info"><h4>{{ item.name }}</h4></div>
              <input v-model.number="item.quantity" type="number" min="1" @change="e => handleQuantityChange(item.id, parseInt(e.target.value))" class="qty-input" />
              <div class="price">{{ (item.price * item.quantity).toFixed(2) }}€</div>
            </div>
          </div>
          <div class="summary"><div><span>Total :</span><strong>{{ totalPrice }}€</strong></div></div>
          <div class="actions">
            <button class="button button--ghost" @click="router.push({name: 'front-cart'})">← Retour</button>
            <button class="button button--primary" @click="nextStep">Continuer →</button>
          </div>
        </div>
      </div>

      <div v-else-if="state.currentStep === STEPS.CUSTOMER" class="checkout-section">
        <h2>Livraison</h2>
        <div class="form">
          <div class="form-group">
            <label>ID Client :</label>
            <input v-model="state.customerId" type="number" />
          </div>
          <div class="form-group">
            <label>Adresse :</label>
            <select v-model="state.selectedAddressId">
              <option v-for="addr in state.addresses" :key="addr.id" :value="addr.id">{{ addr.firstname }} - {{ addr.address1 }}</option>
            </select>
          </div>
          <div class="actions">
            <button class="button button--ghost" @click="prevStep">← Retour</button>
            <button class="button button--primary" @click="nextStep">Continuer →</button>
          </div>
        </div>
      </div>

      <div v-else-if="state.currentStep === STEPS.PAYMENT" class="checkout-section">
        <h2>Paiement</h2>
        <div class="payment"><p><strong>Paiement à la livraison</strong></p></div>
        <div class="actions">
          <button class="button button--ghost" @click="prevStep">← Retour</button>
          <button class="button button--primary" @click="nextStep">Continuer →</button>
        </div>
      </div>

      <div v-else-if="state.currentStep === STEPS.CONFIRM" class="checkout-section">
        <h2>Confirmation</h2>
        <div class="confirm-box">
          <div class="items-list readonly">
            <div v-for="item in cartItems" :key="item.id" class="item-row">
              <div><h4>{{ item.name }}</h4><p class="muted">×{{ item.quantity }}</p></div>
              <div class="price">{{ (item.price * item.quantity).toFixed(2) }}€</div>
            </div>
          </div>
          <div class="summary"><div><span>Total TTC :</span><strong>{{ totalPrice }}€</strong></div></div>
        </div>
        <div class="actions">
          <button class="button button--ghost" @click="prevStep">← Modifier</button>
          <button class="button button--primary" @click="submitOrder">Créer</button>
        </div>
      </div>

      <div v-else-if="state.currentStep === STEPS.SUCCESS" class="checkout-section success">
        <h2>✓ Commande créée !</h2>
        <p v-if="state.orderCreated">Commande {{ state.orderCreated.orderId }}</p>
        <p class="muted">Redirection...</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.checkout { padding: 2rem 1rem; max-width: 900px; margin: 0 auto; }
.checkout-container { background: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 2rem; }
.checkout-header { margin-bottom: 2rem; text-align: center; border-bottom: 1px solid #f0f0f0; padding-bottom: 1rem; }
.checkout-header h1 { margin: 0 0 0.5rem; }
.checkout-steps { display: flex; justify-content: center; gap: 0.5rem; flex-wrap: wrap; }
.step { padding: 0.5rem 1rem; border-radius: 4px; background: #f0f0f0; font-size: 0.85rem; opacity: 0.6; }
.step.active { background: var(--primary, #0066cc); color: white; opacity: 1; font-weight: 600; }
.error-block { background: #fee; border: 1px solid #fcc; padding: 1rem; margin: 1rem 0; border-radius: 4px; color: #c33; }
.error-block p { margin: 0; }
.loading-state { text-align: center; padding: 2rem; background: #f9f9f9; border-radius: 4px; color: #666; }
.checkout-section { margin: 1.5rem 0; }
.checkout-section h2 { margin: 0 0 1rem; font-size: 1.2rem; }
.empty { text-align: center; padding: 2rem; background: #f9f9f9; color: #666; border-radius: 4px; }
.items-list { margin: 1rem 0; }
.item-row { display: grid; grid-template-columns: 1fr auto auto; gap: 1rem; align-items: center; padding: 1rem; border: 1px solid #e0e0e0; border-radius: 4px; margin-bottom: 0.5rem; background: white; }
.items-list.readonly .item-row { background: #fafafa; }
.item-info h4 { margin: 0; }
.item-info .muted { font-size: 0.85rem; color: #999; }
.qty-input { width: 60px; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; text-align: center; }
.price { font-weight: 600; text-align: right; min-width: 70px; }
.summary { background: #f9f9f9; border: 1px solid #e0e0e0; padding: 1rem; border-radius: 4px; margin: 1rem 0; }
.summary div { display: flex; justify-content: space-between; }
.form { margin: 1rem 0; }
.form-group { margin-bottom: 1rem; }
.form-group label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
.form-group input, .form-group select { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-family: inherit; }
.payment { background: #f9f9f9; padding: 1.5rem; border-radius: 4px; border: 1px solid #e0e0e0; }
.confirm-box { background: #f9f9f9; border: 2px solid #e0e0e0; padding: 1.5rem; border-radius: 4px; }
.actions { display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem; }
.actions .button { padding: 0.75rem 1.5rem; }
.success { text-align: center; background: #d4edda; border: 1px solid #28a745; padding: 2rem; border-radius: 4px; }
.success h2 { color: #155724; }
.success p { color: #155724; }
.muted { color: #999; font-size: 0.85rem; }
</style>

