import { createRouter, createWebHistory } from 'vue-router'

import Home from '../views/Home.vue'
import FrontOfficeHome from '../views/front/FrontOfficeHome.vue'
import ProductCatalog from '../views/front/ProductCatalog.vue'
import ProductDetailView from '../views/front/ProductDetailView.vue'
import OrdersView from '../views/front/OrdersView.vue'
import OrderDetailView from '../views/front/OrderDetailView.vue'
import CartView from '../views/front/CartView.vue'
import CheckoutView from '../views/front/CheckoutView.vue'
import BackOfficeHome from '../views/back/BackOfficeHome.vue'
import ResetFront from '../components/backoffice/reset/ResetFront.vue'
import OrdersBackoffice from '../components/backoffice/orders/OrdersBackoffice.vue'
import DataImportView from '../views/back/DataImportView.vue'
import { legacyAdminRoute } from '../experience'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/front',
      name: 'front-home',
      component: FrontOfficeHome,
    },
    {
      path: '/front/products',
      name: 'front-products',
      component: ProductCatalog,
    },
    {
      path: '/front/products/:id',
      name: 'front-product-detail',
      component: ProductDetailView,
    },
    {
      path: '/front/cart',
      name: 'front-cart',
      component: CartView,
    },
    {
      path: '/front/checkout',
      name: 'front-checkout',
      component: CheckoutView,
    },
    {
      path: '/front/orders',
      name: 'front-orders',
      component: OrdersView,
    },
    {
      path: '/front/orders/:id',
      name: 'front-order-detail',
      component: OrderDetailView,
    },
    {
      path: '/back',
      name: 'back-home',
      component: BackOfficeHome,
    },
    {
      path: '/back/reset',
      name: 'back-reset',
      component: ResetFront,
    },
    {
      path: '/back/orders',
      name: 'back-orders',
      component: OrdersBackoffice,
    },
    {
      path: '/back/import',
      name: 'back-import',
      component: DataImportView,
    },
    {
      path: '/admin',
      redirect: '/back',
    },
    legacyAdminRoute,
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
