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
    if (key && Array.isArray(data[key])) {
      return data[key]
    }
  }

  const firstArray = Object.values(data).find((value) => Array.isArray(value))
  if (firstArray) {
    return firstArray
  }

  return []
}

export { extractItems }

