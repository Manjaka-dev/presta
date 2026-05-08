const DEFAULT_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head']

const METHOD_LIMITS = {
  search: ['get', 'head'],
  stock_availables: ['get', 'put', 'patch', 'head'],
  stock_movements: ['get', 'head'],
  stocks: ['get', 'head'],
  supply_order_details: ['get', 'head'],
  supply_order_histories: ['get', 'head'],
  supply_order_receipt_histories: ['get', 'head'],
  supply_order_states: ['get', 'head'],
  supply_orders: ['get', 'head'],
  warehouse_product_locations: ['get', 'head'],
  warehouses: ['get', 'post', 'put', 'patch', 'head'],
}

const toComponentName = (key) => {
  return `${key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}Resource`
}

const makeResource = (key, label, endpoint, options = {}) => {
  const methods = options.methods || METHOD_LIMITS[key] || DEFAULT_METHODS

  return {
    key,
    label,
    endpoint,
    methods,
    component: options.component || toComponentName(key),
    route: `/admin/${key}`,
  }
}

export const categories = [
  {
    key: 'catalog',
    label: 'Catalogue',
    resources: [
      makeResource('products', 'Products', 'products'),
      makeResource('categories', 'Categories', 'categories'),
      makeResource('combinations', 'Combinations', 'combinations'),
      makeResource('product_options', 'Product options', 'product_options'),
      makeResource('product_option_values', 'Product option values', 'product_option_values'),
      makeResource('product_features', 'Product features', 'product_features'),
      makeResource('product_feature_values', 'Product feature values', 'product_feature_values'),
      makeResource('product_customization_fields', 'Product customization fields', 'product_customization_fields'),
      makeResource('product_suppliers', 'Product suppliers', 'product_suppliers'),
      makeResource('tags', 'Tags', 'tags'),
      makeResource('attachments', 'Attachments', 'attachments'),
      makeResource('attachments_file', 'Attachments file', 'attachments/file'),
      makeResource('manufacturers', 'Manufacturers', 'manufacturers'),
      makeResource('suppliers', 'Suppliers', 'suppliers'),
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    resources: [
      makeResource('customers', 'Customers', 'customers'),
      makeResource('addresses', 'Addresses', 'addresses'),
      makeResource('customer_messages', 'Customer messages', 'customer_messages'),
      makeResource('customer_threads', 'Customer threads', 'customer_threads'),
      makeResource('messages', 'Messages', 'messages'),
      makeResource('groups', 'Groups', 'groups'),
      makeResource('guests', 'Guests', 'guests'),
    ],
  },
  {
    key: 'orders',
    label: 'Orders',
    resources: [
      makeResource('orders', 'Orders', 'orders'),
      makeResource('order_details', 'Order details', 'order_details'),
      makeResource('order_histories', 'Order histories', 'order_histories'),
      makeResource('order_invoices', 'Order invoices', 'order_invoices'),
      makeResource('order_payments', 'Order payments', 'order_payments'),
      makeResource('order_slip', 'Order slip', 'order_slip'),
      makeResource('order_states', 'Order states', 'order_states'),
      makeResource('order_cart_rules', 'Order cart rules', 'order_cart_rules'),
      makeResource('order_carriers', 'Order carriers', 'order_carriers'),
      makeResource('carts', 'Carts', 'carts'),
      makeResource('cart_rules', 'Cart rules', 'cart_rules'),
      makeResource('deliveries', 'Deliveries', 'deliveries'),
    ],
  },
  {
    key: 'shipping',
    label: 'Shipping',
    resources: [
      makeResource('carriers', 'Carriers', 'carriers'),
      makeResource('price_ranges', 'Price ranges', 'price_ranges'),
      makeResource('weight_ranges', 'Weight ranges', 'weight_ranges'),
      makeResource('zones', 'Zones', 'zones'),
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    resources: [
      makeResource('stock_availables', 'Stock availables', 'stock_availables'),
      makeResource('stock_movements', 'Stock movements', 'stock_movements'),
      makeResource('stock_movement_reasons', 'Stock movement reasons', 'stock_movement_reasons'),
      makeResource('stocks', 'Stocks', 'stocks'),
    ],
  },
  {
    key: 'supply',
    label: 'Supply',
    resources: [
      makeResource('supply_orders', 'Supply orders', 'supply_orders'),
      makeResource('supply_order_details', 'Supply order details', 'supply_order_details'),
      makeResource('supply_order_histories', 'Supply order histories', 'supply_order_histories'),
      makeResource('supply_order_receipt_histories', 'Supply order receipt histories', 'supply_order_receipt_histories'),
      makeResource('supply_order_states', 'Supply order states', 'supply_order_states'),
      makeResource('warehouses', 'Warehouses', 'warehouses'),
      makeResource('warehouse_product_locations', 'Warehouse product locations', 'warehouse_product_locations'),
    ],
  },
  {
    key: 'localization',
    label: 'Localization',
    resources: [
      makeResource('countries', 'Countries', 'countries'),
      makeResource('states', 'States', 'states'),
      makeResource('currencies', 'Currencies', 'currencies'),
      makeResource('languages', 'Languages', 'languages'),
      makeResource('taxes', 'Taxes', 'taxes'),
      makeResource('tax_rules', 'Tax rules', 'tax_rules'),
      makeResource('tax_rule_groups', 'Tax rule groups', 'tax_rule_groups'),
    ],
  },
  {
    key: 'shop',
    label: 'Shop',
    resources: [
      makeResource('shops', 'Shops', 'shops'),
      makeResource('shop_groups', 'Shop groups', 'shop_groups'),
      makeResource('shop_urls', 'Shop urls', 'shop_urls'),
      makeResource('configurations', 'Configurations', 'configurations'),
      makeResource('translated_configurations', 'Translated configurations', 'translated_configurations'),
      makeResource('contacts', 'Contacts', 'contacts'),
      makeResource('content_management_system', 'CMS', 'content_management_system'),
      makeResource('employees', 'Employees', 'employees'),
      makeResource('stores', 'Stores', 'stores'),
    ],
  },
  {
    key: 'media',
    label: 'Media',
    resources: [
      makeResource('image_types', 'Image types', 'image_types'),
      makeResource('images', 'Images', 'images'),
      makeResource('images_general_header', 'Images general header', 'images/general/header'),
      makeResource('images_general_mail', 'Images general mail', 'images/general/mail'),
      makeResource('images_general_invoice', 'Images general invoice', 'images/general/invoice'),
      makeResource('images_general_store_icon', 'Images general store icon', 'images/general/store_icon'),
      makeResource('images_products', 'Images products', 'images/products'),
      makeResource('images_categories', 'Images categories', 'images/categories'),
      makeResource('images_manufacturers', 'Images manufacturers', 'images/manufacturers'),
      makeResource('images_suppliers', 'Images suppliers', 'images/suppliers'),
      makeResource('images_stores', 'Images stores', 'images/stores'),
      makeResource('images_customizations', 'Images customizations', 'images/customizations'),
    ],
  },
  {
    key: 'pricing',
    label: 'Pricing',
    resources: [
      makeResource('specific_prices', 'Specific prices', 'specific_prices'),
      makeResource('specific_price_rules', 'Specific price rules', 'specific_price_rules'),
    ],
  },
  {
    key: 'customizations',
    label: 'Customizations',
    resources: [
      makeResource('customizations', 'Customizations', 'customizations'),
    ],
  },
  {
    key: 'search',
    label: 'Search',
    resources: [
      makeResource('search', 'Search', 'search'),
    ],
  },
]

export const allResources = categories.flatMap((category) => category.resources)

export const resourceMap = Object.fromEntries(
  allResources.map((resource) => [resource.key, resource])
)

export const getResource = (key) => resourceMap[key]

