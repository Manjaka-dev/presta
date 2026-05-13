import { createCrud } from './crud'
const crud = createCrud('orders', 'order')
export const createOrder = crud.create
