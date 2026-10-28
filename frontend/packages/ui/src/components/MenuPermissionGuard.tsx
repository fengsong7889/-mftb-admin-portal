import { Button, Result, Space, Spin } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useMenu } from '@/contexts/MenuContext'
import { ROUTE_MENU_KEY_MAP, ROUTE_MENU_ANY_OF_MAP, resolveFirstAccessiblePath } from '@mftb/contracts/menuPermission'
import { isBackendConnected, pathToKey } from '@/constants/menuDataSource'

/**
 * 菜單權限路由守衛 + 離線阻斷：
 * 1. 後端離線時，已接入後端 API 的菜單展示「服務不可用」提示頁，
 *    原型菜單（搜索管理/流量沙盤/推廣報表）照常放行；
 * 2. 在線時，受控路由（見 ROUTE_MENU_KEY_MAP）需持有對應菜單權限方可訪問，
 *    無權限時展示 403 提示頁；多业务共用的路由可在 ROUTE_MENU_ANY_OF_MAP 里声明
 *    「持有其中任一菜单即可」；非受控路由直接放行。
 */
export default function MenuPermissionGuard({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { hasMenuPermission, user } = useAuth()
  const { status: menuStatus, menuTree, issue, refreshing, refresh } = useMenu()
  const location = useLocation()
  const navigate = useNavigate()

  const isTransferAsset = location.pathname === '/asset-detail' && new URLSearchParams(location.search).get('context') === 'transfer'
  const menuKey = isTransferAsset
    ? 'asset-transfer-list'
    : ROUTE_MENU_KEY_MAP[location.pathname] ?? pathToKey[location.pathname]

  const waitingForMenu = menuStatus === 'loading' && !menuTree
  const menuUnavailable = menuStatus === 'offline' || menuStatus === 'error'
    || (menuStatus === 'degraded' && !menuTree)

  // 短暂刷新失败且已有本账号导航时保持页面挂载，避免清掉未保存表单；下方权限判断不豁免。
  // 首次加载、连续失败及鉴权/业务错误仍阻断，不能回退到业务 Mock 页面。
  if ((waitingForMenu || menuUnavailable) && menuKey && isBackendConnected(menuKey)) {
    // 第一阶段繁中文案，待界面确认后补齐 i18n，不把浏览器请求失败冒充 HTTP 503。
    const descriptions = {
      network: '本機網路已中斷，請檢查網路連線。這不代表雲端服務已停止。',
      timeout: '菜單請求逾時，服務仍可能運行中。請稍後重試。',
      unreachable: '暫時無法連接菜單服務，請檢查網路連線或稍後重試。',
      server: '菜單服務回應異常，請稍後重試。',
    }
    return (
      <Result
        status={waitingForMenu ? 'info' : 'warning'}
        icon={waitingForMenu ? <Spin size="large" /> : undefined}
        title={waitingForMenu ? '正在載入菜單' : menuStatus === 'error' ? '菜單驗證失敗' : '菜單暫時無法載入'}
        subTitle={waitingForMenu ? t('common.loading')
          : menuStatus === 'error' ? '無法確認最新菜單授權，請重試或重新登入。'
            : issue ? descriptions[issue] : '菜單連線尚未恢復，請稍後重試。'}
        extra={
          <Space>
            <Button type="primary" aria-label="重新載入菜單" loading={refreshing} disabled={waitingForMenu} onClick={() => { void refresh() }}>
              {t('common.retry', '重試')}
            </Button>
            <Button onClick={() => navigate('/')}>
              {t('guard.backHome', '返回首頁')}
            </Button>
          </Space>
        }
      />
    )
  }

  // 權限阻斷：主菜单不满足时再查「任一即可」豁免表（跨业务共用的详情页，见 ROUTE_MENU_ANY_OF_MAP）
  const anyOfKeys = ROUTE_MENU_ANY_OF_MAP[location.pathname]
  const permitted = !!menuKey && (hasMenuPermission(menuKey)
    || (anyOfKeys?.some((key) => hasMenuPermission(key)) ?? false))
  if (menuKey && !permitted) {
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
