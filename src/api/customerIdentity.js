import { ref } from 'vue'
import { resourceApi } from '@/api/resources'
import { extractItems } from '@/utils/resourceData.js'

const STORAGE_KEY = 'customerId'

export const getCustomerId = () => {
  const value = sessionStorage.getItem(STORAGE_KEY)
  const numeric = parseInt(value || '')
  return Number.isNaN(numeric) ? null : numeric
}

export const setCustomerId = (customerId) => {
  if (!customerId && customerId !== 0) {
    sessionStorage.removeItem(STORAGE_KEY)
    return null
  }

  const numeric = parseInt(customerId)
  if (Number.isNaN(numeric)) return null
  sessionStorage.setItem(STORAGE_KEY, String(numeric))
  return numeric
}

export const clearCustomerId = () => sessionStorage.removeItem(STORAGE_KEY)

// Composables for Vue 3 reactivity
export const useCustomer = () => {
  const customer = ref(null)

  const loadCustomer = async () => {
    const id = getCustomerId()
    if (!id) {
      customer.value = null
      return
    }

    try {
      // Récupérer la vraie première adresse du client via l'API
      const addrApi = resourceApi('addresses')
      const addrRes = await addrApi.list({ 'filter[id_customer]': String(id), display: '[id]' })
      const addresses = extractItems(addrRes, addrApi.resource)
      const addressId = addresses && addresses.length > 0 ? parseInt(addresses[0].id) : 1

      customer.value = {
        id,
        addressId,
      }
    } catch (e) {
      console.warn('[useCustomer] Could not fetch address, using default:', e.message)
      customer.value = { id, addressId: 1 }
    }
  }

  return {
    customer,
    loadCustomer,
  }
}
