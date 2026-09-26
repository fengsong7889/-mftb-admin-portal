/**
 * 系统切换器（Round 2 · 分系统视图）。
 *
 * 位置：HeaderBar 左上角，跟随 Sidebar 折叠按钮右侧。
 * 数据源：`fetchPortalContext` 缓存的用户可进入系统列表；
 * 交互：
 *   1) 展示当前系统中文名 + 图标（未选中时展示"企業門戶"占位）；
 *   2) 点击展开下拉，可选择其他有权限的系统或返回门户；
 *   3) 选中系统时：写 currentSystemCode → 进入该系统首页；选择当前系统也可返回首页。
 *
 * 空态：无 portal 系统权限（用户 `accessibleSystems` 为空）时仅显示"返回門戶"按钮，不显示切换。
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Dropdown, Button, Space, Tooltip } from 'antd'
import type { MenuProps } from 'antd'
import { AppstoreOutlined, SwapOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPortalContext, type PortalSystem } from '../api/portal'
import { useCurrentSystem } from '../hooks/useCurrentSystem'
import { renderMenuIcon } from './MenuIcon'
import { getPortalSystemKey, PORTAL_SYSTEM_ICONS } from '../constants/portalSystems'
import './SystemSwitcher.css'

/** 图标以门户接口配置为准；未登记或缺失时回退该系统默认图标，保证列表每项都有图标。 */
function resolveSystemIcon(system: PortalSystem): ReactNode {
  const key = getPortalSystemKey(system.code, system.name)
  return renderMenuIcon(system.icon)
    ?? renderMenuIcon(key ? PORTAL_SYSTEM_ICONS[key] : 'AppstoreOutlined')
    ?? <AppstoreOutlined />
}

export default function SystemSwitcher() {
  const { t } = useTranslation()
  const { currentSystemCode, setCurrentSystemCode } = useCurrentSystem()
  const navigate = useNavigate()
  const [systems, setSystems] = useState<PortalSystem[]>([])

  /** 加载可访问系统列表；无权限用户 systems=[]，仅显示"返回門戶"按钮。 */
  useEffect(() => {
    let cancelled = false
    fetchPortalContext()
      .then((ctx) => {
        if (!cancelled) setSystems(ctx.systems ?? [])
      })
      .catch(() => {
        if (!cancelled) setSystems([])
      })
    return () => { cancelled = true }
  }, [])

  const currentSystem = useMemo(
    () => systems.find((s) => s.code === currentSystemCode) ?? null,
    [systems, currentSystemCode],
  )

  const menuItems: MenuProps['items'] = useMemo(() => {
    const items: MenuProps['items'] = []
    if (systems.length > 0) {
      items.push({
        key: '__header_systems',
        label: <span className="system-switcher-group">{t('portal.businessSystems')}</span>,
        type: 'group',
        children: systems.map((s) => ({
          key: s.code,
          icon: resolveSystemIcon(s),
          label: (
            <div className="system-switcher-item">
              <span className="system-switcher-item-name">{t(`portal.systems.${getPortalSystemKey(s.code, s.name) ?? s.code}.name`, { defaultValue: s.name })}</span>
            </div>
          ),
        })),
      })
    }
    items.push({ type: 'divider' as const })
    items.push({
      key: '__portal',
      icon: <AppstoreOutlined />,
      label: t('portal.backToPortal'),
    })
    return items
  }, [systems, t])

  const handleClick: MenuProps['onClick'] = ({ key }) => {
    if (key === '__portal') {
      setCurrentSystemCode(null)
      navigate('/portal')
      return
    }
    if (!systems.some((system) => system.code === key)) return
    setCurrentSystemCode(key)
    navigate('/')
  }

  const triggerLabel = currentSystem
    ? t(`portal.systems.${getPortalSystemKey(currentSystem.code, currentSystem.name) ?? currentSystem.code}.name`, { defaultValue: currentSystem.name })
    : t('portal.selectSystem')

  return (
    <Dropdown
      menu={{
        items: menuItems,
        onClick: handleClick,
        selectable: true,
        selectedKeys: currentSystemCode ? [currentSystemCode] : [],
      }}
      trigger={['click']}
      placement="bottomLeft"
      overlayClassName="system-switcher-dropdown"
    >
      <Tooltip title={t('portal.switchSystemTip')} placement="bottom">
        <Button type="text" className="system-switcher-trigger" icon={<SwapOutlined />}>
          <Space size={6}>
            <span className="system-switcher-trigger-label">{triggerLabel}</span>
          </Space>
        </Button>
      </Tooltip>
    </Dropdown>
  )
}
