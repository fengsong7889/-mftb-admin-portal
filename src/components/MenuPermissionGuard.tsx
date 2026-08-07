import { Button, Result } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { ROUTE_MENU_KEY_MAP, resolveFirstAccessiblePath } from '../pages/Permission/types'

/**
 * 菜單權限路由守衛：
 * 受控路由（見 ROUTE_MENU_KEY_MAP）需持有對應菜單權限方可訪問，
 * 無權限時展示 403 提示頁；非受控路由直接放行。
 */
export default function MenuPermissionGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { hasMenuPermission, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const menuKey = ROUTE_MENU_KEY_MAP[location.pathname]
  if (menuKey && !hasMenuPermission(menuKey)) {
    const fallbackPath = resolveFirstAccessiblePath(
      user?.role === 'admin',
      hasMenuPermission,
    )
    return (
      <Result
        status="403"
        title="403"
        subTitle={t('guard.403Sub')}
        extra={
          <Button type="primary" onClick={() => navigate(fallbackPath)}>
            {fallbackPath === '/' ? t('guard.backHome') : t('guard.goMenu')}
          </Button>
        }
      />
    )
  }

  return <>{children}</>
}
