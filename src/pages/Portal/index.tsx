/**
 * 企业门户：通过两个 Tab 分别展示已授权与未授权系统。
 *
 * 已授权系统以 `/api/portal/context` 为准；未授权展示目录仅供前端界面确认。
 * 已授权卡片整体可点击，优先进入服务端导航的首个可用菜单；未授权卡片禁止进入。
 * 权限请求失败时展示重试，不将接口异常误判为全部未授权。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Empty, Input, Spin, Tabs } from 'antd'
import {
  AppstoreOutlined, ArrowRightOutlined,
  LockOutlined, SafetyCertificateOutlined, SearchOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPortalContext, type PortalSystem } from '../../api/portal'
import { useAuth } from '../../contexts/AuthContext'
import { useMenu } from '../../contexts/MenuContext'
import { useCurrentSystem } from '../../hooks/useCurrentSystem'
import { loadSystemNavigation, pickFirstEntryPath } from '../../hooks/useSystemNavigation'
import type { MenuVO } from '../../api/menu'
import { resolveMenuPath } from '../../constants/menuDataSource'
import { renderMenuIcon } from '../../components/MenuIcon'
import './index.css'

/** 图标兜底：与后端 `sys_system.icon` 保持一致；未匹配时展示通用图标 */
const ICON_FALLBACK = 'AppstoreOutlined'

/**
 * 前端界面确认阶段的展示目录，与 SystemPortalSchemaInitializer 的十个业务系统对齐。
 * 全量目录接口目前仅权限管理员可用，暂不在门户调用；后续接入门户专用目录接口。
 * 此目录只用于展示未授权系统，不参与授权判断，不能据此放行入口。
 * 新增文案待 i18n 解耦后重构。
 */
const PORTAL_SYSTEM_CATALOG: readonly PortalSystem[] = [
  {
    code: 'ads', name: '廣告推薦系統', nameEn: 'Ads & Recommendation',
    description: '廣告銷售、商家推廣、推廣通、團購秒殺', icon: 'AimOutlined',
  },
  {
    code: 'merchant', name: '商戶運營系統', nameEn: 'Merchant Ops',
    description: '商戶集團、門店、門店數據、地圖規劃', icon: 'ShopOutlined',
  },
  {
    code: 'search', name: '搜索運營系統', nameEn: 'Search Ops',
    description: '搜索詞庫、引導、策略、校驗、報表', icon: 'SearchOutlined',
  },
  {
    code: 'finance', name: '財務系統', nameEn: 'Finance',
    description: '賬戶餘額、批次、明細、對賬、審批中心', icon: 'AccountBookOutlined',
  },
  {
    code: 'ai', name: 'AI 管理系統', nameEn: 'AI Hub',
    description: '模型、配額、授權、MCP、審計、能耗', icon: 'RobotOutlined',
  },
  {
    code: 'hr', name: 'HR 系統', nameEn: 'Human Resources',
    description: '員工、組織、職位、員工動態', icon: 'TeamOutlined',
  },
  {
    code: 'eam', name: '物資管理系統', nameEn: 'EAM',
    description: '資產、耗材、採購、庫存、盤點', icon: 'InboxOutlined',
  },
  {
    code: 'oa', name: 'OA 系統', nameEn: 'OA',
    description: '流程中心、流程事項、審批配置、員工自助', icon: 'SolutionOutlined',
  },
  {
    code: 'iam', name: '權限中心', nameEn: 'IAM',
    description: '角色、功能授權、數據授權、菜單配置', icon: 'SafetyCertificateOutlined',
  },
  {
    code: 'platform', name: '平台配置', nameEn: 'Platform',
    description: '通知、多語言、規則、版本、翻譯工作台', icon: 'SettingOutlined',
  },
]

/** 系统内首个可用菜单的解析：从根节点向下取第一个用户有权限的叶子（type=2）路径 */
function resolveFirstEntryPath(
  systemCode: string,
  menuTree: MenuVO[] | null,
  hasMenuPermission: (key: string) => boolean,
  isAdmin: boolean,
): string | null {
  if (!menuTree) return null
  const roots = menuTree.filter((m) => m.systemCode === systemCode && m.status === 1)
  if (roots.length === 0) return null
  const visit = (nodes: MenuVO[]): string | null => {
    for (const node of nodes) {
      if (node.status !== 1) continue
      // 目录节点：递归子级
      if (node.children?.length) {
        const child = visit(node.children)
        if (child) return child
      }
      // 叶子节点：菜单类型 2，且有 view 权限（超管直接放行）
      const path = resolveMenuPath(node)
      if (node.type === 2 && path) {
        if (isAdmin || hasMenuPermission(node.menuKey)) {
          return path
        }
      }
    }
    return null
  }
  return visit(roots)
}

