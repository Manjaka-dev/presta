/**
 * Utilitaires de conversion string pour l'import CSV
 */

export function normalizeHeader(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function toFloat(value, fallback = 0) {
  if (typeof value !== 'string') {
    const num = Number(value)
    return Number.isFinite(num) ? num : fallback
  }
  const normalized = value.replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function toBool(value, fallback = false) {
  if (!value) {
    return fallback
  }
  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'y', 'on', 'oui', 'vrai'].includes(normalized)
}

export function slugify(value) {
  const slug = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'item'
}

export function formatMoney(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '0.00'
  }
  return numeric.toFixed(2)
}
