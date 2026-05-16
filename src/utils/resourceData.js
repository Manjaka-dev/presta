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

/**
* Extrait un seul objet ressource d'une réponse API PrestaShop.
* Gère les différentes structures de réponse que l'API peut renvoyer.
* @param {object} response - La réponse brute de l'API.
* @param {object} resource - L'objet ressource (de resourceApi) pour les métadonnées.
* @returns {object|null} L'objet de la ressource extraite ou null.
*/
const extractSingleItem = (response, resource) => {
  if (!response) return null;
  // PrestaShop API peut renvoyer un objet vide avec __raw: true sur un GET pour une ressource inexistante
  if (response.__raw) return null;

  const data = response.prestashop || response;
  if (!data) return null;

  // L'objet principal est souvent une clé avec le nom de la ressource (ex: { cart: { ... } })
  const resourceKey = resource.key; // ex: 'cart'
  if (data[resourceKey] && typeof data[resourceKey] === 'object') {
    // Peut être un tableau même pour un GET de ressource unique si le schéma est générique
    return Array.isArray(data[resourceKey]) ? data[resourceKey][0] : data[resourceKey];
  }

  // Fallback pour la clé au pluriel (ex: endpoint 'carts' -> key 'cart')
  const pluralKey = resource.endpoint;
  if (data[pluralKey] && typeof data[pluralKey] === 'object') {
    return Array.isArray(data[pluralKey]) ? data[pluralKey][0] : data[pluralKey];
  }

  // Si l'objet de données a un id, c'est probablement la ressource elle-même
  if (data.id) return data;

  // Dernier recours : trouver la première valeur de type objet dans les données de réponse
  const firstObjectKey = Object.keys(data).find(k => typeof data[k] === 'object');
  if (firstObjectKey) return data[firstObjectKey];

  return null;
};

export { extractItems, extractSingleItem }