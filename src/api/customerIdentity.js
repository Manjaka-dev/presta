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