export default function Portal() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, hasMenuPermission } = useAuth()
  const { menuTree } = useMenu()
  const { setCurrentSystemCode } = useCurrentSystem()
  const isAdmin = user?.role === 'admin'

  const [systems, setSystems] = useState<PortalSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [keyword, setKeyword] = useState('')
  const enterRequest = useRef(0)
  useEffect(() => () => { enterRequest.current += 1 }, [])

  /** 授权结果完全使用后端响应；区分请求失败和成功返回空列表。 */
  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const ctx = await fetchPortalContext()
      setSystems(ctx.systems ?? [])
    } catch {
      setSystems([])
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const unauthorizedSystems = useMemo(() => {
    const authorizedCodes = new Set(systems.map((system) => system.code))
    return PORTAL_SYSTEM_CATALOG.filter((system) => !authorizedCodes.has(system.code))
  }, [systems])

  const handleEnter = (sys: PortalSystem) => {
    if (loading || loadError || !systems.some((system) => system.code === sys.code)) return
    // Round 5：优先走服务端剪枝导航，确保与后端 strict-mode 同源；
    // 接口失败时回退到旧的客户端 menuTree 解析，不阻断入口。
    const ticket = ++enterRequest.current
    void (async () => {
      let path: string | null
      try {
        const navTree = await loadSystemNavigation(sys.code)
        path = pickFirstEntryPath(navTree)
      } catch {
        path = resolveFirstEntryPath(sys.code, menuTree, hasMenuPermission, !!isAdmin)
      }
      if (ticket !== enterRequest.current) return
      setCurrentSystemCode(sys.code)
      navigate(path ?? '/')
    })()
  }

  const renderSystemPanel = (group: readonly PortalSystem[], hasAccess: boolean) => {
    if (loading) {
      return <div className="portal-loading"><Spin size="large" /></div>
    }
    if (loadError) {
      return (
        <div className="portal-empty">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="系統權限載入失敗，請重試">
            <Button type="primary" onClick={() => void load()}>重試</Button>
          </Empty>
        </div>
      )
    }

    const kw = keyword.trim().toLowerCase()
    const filtered = group.filter((system) =>
      `${system.name} ${system.nameEn ?? ''} ${system.code}`.toLowerCase().includes(kw),
    )
    if (filtered.length === 0) {
      return (
        <div className="portal-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={kw
              ? t('portal.noMatch', '未匹配到系統')
              : hasAccess
                ? t('portal.noSystem', '暫未分配系統權限，請聯繫管理員')
                : '暫無未授權系統'}
          >
            {hasAccess && group.length === 0 && (
              <Button type="primary" onClick={() => navigate('/')}>
                {t('portal.backToWorkbench', '返回個人工作台')}
              </Button>
            )}
          </Empty>
        </div>
      )
    }

    return (
      <div className="portal-grid">
        {filtered.map((sys) => (
          <button
            key={sys.code}
            type="button"
            className="portal-card"
            data-system={sys.code}
            disabled={!hasAccess}
            title={!hasAccess ? '請聯繫管理員開通權限' : undefined}
            onClick={() => handleEnter(sys)}
            aria-label={`${sys.name}，${hasAccess ? t('portal.enter', '進入系統') : '未獲得權限，請聯繫管理員'}`}
          >
            <span className="portal-card-top">
              <span className="portal-card-icon" aria-hidden="true">
                {renderMenuIcon(sys.icon)
                  ?? renderMenuIcon(PORTAL_SYSTEM_CATALOG.find((system) => system.code === sys.code)?.icon)
                  ?? renderMenuIcon(ICON_FALLBACK)}
              </span>
              <span className="portal-card-body">
                <span className="portal-card-title">{sys.name}</span>
                <span className="portal-card-title-en">{sys.nameEn || sys.code.toUpperCase()}</span>
              </span>
              <span className="portal-card-action" aria-hidden="true">
                {hasAccess ? <ArrowRightOutlined className="portal-card-enter-icon" /> : <LockOutlined />}
              </span>
            </span>
            {sys.description ? <span className="portal-card-desc">{sys.description}</span> : null}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="portal-page">
      <div className="portal-header">
        <div className="portal-header-left">
          <h1 className="portal-title">應用中心</h1>
          <p className="portal-subtitle">集中訪問你的工作系統，選擇卡片即可開始</p>
        </div>
        <div className="portal-search-wrap">
          <Input
            className="portal-search"
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('portal.search', '搜尋系統')}
            aria-label={t('portal.search', '搜尋系統')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
      </div>

      <Tabs
        className="portal-tabs"
        defaultActiveKey="authorized"
        items={[
          {
            key: 'authorized',
            label: (
              <span className="portal-tab-label">
                <AppstoreOutlined aria-hidden="true" />
                <span>已獲得權限</span>
                {!loading && !loadError && <span className="portal-tab-count">{systems.length}</span>}
              </span>
            ),
            children: renderSystemPanel(systems, true),
          },
          {
            key: 'unauthorized',
            label: (
              <span className="portal-tab-label">
                <LockOutlined aria-hidden="true" />
                <span>未獲得權限</span>
                {!loading && !loadError && <span className="portal-tab-count">{unauthorizedSystems.length}</span>}
              </span>
            ),
            children: renderSystemPanel(unauthorizedSystems, false),
          },
        ]}
      />
      <p className="portal-access-note">
        <SafetyCertificateOutlined aria-hidden="true" />
        <span>點擊已授權卡片即可進入系統，未授權系統請聯繫管理員開通</span>
      </p>
    </div>
  )
}
