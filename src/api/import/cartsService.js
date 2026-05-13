import { createCrud } from './crud'
const crud = createCrud('carts', 'cart')
export const createCart = crud.create
