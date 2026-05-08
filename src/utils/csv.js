const splitLine = (line, separator) => {
  const result = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === separator && !inQuotes) {
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result
}

const normalizeNumber = (value, decimalSeparator) => {
  if (!decimalSeparator || decimalSeparator === '.') {
    return value
  }

  const trimmed = value.trim()
  const pattern = new RegExp(`^-?\\d+(\\${decimalSeparator}\\d+)?$`)

  if (!pattern.test(trimmed)) {
    return value
  }

  return trimmed.replace(decimalSeparator, '.')
}

const parseValue = (raw, options) => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return ''
  }

  const normalized = normalizeNumber(trimmed, options.decimalSeparator)

  if (options.multiValueSeparator && normalized.includes(options.multiValueSeparator)) {
    return normalized
      .split(options.multiValueSeparator)
      .map((value) => normalizeNumber(value.trim(), options.decimalSeparator))
      .filter((value) => value !== '')
  }

  return normalized
}

const normalizeHeader = (value) => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const HEADER_ALIASES = {
  pwd: 'passwd',
  pswd: 'passwd',
  password: 'passwd',
  passwd: 'passwd',
  fname: 'firstname',
  first: 'firstname',
  firstname: 'firstname',
  lname: 'lastname',
  last: 'lastname',
  lastname: 'lastname',
  mail: 'email',
  email: 'email',
  e_mail: 'email',
  addr1: 'address1',
  address1: 'address1',
  addr2: 'address2',
  address2: 'address2',
  zip: 'postcode',
  zipcode: 'postcode',
  postalcode: 'postcode',
  postcode: 'postcode',
  city: 'city',
  phone: 'phone',
  tel: 'phone',
  mobile: 'phone_mobile',
  phone_mobile: 'phone_mobile',
  customerid: 'id',
  active01: 'active',
  titlesidmr1ms2else0: 'id_gender',
  birthdayyyyymmdd: 'birthday',
  newsletter01: 'newsletter',
  optin01: 'optin',
  registrationdateyyyymmdd: 'date_add',
  defaultgroupid: 'id_default_group',
}

const isValidXmlTag = (key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)

const DEFAULT_CREATE_FORBIDDEN_FIELDS = new Set(['id', 'date_add', 'date_upd'])

const matchHeader = (header, expectedHeaders = [], used = new Set()) => {
  const normalized = normalizeHeader(header)

  const alias = HEADER_ALIASES[normalized]
  if (alias && !used.has(alias)) {
    used.add(alias)
    return alias
  }

  let best = null
  let bestScore = 0

  expectedHeaders.forEach((expected) => {
    if (used.has(expected)) {
      return
    }
    const normalizedExpected = normalizeHeader(expected)
    if (!normalizedExpected) {
      return
    }
    if (normalizedExpected === normalized) {
      best = expected
      bestScore = normalizedExpected.length + 100
      return
    }
    if (normalized.includes(normalizedExpected) || normalizedExpected.includes(normalized)) {
      const score = Math.min(normalized.length, normalizedExpected.length)
      if (score > bestScore) {
        best = expected
        bestScore = score
      }
    }
  })

  if (best) {
    used.add(best)
    return best
  }

  return header.trim()
}

const buildHeaders = (firstRow, hasHeader, expectedHeaders = []) => {
  if (hasHeader) {
    const used = new Set()
    return firstRow.map((value) => matchHeader(value.trim(), expectedHeaders, used))
  }

  return firstRow.map((_, index) => `column_${index + 1}`)
}

const parseCsv = (text, options) => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (!lines.length) {
    return { headers: [], rows: [] }
  }

  const firstRow = splitLine(lines[0], options.columnSeparator)
  const headers = buildHeaders(firstRow, options.hasHeader, options.expectedHeaders || [])
  const startIndex = options.hasHeader ? 1 : 0
  const rows = []

  for (let i = startIndex; i < lines.length; i += 1) {
    const values = splitLine(lines[i], options.columnSeparator)
    const row = {}

    headers.forEach((header, index) => {
      row[header] = parseValue(values[index] || '', options)
    })

    rows.push(row)
  }

  return { headers, rows }
}

const escapeXml = (value) => {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const parseXmlRoot = (xmlText) => {
  if (!xmlText) {
    return ''
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')
  const resourceNode = doc.querySelector('prestashop > *') || doc.documentElement

  if (!resourceNode || !resourceNode.tagName) {
    return ''
  }

  return resourceNode.tagName
}

const buildXmlFromRow = (resourceKey, row, xmlRoot = '', options = {}) => {
  const forbiddenFields = options.forbiddenFields || DEFAULT_CREATE_FORBIDDEN_FIELDS
  const entries = []

  Object.entries(row).forEach(([key, value]) => {
    if (!key.trim()) {
      return
    }
    if (!isValidXmlTag(key)) {
      return
    }
    if (forbiddenFields.has(key)) {
      return
    }
    if (value === undefined || value === null || value === '') {
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== '') {
          entries.push({ key, value: item })
        }
      })
      return
    }
    entries.push({ key, value })
  })

  const body = entries
    .map((entry) => `    <${entry.key}>${escapeXml(entry.value)}</${entry.key}>`)
    .join('\n')

  const tag = xmlRoot || resourceKey
  return `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">\n  <${tag}>\n${body || '    '}\n  </${tag}>\n</prestashop>`
}

const validateRequired = (row, requiredFields) => {
  const missing = requiredFields.filter((field) => {
    const value = row[field]
    if (Array.isArray(value)) {
      return value.length === 0
    }
    return value === undefined || value === null || String(value).trim() === ''
  })

  return { isValid: missing.length === 0, missing }
}

export { parseCsv, buildXmlFromRow, validateRequired, parseXmlRoot }
