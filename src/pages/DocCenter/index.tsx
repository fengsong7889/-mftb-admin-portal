/**
 * 文檔中心入口（單路由多視圖慣例：按 pathname 切換 列表/詳情/登記）
 *
 * 階段一前端原型：數據為模塊內 mock；菜單種子與後端對接在階段二補齊。
 */
import { lazy, Suspense } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Alert } from 'antd'
import DocLibrary from './DocLibrary'
import DocDetail from './DocDetail'
import DocRegisterForm from './DocRegisterForm'

const DocCenterPreview = lazy(() => import('./preview/DocCenterPreview'))

export default function DocCenter() {
  const location = useLocation()
  // 第一阶段预览沿用文档库已有门禁；不注册生产菜单，也不加载真实文档列表。
  if (import.meta.env.DEV && location.pathname === '/doc-center' && new URLSearchParams(location.search).has('preview')) {
    return <Suspense fallback={<div role="status">載入文檔中心預覽…</div>}><DocCenterPreview /></Suspense>
  }
  if (location.pathname === '/doc-center/detail') return <DocDetail />
  if (location.pathname === '/doc-center/register') return <DocRegisterForm />
  if (location.pathname === '/doc-center/edit') return <DocRegisterForm />
  return <>
    {import.meta.env.DEV && <Alert style={{ marginBottom: 16 }} type="info" showIcon
      message="文檔中心新版介面已可預覽（演示資料，不影響現有文檔）"
      action={<Link to="/doc-center?preview=plans">查看新版方案管理</Link>} />}
    <DocLibrary />
  </>
}
