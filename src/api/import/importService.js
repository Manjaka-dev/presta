/**
 * Moteur d'import CSV — Orchestrateur principal
 * Dispatch vers les handlers par type de ressource
 */
import { DEFAULT_CATEGORY_ID, DEFAULT_LANG_ID } from './constants'
import { createCategory, findCategoryIdByName } from './categoriesService'
import { createProduct, findProductIdByReference, findProductInfoByReference, updateProduct, patchProductAvailableDate } from './productsService'
import { setQuantityForProduct, setQuantityForProductAttribute } from './stockAvailablesService'
import { uploadProductImage } from './imagesService'
import { createProductOption, findProductOptionIdByName } from './productOptionsService'
import { createProductOptionValue, findProductOptionValueIdByName } from './productOptionValuesService'
import { createCombinationForProduct, findCombinationByProductAndValueId } from './combinationsService'
import { buildOrderConfig, createOrderFromCsvRow, validateOrderConfig } from './commandeService'
import { slugify, toFloat, toInt, formatMoney } from '@/utils/stringUtils'
import { ensureTaxSystem, getTaxRateByGroupId } from './taxesService'

/**
 * Point d'entrée principal
 * @param {{ target: string, rows?: Array, files?: FileList|Array, onProgress?: Function }} options
 */
export async function runImport({ target, rows = [], files = [], onProgress }) {
  const progress = (msg) => {
    console.info(`[Import:${target}]`, msg)
    if (onProgress) onProgress(msg)
  }

  if (target === 'images') {
    return importImages(files, progress)
  }
  if (!Array.isArray(rows)) {
    throw new Error('CSV rows manquants')
  }
  if (target === 'products') {
    return importProducts(rows, progress)
  }
  if (target === 'stocks') {
    return importStocks(rows, progress)
  }
  if (target === 'orders') {
    return importOrders(rows, progress)
  }

  return { total: rows.length, success: 0 }
}

function formatError(error) {
  let msg = error.message || String(error)
  if (error.body) {
    try {
      const match = error.body.match(/<message><!\[CDATA\[(.*?)\]\]><\/message>/s)
      if (match) {
        msg += ` | Détail API: ${match[1].trim()}`
      } else {
        // Nettoyer un peu le HTML/XML brut pour l'affichage
        const cleanBody = error.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        msg += ` | Réponse API: ${cleanBody.substring(0, 150)}...`
      }
    } catch (e) {
      // Ignorer
    }
  }
  return msg
}

// ─── Produits ────────────────────────────────────────────────────────────────

async function importProducts(rows, progress) {
  let success = 0

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const name = row.nom?.trim()
    const reference = row.reference?.trim()

    if (!name || !reference) {
      progress(`Ligne ${index + 1}: nom ou reference manquant`)
      continue
    }

    try {
      const categoryName = row.categorie?.trim()
      const categoryId = await ensureCategoryId(categoryName)
      const availableDate = toIsoDate(row.date_availability_produit || row.date_produit || row.date)

      // Gestion des taxes
      let taxRulesGroupId = 0
      let taxRate = 0
      const taxCol = row.taxe || row.Taxe || row.tva || row.TVA || ''
      if (taxCol) {
        const countryId = toInt(import.meta.env.VITE_DEFAULT_COUNTRY_ID || '8', 8)
        const taxSystem = await ensureTaxSystem(taxCol, countryId)
        if (taxSystem) {
          taxRulesGroupId = taxSystem.taxRulesGroupId
          taxRate = taxSystem.rate
        }
      }

      const prixTtc = toFloat(row.prix_ttc || '0', 0)
      const priceHt = taxRate > 0 ? prixTtc / (1 + (taxRate / 100)) : prixTtc
      const wholesalePriceTtc = toFloat(row.prix_achat || '0', 0)
      const wholesalePriceHt = taxRate > 0 ? wholesalePriceTtc / (1 + (taxRate / 100)) : wholesalePriceTtc

      const input = {
        name,
        reference,
        price: priceHt,
        wholesalePrice: wholesalePriceHt,
        categoryId,
        availableDate,
        linkRewrite: slugify(name),
        taxRulesGroupId
      }

      const existingId = await findProductIdByReference(reference)
      if (existingId) {
        await updateProduct(existingId, input, DEFAULT_LANG_ID)
        if (input.availableDate) await patchProductAvailableDate(existingId, input.availableDate)
        progress(`Ligne ${index + 1}: produit "${name}" mis à jour (ID ${existingId})`)
      } else {
        const newId = await createProduct(input, DEFAULT_LANG_ID)
        if (input.availableDate) await patchProductAvailableDate(newId, input.availableDate)
        progress(`Ligne ${index + 1}: produit "${name}" créé (ID ${newId})`)
      }
      success += 1
    } catch (error) {
      progress(`Ligne ${index + 1}: ERREUR — ${formatError(error)}`)
    }
  }

  return { total: rows.length, success }
}

