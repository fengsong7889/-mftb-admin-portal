import { useLocation } from 'react-router-dom'
import SearchV2Prototype from './index'
import { leafConfigFor } from './leafRoutes'

/**
 * 既有菜单叶子的新版页面入口：以叶子模式渲染 SearchV2 工作台
 * （无横线 tab、无「借用全局配置入口」提示，侧边栏即导航）。
 *
 * 所有已融合叶子共用本组件挂载到各自 <Route>，具体承载哪个能力域由 pathname
 * 查 leafRoutes.ts 的映射决定，保证「菜单 key ↔ 路径 ↔ 能力域」只有一处真值。
 */
export default function SearchV2Leaf() {
  const { pathname } = useLocation()
  const config = leafConfigFor(pathname)
  // 路由表与映射由同一份配置生成，理论上不会取不到；兜底回落地页避免白屏。
  if (!config) return <SearchV2Prototype />
  return <SearchV2Prototype key={pathname} pane={config.pane} kinds={config.kinds} menuKey={config.menuKey} leafPath={config.path} />
}
