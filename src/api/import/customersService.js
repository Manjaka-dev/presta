import { createCrud, getXml } from './crud'
import { extractIdsByTag, parseXml } from '@/utils/xmlUtils'

const crud = createCrud('customers', 'customer')

export const createCustomer = crud.create
export const readCustomer = crud.read

export async function findCustomerIdByEmail(email) {
  if (!email) {
    return null
  }
  const xml = await getXml('customers', {
    display: '[id]',
    'filter[email]': email
  })
  const doc = parseXml(xml)
  const ids = extractIdsByTag(doc, 'customer')
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value))
  return ids[0] ?? null
}