// ─── Stocks & Déclinaisons ───────────────────────────────────────────────────

async function importStocks(rows, progress) {
  let success = 0
  const baseStockTotals = new Map()
  const hasCombination = new Set()
  const optionCache = new Map()
  const valueCache = new Map()
  const combinationCache = new Map()
  const productCache = new Map()

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const reference = row.reference?.trim()
    if (!reference) continue

    try {
      const productInfo = await getProductInfoByReference(reference, productCache)
      if (!productInfo) {
        progress(`Stock ligne ${index + 1}: produit non trouvé pour "${reference}"`)
        continue
      }

      const specificite = getSpecificite(row)
      const karazany = row.karazany?.trim()
      const quantity = toInt(row.stock_initial || '0', 0)

      if (specificite && karazany) {
        hasCombination.add(reference)
        const groupId = await ensureProductOptionId(specificite, optionCache)
        const valueId = await ensureProductOptionValueId(groupId, karazany, valueCache)
        
        let priceImpactStr = '0.00'
        if (row.prix_vente_ttc) {
          const salePriceTtc = toFloat(row.prix_vente_ttc || '0', 0)
          
          let taxRate = 0
          if (productInfo.id_tax_rules_group) {
            taxRate = await getTaxRateByGroupId(productInfo.id_tax_rules_group)
          }
          
          const priceHtFinal = taxRate > 0 ? salePriceTtc / (1 + (taxRate / 100)) : salePriceTtc
          const impact = priceHtFinal - productInfo.price
          priceImpactStr = formatMoney(impact)
        }

        const combinationId = await ensureCombinationId(
          productInfo, valueId, reference, karazany, priceImpactStr, combinationCache
        )

        if (!combinationId) {
          progress(`Stock ligne ${index + 1}: impossible de créer la déclinaison pour "${reference}" ${karazany}`)
          continue
        }

        await setQuantityForProductAttribute(productInfo.id, combinationId, quantity)
        progress(`Stock ligne ${index + 1}: "${reference}" ${karazany} → ${quantity} unités`)
        success += 1

        const total = baseStockTotals.get(reference) || 0
        baseStockTotals.set(reference, total + quantity)
        continue
      }

      // Pas de déclinaison — stock simple
      const total = baseStockTotals.get(reference) || 0
      baseStockTotals.set(reference, total + quantity)
    } catch (error) {
      progress(`Stock ligne ${index + 1}: ERREUR — ${formatError(error)}`)
    }
  }

  // Mettre à jour le stock de base pour les produits sans déclinaison
  for (const [reference, total] of baseStockTotals.entries()) {
    if (hasCombination.has(reference)) continue
    try {
      const productId = await findProductIdByReference(reference)
      if (!productId) {
        progress(`Stock: produit non trouvé pour "${reference}"`)
        continue
      }
      await setQuantityForProduct(productId, total)
      progress(`Stock: "${reference}" → ${total} unités`)
      success += 1
    } catch (error) {
      progress(`Stock "${reference}": ERREUR — ${formatError(error)}`)
    }
  }

  return { total: rows.length, success }
}

// ─── Commandes ───────────────────────────────────────────────────────────────

async function importOrders(rows, progress) {
  let success = 0
  const config = buildOrderConfig()
  
  try {
    validateOrderConfig(config)
  } catch (error) {
    progress(`Configuration Commande ERREUR — ${formatError(error)}`)
    return { total: rows.length, success }
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    try {
      const result = await createOrderFromCsvRow(row, config)
      progress(`Commande ligne ${index + 1}: créée avec succès (${result})`)
      success += 1
    } catch (error) {
      progress(`Commande ligne ${index + 1}: ERREUR — ${formatError(error)}`)
    }
  }

  return { total: rows.length, success }
}

// ─── Images ──────────────────────────────────────────────────────────────────

