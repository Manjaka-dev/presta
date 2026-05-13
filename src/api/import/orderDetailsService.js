import { createCrud } from './crud'
const crud = createCrud('order_details', 'order_detail')
export const createOrderDetail = crud.create
