import { createRouter, createWebHistory } from 'vue-router'

import Home from '../views/Home.vue'
import FrontOfficeHome from '../views/front/FrontOfficeHome.vue'
import BackOfficeHome from '../views/back/BackOfficeHome.vue'
import ResetFront from '../components/backoffice/reset/ResetFront.vue'
import OrdersBackoffice from '../components/backoffice/orders/OrdersBackoffice.vue'
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