async function importImages(files, progress) {
  let success = 0
  let imagesToProcess = []

  try {
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default
    
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        progress(`Décompression de ${file.name}...`)
        const zip = new JSZip()
        const zipContent = await zip.loadAsync(file)
        
        for (const [filename, zipEntry] of Object.entries(zipContent.files)) {
          if (!zipEntry.dir && filename.match(/\.(jpe?g|png|gif|webp)$/i)) {
            // Ignorer les dossiers système de macOS
            if (filename.startsWith('__MACOSX/')) continue
            
            const blob = await zipEntry.async('blob')
            const imageFile = new File([blob], filename.split('/').pop(), { type: `image/${filename.split('.').pop()}` })
            imagesToProcess.push(imageFile)
          }
        }
      } else if (file.type.startsWith('image/')) {
        imagesToProcess.push(file)
      }
    }
  } catch(e) {
    progress(`Erreur lors de la préparation des images: ${e.message}`)
    // Fallback si JSZip ne se charge pas, on utilise les images non-ZIP
    imagesToProcess = Array.from(files).filter(f => f.type.startsWith('image/'))
  }

  progress(`${imagesToProcess.length} image(s) à importer...`)

  for (let index = 0; index < imagesToProcess.length; index += 1) {
    const file = imagesToProcess[index]
    const reference = getReferenceFromFilename(file.name)
    if (!reference) {
      progress(`Image "${file.name}": pas de référence détectée`)
      continue
    }
    try {
      const productId = await findProductIdByReference(reference)
      if (!productId) {
        progress(`Image "${file.name}": produit non trouvé pour ref "${reference}"`)
        continue
      }
      await uploadProductImage(productId, file)
      progress(`Image "${file.name}": uploadée pour produit ${productId}`)
      success += 1
    } catch (error) {
      progress(`Image "${file.name}": ERREUR — ${formatError(error)}`)
    }
  }

  return { total: imagesToProcess.length, success }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureCategoryId(name) {
  if (!name) return DEFAULT_CATEGORY_ID
  const existingId = await findCategoryIdByName(name)
  if (existingId) return existingId
  return createCategory({
    name,
    parentId: DEFAULT_CATEGORY_ID,
    description: '',
    linkRewrite: slugify(name)
  }, DEFAULT_LANG_ID)
}

function toIsoDate(raw) {
  if (!raw) return ''
  const parts = raw.split('/')
  if (parts.length !== 3) return ''
  const [day, month, year] = parts
  if (!day || !month || !year) return ''
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function getReferenceFromFilename(filename) {
  const lastDot = filename.lastIndexOf('.')
  const base = lastDot === -1 ? filename : filename.slice(0, lastDot)
  return base.trim()
}

async function ensureProductOptionId(name, cache) {
  const normalized = name.trim()
  if (!normalized) throw new Error('Missing specificite')
  if (cache.has(normalized)) return cache.get(normalized)
  const existingId = await findProductOptionIdByName(normalized)
  if (existingId) {
    cache.set(normalized, existingId)
    return existingId
  }
  const id = await createProductOption({ name: normalized })
  cache.set(normalized, id)
  return id
}

async function ensureProductOptionValueId(groupId, name, cache) {
  const normalized = name.trim()
  const key = `${groupId}:${normalized}`
  if (cache.has(key)) return cache.get(key)
  const existingId = await findProductOptionValueIdByName(normalized, groupId)
  if (existingId) {
    cache.set(key, existingId)
    return existingId
  }
  const id = await createProductOptionValue({ groupId, name: normalized })
  cache.set(key, id)
  return id
}

async function ensureCombinationId(productInfo, valueId, reference, karazany, priceImpact, cache) {
  const key = `${productInfo.id}:${valueId}`
  if (cache.has(key)) return cache.get(key)
  const existing = await findCombinationByProductAndValueId(productInfo.id, valueId)
  if (existing) {
    cache.set(key, existing.id)
    return existing.id
  }
  const combinationReference = `${reference}-${slugify(karazany)}`
  const id = await createCombinationForProduct({
    productId: productInfo.id,
    valueIds: [valueId],
    reference: combinationReference,
    priceImpact
  })
  cache.set(key, id)
  return id
}

async function getProductInfoByReference(reference, cache) {
  if (cache.has(reference)) return cache.get(reference)
  const info = await findProductInfoByReference(reference)
  if (info) cache.set(reference, info)
  return info
}

function getSpecificite(row) {
  const raw = row.specificite || row.specificit || row.specificite_ || ''
  return String(raw || '').trim()
}