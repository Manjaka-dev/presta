const REQUIRED_FIELDS = {
  addresses: ['id_country', 'alias', 'lastname', 'firstname', 'address1', 'city'],
  customers: ['passwd', 'lastname', 'firstname', 'email'],
  products: ['name', 'link_rewrite'],
  orders: [
    'id_address_delivery',
    'id_address_invoice',
    'id_cart',
    'id_currency',
    'id_lang',
    'id_customer',
    'id_carrier',
    'module',
    'payment',
    'total_paid',
    'total_paid_real',
    'total_products',
    'total_products_wt',
  ],
  carts: ['id_currency', 'id_lang'],
  categories: ['id_parent', 'name', 'link_rewrite'],
  combinations: ['id_product'],
  carriers: ['name', 'delay'],
  stock_availables: ['id_product', 'id_product_attribute', 'quantity', 'depends_on_stock', 'out_of_stock'],
  order_histories: ['id_order', 'id_order_state'],
  specific_prices: [
    'id_cart',
    'id_product',
    'id_currency',
    'id_country',
    'id_group',
    'id_customer',
    'price',
    'from_quantity',
    'reduction',
    'reduction_tax',
    'reduction_type',
    'from',
    'to',
  ],
}

export const getRequiredFields = (resourceKey) => REQUIRED_FIELDS[resourceKey] || []

export { REQUIRED_FIELDS }

