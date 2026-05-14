import { ref } from 'vue'

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
    // In a real app, this would likely fetch customer details from the API
    const id = getCustomerId()
    
    if (id) {
       customer.value = {
          id: id,
          addressId: 1 // Default mock address ID
       }
    } else {
       customer.value = null
    }
  }

  return {
    customer,
    loadCustomer
  }
}
