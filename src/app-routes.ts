import type { ReactElement } from 'react'
import { RDM_ROUTES } from '@mftb/app-rdm/routes'
import { EAM_ROUTES } from '@mftb/app-eam/routes'
import { HR_ROUTES } from '@mftb/app-hr/routes'

/**
 * 门户壳装载的「应用路由组」（方案 §4.1）。
 *
 * 为什么单独一层：整站构建需要三个应用都装上；而「按应用构建」只该装一个。
 * 如果直接在 App.tsx 里 import 三份路由表，打包器无法剔除未使用的应用（实测产物一样大）。
 * 把「装哪些应用」收敛成这一个模块后，按应用构建只要**替换本模块的别名**指向
 * `frontend/apps/<app>/src/app-routes.ts`，其它应用的路由图就完全不会进入产物。
 */
export const appRoutes: Partial<Record<'rdm' | 'eam' | 'hr', ReactElement[]>> = {
  rdm: RDM_ROUTES,
  eam: EAM_ROUTES,
  hr: HR_ROUTES,
}
