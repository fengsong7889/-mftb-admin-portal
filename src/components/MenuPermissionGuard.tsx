import { Button, Result } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useMenu } from '../contexts/MenuContext'
import { ROUTE_MENU_KEY_MAP, resolveFirstAccessiblePath } from '../pages/Permission/types'
import { isBackendConnected, pathToKey } from '../constants/menuDataSource'

/**
 * 菜單權限路由守衛 + 離線阻斷：
 * 1. 後端離線時，已接入後端 API 的菜單展示「服務不可用」提示頁，
 *    原型菜單（搜索管理/流量沙盤/推廣報表）照常放行；
 * 2. 在線時，受控路由（見 ROUTE_MENU_KEY_MAP）需持有對應菜單權限方可訪問，
 *    無權限時展示 403 提示頁；非受控路由直接放行。
 */
export default function MenuPermissionGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { hasMenuPermission, user } = useAuth()
  const { status: menuStatus } = useMenu()
  const location = useLocation()
  const navigate = useNavigate()

  const isTransferAsset = location.pathname === '/asset-detail' && new URLSearchParams(location.search).get('context') === 'transfer'
  const menuKey = isTransferAsset
    ? 'asset-transfer-list'
    : ROUTE_MENU_KEY_MAP[location.pathname] ?? pathToKey[location.pathname]

  const isOffline = menuStatus === 'offline'

  // 離線阻斷：後端停服時，已接入後端的菜單不允許訪問
  if (isOffline && menuKey && isBackendConnected(menuKey)) {
    return (
      <Result
        status="500"
        title="503"
        subTitle={t('guard.offlineSub', '後端服務暫時不可用，該功能需要後端支持。原型頁面仍可訪問。')}
        extra={
          <Button type="primary" onClick={() => navigate('/')}>
            {t('guard.backHome', '返回首頁')}
          </Button>
        }
      />
    )
  }

  // 權限阻斷
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
