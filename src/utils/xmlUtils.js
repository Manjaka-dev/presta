/**
 * Utilitaires XML pour l'API PrestaShop
 * Parse, construit et manipule le XML natif de PrestaShop
 */

export function parseXml(xml) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const error = doc.querySelector('parsererror')
  if (error) {
    throw new Error('Invalid XML response')
  }
  return doc
}

export function getText(node, selector, fallback = '') {
  const el = node.querySelector(selector)
  return el && el.textContent ? el.textContent.trim() : fallback
}

export function wrapCdata(value) {
  const safe = String(value).replace(/]]>/g, ']]]]><![CDATA[>')
  return `<![CDATA[${safe}]]>`
}

export function langField(value, langId = 1) {
  return {
    language: [
      {
        _attrs: { id: String(langId) },
        _text: value ?? ''
      }
    ]
  }
}

export function xmlToJson(xml) {
  const doc = parseXml(xml)
  return elementToJson(doc.documentElement)
}

export function jsonToXml(data) {
  return Object.entries(data)
    .filter(([key]) => key !== '_attrs' && key !== '_text')
    .map(([key, value]) => buildNode(key, value))
    .join('')
}

export function buildEntityXml(entityTag, data) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">',
    `  <${entityTag}>`,
    `    ${jsonToXml(data)}`,
    `  </${entityTag}>`,
    '</prestashop>'
  ].join('\n')
}

export function extractIdsByTag(doc, itemTag) {
  return Array.from(doc.querySelectorAll(itemTag))
    .map((node) => node.getAttribute('id') || node.querySelector('id')?.textContent || '')
    .map((value) => value.trim())
    .filter(Boolean)
}

export function extractEntityId(doc, itemTag) {
  const node = doc.querySelector(itemTag)
  if (!node) {
    return null
  }
  const raw = node.getAttribute('id') || node.querySelector('id')?.textContent
  if (!raw) {
    return null
  }
  const parsed = Number.parseInt(raw.trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function getIdFromXml(xml, itemTag) {
  const doc = parseXml(xml)
  return extractEntityId(doc, itemTag)
}

function elementToJson(node) {
  const children = Array.from(node.children)
  const text = node.textContent ? node.textContent.trim() : ''
  const attrs = {}
  for (const attr of Array.from(node.attributes || [])) {
    attrs[attr.name] = attr.value
  }

  if (!children.length) {
    if (Object.keys(attrs).length) {
      return { _attrs: attrs, _text: text }
    }
    return text
  }

  const result = Object.keys(attrs).length ? { _attrs: attrs } : {}
  for (const child of children) {
    const value = elementToJson(child)
    const key = child.tagName
    if (result[key] === undefined) {
      result[key] = value
    } else if (Array.isArray(result[key])) {
      result[key].push(value)
    } else {
      result[key] = [result[key], value]
    }
  }
  if (text && !children.length) {
    result._text = text
  }
  return result
}

function buildNode(tag, value) {
  if (value === undefined || value === null) {
    return ''
  }
  if (Array.isArray(value)) {
    return value.map((item) => buildNode(tag, item)).join('')
  }
  if (typeof value === 'object') {
    const attrs = value._attrs || {}
    const text = value._text
    const inner = text !== undefined ? wrapCdata(text) : jsonToXml(value)
    const attrsText = Object.entries(attrs)
      .map(([key, val]) => ` ${key}="${val}"`)
      .join('')
    return `<${tag}${attrsText}>${inner}</${tag}>`
  }
  return `<${tag}>${wrapCdata(value)}</${tag}>`
}
