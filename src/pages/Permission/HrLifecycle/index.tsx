import type { HrLifecycleType } from '../../../api/hrLifecycle'
import LifecycleList from './LifecycleList'

/**
 * 入转调离列表入口（单路由多视图惯例：列表在 /hr-xx，表单/详情为独立路由）。
 * 权限阻断由 MenuPermissionGuard 按 ROUTE_MENU_KEY_MAP 统一处理。
 */
export default function HrLifecycle({ type }: { type: HrLifecycleType }) {
  return <LifecycleList type={type} />
}
