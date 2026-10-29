import { useLocation, useNavigate } from 'react-router-dom'

interface MinutesReturnPoint {
  path: string
  key: string
}

/** 来源只控制前端返回路径，不作为权限凭据；仅接受本模块的站内路由。 */
function readReturnPoint(state: unknown): MinutesReturnPoint | undefined {
  if (!state || typeof state !== 'object' || !('minutesReturn' in state)) return undefined
  const point = state.minutesReturn
  if (!point || typeof point !== 'object' || !('path' in point) || !('key' in point)
    || typeof point.path !== 'string' || typeof point.key !== 'string' || !point.key) return undefined
  if (!/^\/meeting-(?:minutes-list|my|record|detail|minutes|minutes-form)(?:\?[^#\\]*)?$/.test(point.path)) return undefined
  return { path: point.path, key: point.key }
}

/** 进入子页才 PUSH，返回只 POP／REPLACE，避免纪要与会议详情互相新增历史。 */
export default function useMinutesNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const source = readReturnPoint(location.state)
  // 浏览器路由以 idx 为准；内存路由没有 idx 时，非初始 key 表示已发生站内导航。
  const routerIndex = window.history.state?.idx
  const hasBackHistory = Number.isInteger(routerIndex) ? routerIndex > 0 : location.key !== 'default'
  const open = (path: string) => navigate(path, {
    state: { minutesReturn: { path: `${location.pathname}${location.search}`, key: location.key } },
  })
  const back = () => {
    // idx 是 React Router 自己的站内历史位置，不能用包含外站历史的 history.length。
    if (hasBackHistory) navigate(-1)
    else navigate('/meeting-my', { replace: true })
  }
  const finishEditing = (minutesId: number) => {
    const target = `/meeting-minutes?id=${minutesId}`
    const previous = source ? new URL(source.path, window.location.origin) : undefined
    if (hasBackHistory && source?.key !== location.key && previous?.pathname === '/meeting-minutes' && previous.searchParams.get('id') === String(minutesId)) {
      // 编辑前就是同一份纪要：回到已有阅读页，保留它原来的列表／详情来路。
      navigate(-1)
    } else {
      // 新建或由详情直接编辑：用阅读页替换表单，返回时不会再次进入已保存表单。
      navigate(target, { replace: true, state: source ? { minutesReturn: source } : null })
    }
  }
  return { open, back, finishEditing }
}
