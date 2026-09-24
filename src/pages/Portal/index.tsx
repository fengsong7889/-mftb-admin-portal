/**
 * 统一门户页（阶段 B 最小可用）。
 *
 * 目标：登录成功后展示当前用户**有权限进入**的业务系统卡片；点击卡片进入对应系统的第一个可用菜单。
 * 现阶段仍沿用旧 Sidebar（未做系统内视图收敛），后续 Round 2 才切换到"系统内 Sidebar + 顶部切换器"。
 *
 * 卡片渲染数据来源：
 * 1. 通过 `/api/portal/context` 拉取用户可访问的系统元信息（后端已按 sort 排序，无权限系统不返回）；
 * 2. `firstPath` 由前端根据菜单树 + 权限本地计算，避免依赖未上线的 `/api/systems/{code}/navigation`。
 *
 * 空态：仅提示"暂未分配系统权限"，不视为登录失败；用户仍可点击"返回工作台"进入个人工作台。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Input, Spin } from 'antd'
import { RightOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchPortalContext, type PortalSystem } from '../../api/portal'
import { useAuth } from '../../contexts/AuthContext'
import { useMenu } from '../../contexts/MenuContext'
import { useCurrentSystem } from '../../hooks/useCurrentSystem'
import { loadSystemNavigation, pickFirstEntryPath } from '../../hooks/useSystemNavigation'
import type { MenuVO } from '../../api/menu'
import { renderMenuIcon } from '../../components/MenuIcon'
import './index.css'

/** 图标兜底：与后端 `sys_system.icon` 保持一致；未匹配时展示通用图标 */
const ICON_FALLBACK = 'AppstoreOutlined'

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
      if (node.type === 2 && node.path) {
        if (isAdmin || hasMenuPermission(node.menuKey)) {
          return node.path
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
  const [keyword, setKeyword] = useState('')

  /** 从后端拉取可访问系统列表；失败时降级为空列表（前端展示"暂未分配"提示，不阻塞登录态） */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ctx = await fetchPortalContext()
      setSystems(ctx.systems ?? [])
    } catch {
      setSystems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return systems
    return systems.filter((s) => {
      const hay = `${s.name ?? ''} ${s.nameEn ?? ''} ${s.code}`.toLowerCase()
      return hay.includes(kw)
    })
  }, [systems, keyword])

  const handleEnter = (sys: PortalSystem) => {
    // Round 5：优先走服务端剪枝导航，确保与后端 strict-mode 同源；
    // 接口失败时回退到旧的客户端 menuTree 解析，不阻断入口。
    void (async () => {
      setCurrentSystemCode(sys.code)
      let path: string | null
      try {
        const navTree = await loadSystemNavigation(sys.code)
        path = pickFirstEntryPath(navTree)
      } catch {
        path = resolveFirstEntryPath(sys.code, menuTree, hasMenuPermission, !!isAdmin)
      }
      navigate(path ?? '/')
    })()
  }

  return (
    <div className="portal-page">
      <div className="portal-header">
        <div className="portal-header-left">
          <h1 className="portal-title">{t('portal.title', '企業門戶')}</h1>
          <p className="portal-subtitle">
            {t('portal.subtitle', '選擇要進入的系統，僅展示已有權限的模組')}
          </p>
        </div>
        <div className="portal-header-right">
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder={t('portal.search', '搜尋系統')}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ width: 260 }}
          />
        </div>
      </div>

      {loading ? (
        <div className="portal-loading">
          <Spin size="large" tip={t('common.loading', '加載中...')} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="portal-empty">
          <Empty
            description={
              systems.length === 0
                ? t('portal.noSystem', '暫未分配系統權限，請聯繫管理員')
                : t('portal.noMatch', '未匹配到系統')
            }
          >
            <Button type="primary" onClick={() => navigate('/')}>
              {t('portal.backToWorkbench', '返回個人工作台')}
            </Button>
          </Empty>
        </div>
      ) : (
        <div className="portal-grid">
          {filtered.map((sys) => (
            <div
              key={sys.code}
              className="portal-card"
              role="button"
              tabIndex={0}
              onClick={() => handleEnter(sys)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleEnter(sys)
                }
              }}
            >
              <div className="portal-card-icon">
                {renderMenuIcon(sys.icon ?? ICON_FALLBACK)}
              </div>
              <div className="portal-card-body">
                <div className="portal-card-title">{sys.name}</div>
                {sys.nameEn ? <div className="portal-card-title-en">{sys.nameEn}</div> : null}
                {sys.description ? (
                  <div className="portal-card-desc">{sys.description}</div>
                ) : null}
              </div>
              <div className="portal-card-action">
                <span className="portal-card-enter-text">
                  {t('portal.enter', '進入系統')}
                </span>
                <RightOutlined className="portal-card-enter-icon" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
