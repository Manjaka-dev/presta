import { createCrud } from './crud'
const crud = createCrud('addresses', 'address')
export const createAddress = crud.create
