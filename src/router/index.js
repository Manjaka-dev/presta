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
import BackOfficeLogin from '../views/back/BackOfficeLogin.vue'
import DashboardView from '../views/back/DashboardView.vue'
import ResetFront from '../components/backoffice/reset/ResetFront.vue'
import OrdersBackoffice from '../components/backoffice/orders/OrdersBackoffice.vue'
import DataImportView from '../views/back/DataImportView.vue'
import StockManagementView from '../views/back/StockManagementView.vue'
import FrontOfficeLogin from '../views/front/FrontOfficeLogin.vue'
import OldFrontOfficeLogin from '../views/front/OldFrontOfficeLogin.vue'
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
      redirect: '/front/products',
    },
    {
      path: '/front/login',
      name: 'front-login',
      component: FrontOfficeLogin,
    },
    {
      path: '/front/old/login',
      name: 'front-old-login',
      component: OldFrontOfficeLogin,
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
      path: '/back/login',
      name: 'back-login',
      component: BackOfficeLogin,
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
      path: '/back/dashboard',
      name: 'back-dashboard',
      component: DashboardView,
    },
    {
      path: '/back/import',
      name: 'back-import',
      component: DataImportView,
    },
    {
      path: '/back/stock',
      name: 'back-stock',
      component: StockManagementView,
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

router.beforeEach((to, from, next) => {
  // Protection Backoffice
  if (to.path.startsWith('/back') && to.name !== 'back-login') {
    const isAdmin = sessionStorage.getItem('isAdminLoggedIn') === 'true'
    if (!isAdmin) {
      return next({ name: 'back-login' })
    }
  }

  // Protection Frontoffice (optionnel: protéger /front/checkout, /front/orders, etc.)
  // On peut protéger toutes les routes /front sauf les logins
  if (to.path.startsWith('/front') && !['front-login', 'front-old-login'].includes(to.name)) {
    const customerId = sessionStorage.getItem('customerId') || localStorage.getItem('customerId')
    // null = non connecté
    if (customerId === null) {
      return next({ name: 'front-login' })
    }
  }

  next()
})

export default router