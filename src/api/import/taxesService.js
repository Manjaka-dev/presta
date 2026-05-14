import { DEFAULT_LANG_ID } from './constants'
import { createCrud, getXml, postXml } from './crud'
import { buildEntityXml, extractIdsByTag, langField, parseXml, getText } from '@/utils/xmlUtils'
import { toFloat } from '@/utils/stringUtils'

// --- Taxes ---

export async function findTaxIdByRate(rate) {
  const xml = await getXml('taxes', {
    display: '[id,rate]',
  })
  const doc = parseXml(xml)
  const taxes = doc.querySelectorAll('tax')
  for (const node of taxes) {
    const taxRate = toFloat(getText(node, 'rate'), 0)
    if (Math.abs(taxRate - rate) < 0.001) {
      return parseInt(getText(node, 'id'), 10)
    }
  }
  return null
}

export async function createTax(rate, langId = DEFAULT_LANG_ID) {
  const name = `TVA ${rate}%`
  const payload = {
    rate: rate.toFixed(3),
    active: 1,
    deleted: 0,
    name: langField(name, langId)
  }
  const xml = buildEntityXml('tax', payload)
  const responseXml = await postXml('taxes', xml)
  const doc = parseXml(responseXml)
  const idStr = getText(doc, 'id') || doc.querySelector('tax')?.getAttribute('id')
  if (!idStr) throw new Error('Missing tax id in response')
  return parseInt(idStr, 10)
}

// --- Tax Rule Groups ---

export async function findTaxRuleGroupIdByName(name) {
  const xml = await getXml('tax_rule_groups', {
    display: '[id,name]',
    'filter[name]': `[${name}]`
  })
  const doc = parseXml(xml)
  const ids = extractIdsByTag(doc, 'tax_rule_group')
    .map(v => parseInt(v, 10))
    .filter(v => Number.isFinite(v))
  return ids[0] ?? null
}

export async function createTaxRuleGroup(name) {
  const payload = {
    name,
    active: 1,
    deleted: 0,
  }
  const xml = buildEntityXml('tax_rule_group', payload)
  const responseXml = await postXml('tax_rule_groups', xml)
  const doc = parseXml(responseXml)
  const idStr = getText(doc, 'id') || doc.querySelector('tax_rule_group')?.getAttribute('id')
  if (!idStr) throw new Error('Missing tax_rule_group id in response')
  return parseInt(idStr, 10)
}

// --- Tax Rules ---

export async function createTaxRule(id_tax_rules_group, id_tax, id_country) {
  const payload = {
    id_tax_rules_group,
    id_tax,
    id_country,
    id_state: 0,
    zipcode_from: 0,
    zipcode_to: 0,
    behavior: 0, // 0 = This tax only
    description: 'Auto-generated rule'
  }
  const xml = buildEntityXml('tax_rule', payload)
  const responseXml = await postXml('tax_rules', xml)
  const doc = parseXml(responseXml)
  const idStr = getText(doc, 'id') || doc.querySelector('tax_rule')?.getAttribute('id')
  if (!idStr) throw new Error('Missing tax_rule id in response')
  return parseInt(idStr, 10)
}

// --- High level orchestration ---

export async function ensureTaxSystem(rateString, countryId = 8) {
  // Parse rate like "11,65%" or "20"
  const cleanRateStr = rateString.replace('%', '').trim()
  const rate = toFloat(cleanRateStr, 0)
  if (rate <= 0) return 0 // No tax

  // 1. Ensure Tax exists
  let taxId = await findTaxIdByRate(rate)
  if (!taxId) {
    taxId = await createTax(rate)
  }

  // 2. Ensure Tax Rule Group exists
  const groupName = `TVA ${rate}%`
  let groupId = await findTaxRuleGroupIdByName(groupName)
  if (!groupId) {
    groupId = await createTaxRuleGroup(groupName)
    // 3. Create Tax Rule linking Group, Tax, and Country
    await createTaxRule(groupId, taxId, countryId)
  }

  return { taxRulesGroupId: groupId, rate }
}
