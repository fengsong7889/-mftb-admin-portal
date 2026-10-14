/**
 * 文檔中心入口（單路由多視圖慣例：按 pathname 切換 列表/詳情/登記）
 *
 * 階段一前端原型：數據為模塊內 mock；菜單種子與後端對接在階段二補齊。
 */
import { useLocation } from 'react-router-dom'
import DocLibrary from './DocLibrary'
import DocDetail from './DocDetail'
import DocRegisterForm from './DocRegisterForm'

export default function DocCenter() {
  const location = useLocation()
  if (location.pathname === '/doc-center/detail') return <DocDetail />
  if (location.pathname === '/doc-center/register') return <DocRegisterForm />
  if (location.pathname === '/doc-center/edit') return <DocRegisterForm />
  return <DocLibrary />
}
