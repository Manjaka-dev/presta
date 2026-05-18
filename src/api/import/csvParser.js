/**
 * Parseur CSV adapté aux fichiers d'import PrestaShop
 * Gère les virgules décimales entre guillemets, auto-détection du séparateur
 */
import { normalizeHeader } from '@/utils/stringUtils'

export const EXPECTED_HEADERS = {
  products: ['date_availability_produit', 'nom', 'reference', 'prix_ttc', 'taxe', 'categorie', 'prix_achat'],
  stocks: ['reference', 'specificite', 'karazany', 'stock_initial', 'prix_vente_ttc'],
  orders: ['date', 'nom', 'email', 'pwd', 'adresse', 'achat', 'etat']
}

export function validateHeaders(target, normalizedHeaders) {
  const expected = EXPECTED_HEADERS[target]
  if (!expected) return // Target inconnu, on ignore la validation
  
  const missing = []
  for (const req of expected) {
    if (!normalizedHeaders.includes(req)) {
      missing.push(req)
    }
  }
  
  if (missing.length > 0) {
    throw new Error(`Colonnes manquantes ou mal orthographiées pour "${target}": ${missing.join(', ')}`)
  }
}

export async function parseCsvFile(file) {
  const text = await file.text()
  return parseCsvText(text)
}

export function parseCsvText(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const filtered = lines.filter((line) => line.trim() !== '')
  if (!filtered.length) {
    throw new Error('CSV est vide')
  }

  const delimiter = detectDelimiter(filtered[0])
  const headerLine = filtered[0].replace(/^\uFEFF/, '')
  const rawHeaders = parseLine(headerLine, delimiter)
  const normalizedHeaders = buildNormalizedHeaders(rawHeaders)
  const rows = []

  for (let i = 1; i < filtered.length; i += 1) {
    const values = parseLine(filtered[i], delimiter)
    if (!values.length) {
      continue
    }
    const row = {}
    normalizedHeaders.forEach((header, index) => {
      row[header] = values[index]?.trim() ?? ''
    })
    rows.push(row)
  }

  return {
    delimiter,
    headers: rawHeaders,
    normalizedHeaders,
    rows
  }
}

function buildNormalizedHeaders(rawHeaders) {
  const seen = new Map()
  return rawHeaders.map((header, index) => {
    const base = normalizeHeader(header) || `col_${index + 1}`
    const count = seen.get(base) ?? 0
    const next = count ? `${base}_${count + 1}` : base
    seen.set(base, count + 1)
    return next
  })
}

function detectDelimiter(line) {
  const candidates = [',', ';', '\t']
  let best = ','
  let bestScore = -1

  for (const candidate of candidates) {
    const score = line.split(candidate).length - 1
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best
}

function parseLine(line, delimiter) {
  const values = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
        continue
      }
      inQuotes = !inQuotes
      continue
    }

    if (char === delimiter && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }

    current += char
  }

  values.push(current)
  return values.map((value) => value.trim())
}
