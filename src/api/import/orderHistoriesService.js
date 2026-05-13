import { createCrud } from './crud'
const crud = createCrud('order_histories', 'order_history')
export const createOrderHistory = crud.create
