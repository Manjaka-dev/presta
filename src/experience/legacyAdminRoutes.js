import { allResources } from '../config/resources'

import AdminLayout from './layouts/AdminLayout.vue'
import AdminHome from './views/admin/AdminHome.vue'
import ImportCsv from './views/admin/tools/ImportCsv.vue'
import ResetData from './views/admin/tools/ResetData.vue'

const resourceViews = import.meta.glob('./views/admin/resources/*.vue')

const resourceRoutes = allResources.map((resource) => {
  const viewPath = `./views/admin/resources/${resource.component}.vue`

  return {
    path: resource.route,
    name: `experience-admin-${resource.key}`,
    component: resourceViews[viewPath],
    meta: {
      resourceKey: resource.key,
      experience: true,
    },
  }
})

export const legacyAdminRoute = {
  path: '/experience/admin',
  component: AdminLayout,
  children: [
    {
      path: '',
      name: 'experience-admin-home',
      component: AdminHome,
    },
    {
      path: 'tools/import-csv',
      name: 'experience-admin-import-csv',
      component: ImportCsv,
    },
    {
      path: 'tools/reset-data',
      name: 'experience-admin-reset-data',
      component: ResetData,
    },
    ...resourceRoutes.map((route) => ({
      ...route,
      path: route.path.replace('/admin/', ''),
    })),
  ],
}

export { AdminLayout, AdminHome, ImportCsv, ResetData }

