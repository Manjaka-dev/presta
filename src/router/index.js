import { createRouter, createWebHistory } from 'vue-router'
import { allResources } from '../config/resources'

import Home from '../views/Home.vue'
import AdminLayout from '../layouts/AdminLayout.vue'
import AdminHome from '../views/admin/AdminHome.vue'
import ImportCsv from '../views/admin/tools/ImportCsv.vue'
import ResetData from '../views/admin/tools/ResetData.vue'

const resourceViews = import.meta.glob('../views/admin/resources/*.vue')

const resourceRoutes = allResources.map((resource) => {
  const viewPath = `../views/admin/resources/${resource.component}.vue`

  return {
    path: resource.route,
    name: `admin-${resource.key}`,
    component: resourceViews[viewPath],
    meta: {
      resourceKey: resource.key,
    },
  }
})

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
    },
    {
      path: '/admin',
      component: AdminLayout,
      children: [
        {
          path: '',
          name: 'admin-home',
          component: AdminHome,
        },
        {
          path: 'tools/import-csv',
          name: 'admin-import-csv',
          component: ImportCsv,
        },
        {
          path: 'tools/reset-data',
          name: 'admin-reset-data',
          component: ResetData,
        },
        ...resourceRoutes.map((route) => ({
          ...route,
          path: route.path.replace('/admin/', ''),
        })),
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

export default router
