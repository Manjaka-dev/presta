const extractItems = (payload, resource) => {
  if (!payload) {
    return []
  }

  if (payload.__raw) {
    return []
  }

  let data = payload
  if (data.prestashop) {
    data = data.prestashop
  }

  if (Array.isArray(data)) {
    return data
  }

  const preferredKeys = [resource?.endpoint, resource?.key]
  for (const key of preferredKeys) {
    if (key && data[key]) {
      return Array.isArray(data[key]) ? data[key] : [data[key]]
    }
  }

  const firstArray = Object.values(data).find((value) => Array.isArray(value))
  if (firstArray) {
    return firstArray
  }
  
  // Si c'est un objet racine unique (rare mais possible)
  if (typeof data === 'object' && Object.keys(data).length > 0) {
    const firstObj = Object.values(data)[0]
    if (typeof firstObj === 'object') {
       return [firstObj]
    }
    return [data]
  }

  return []
}

export { extractItems }

