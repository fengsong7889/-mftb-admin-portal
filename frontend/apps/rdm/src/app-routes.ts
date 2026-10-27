import type { ReactElement } from 'react'
import { RDM_ROUTES } from './routes'

/**
 * 按应用构建时替换 `@/app-routes` 的入口模块（方案 §4.1）。
 * 只导出本应用的路由组：其它应用的路由图不会进入 bundle。
 */
export const appRoutes: Partial<Record<'rdm' | 'eam' | 'hr', ReactElement[]>> = {
  rdm: RDM_ROUTES,
}
