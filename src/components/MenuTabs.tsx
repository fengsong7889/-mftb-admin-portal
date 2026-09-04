import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CloseOutlined, HomeOutlined } from '@ant-design/icons'
import { fetchMenuTree } from '../api/menu'
import type { MenuVO } from '../api/menu'
import { translateMenuName } from '../i18n/menuNameEn'
import { useTranslation } from 'react-i18next'
import './MenuTabs.css'

/** 标签页信息 */
interface MenuTab {
  path: string
  title: string
}

/** localStorage key */
const TABS_STORAGE_KEY = 'menu_tabs_history'

/** 首页固定标签 */
const HOME_TAB: MenuTab = { path: '/', title: '首頁' }

/**
 * 从后端菜单树构建 path → { key, name } 映射
 * 递归遍历所有层级菜单
 */
function buildPathMap(menus: MenuVO[], result: Record<string, { key: string; name: string }> = {}) {
  for (const m of menus) {
    if (m.path) {
      result[m.path] = { key: m.menuKey, name: m.name }
    }
    if (m.children?.length) {
      buildPathMap(m.children, result)
    }
  }
  return result
}

/** 静态 fallback：path → 名称（后端菜单不可用时降级） */
const FALLBACK_PATH_NAME: Record<string, string> = {
  '/': '首頁',
  '/account-balance': '賬戶餘額',
  '/consume-risk': '消費風控',
  '/batch-query': '批次查詢',
  '/detail-query': '明細查詢',
  '/writeoff-reconcile': '核銷對賬',
  '/debt-reconcile': '欠款對賬',
  '/approval-center': '審批中心',
  '/hint-config': '搜索引導配置',
  '/hot-search-config': '熱搜配置',
  '/search-weight-config': '搜索權重',
  '/word-segmentation': '分詞管理',
  '/synonym-config': '同義詞配置',
  '/hot-search-library': '熱搜詞庫',
  '/stop-words': '停用詞管理',
  '/hint-report': '引導報表',
  '/hot-search-report': '熱搜報表',
  '/global-config': '全局配置',
  '/channel-strategy': '頻道策略',
  '/search-verify': '搜索校驗',
  '/hint-verify': '引導校驗',
  '/hot-search-verify': '熱搜校驗',
  '/employee-management': '員工管理',
  '/organization-management': '組織管理',
  '/position-management': '職位管理',
  '/login-log': '員工動態',
  '/role-management': '角色管理',
  '/function-permission': '功能授權',
  '/data-permission': '數據授權',
  '/promotion-dashboard': '推廣概覽',
  '/promotion-algorithm': '算法庫',
  '/promotion-slot-config': '坑位策略',
  '/promotion-waterfall': '瀑布流定價',
  '/promotion-sales-config': '銷售配置',
  '/ad-sales': '廣告銷售',
  '/promotion-word-library': '詞庫管理',
  '/promotion-order-manage': '訂單管理',
  '/merchant-order-manage': '商戶訂單',
  '/order-detail': '訂單詳情',
  '/merchant-group-list': '集團管理',
  '/store-list': '門店管理',
  '/store-data-config': '門店數據配置',
  '/gift-detail': '贈送管理',
  '/gift-add': '新增贈送',
  '/gift-detail-view': '贈送明細',
  '/gift-consume-detail': '消費明細',
  '/promotion-report-overview': '報表概覽',
  '/promotion-report-order': '訂單報表',
  '/promotion-report-compare': '對比分析',
  '/group-purchase-dashboard': '團購概覽',
  '/flash-sale-register': '秒殺報名',
  '/flash-sale-stats': '秒殺統計',
  '/flash-sale-price': '秒殺定價',
  '/map-planning': '地圖規劃',
  '/menu-config': '菜單配置',
  '/translation-manage': '多語言配置',
  '/rule-config': '規則配置',
  '/workflow-config': '審批流程',
  '/ai-model-provider': '模型通道',
  '/ai-model-list': '模型列表',
  '/ai-dept-model-auth': '部門授權',
  '/ai-emp-model-auth': '員工權控',
  '/ai-pos-auth': '職位授權',
  '/ai-dept-quota': '部門額度',
  '/ai-emp-quota': '員工額度',
  '/ai-tool-registry': '工具註冊',
  '/ai-usage-stats': '使用統計',
  '/ai-energy-detail': '能耗明細',
  '/waterfall-simulation': '瀑布流沙盤',
  '/algorithm-simulation': '算法沙盤',
  '/merchant-score-insight': '商戶評分',
  '/merchant-promotion-diagnose': '推廣診斷',
}

/**
 * 二级页面（新增/编辑/详情）→ 父菜单名称 + 类型 映射
 * 格式：path → '父菜单名称-类型'
 */
const SUB_PAGE_NAME: Record<string, string> = {
  // 财务管理
  '/recharge-add': '賬戶餘額-新增',
  '/transfer-add': '賬戶餘額-新增',
  '/deduct-add': '賬戶餘額-新增',
  '/merge-add': '賬戶餘額-新增',
  '/batch-detail': '批次查詢-詳情',
  '/debt-detail': '欠款對賬-詳情',
  '/approval-detail': '審批中心-詳情',
  // 搜索校验
  '/search-verify-detail': '搜索校驗-詳情',
  // 商家推广工具
  '/promotion-algorithm-add': '算法庫-新增',
  '/promotion-slot-config-add': '坑位策略-新增',
  '/promotion-waterfall-add': '瀑布流定價-新增',
  '/order-detail': '訂單管理-詳情',
  // 赠送管理
  '/gift-add': '贈送管理-新增',
  '/gift-detail-view': '贈送管理-詳情',
  // AI 智能中心
  '/ai-model-edit': '模型列表-編輯',
  '/ai-model-detail': '模型列表-詳情',
  '/ai-dept-auth-edit': '部門授權-編輯',
  '/ai-dept-auth-detail': '部門授權-詳情',
  '/ai-pos-auth-edit': '職位授權-編輯',
  '/ai-pos-auth-detail': '職位授權-詳情',
  '/ai-role-auth-edit': '角色授權-編輯',
  '/ai-role-auth-detail': '角色授權-詳情',
  '/ai-dept-quota-edit': '部門額度-編輯',
  '/ai-dept-quota-detail': '部門額度-詳情',
  // 审批流程
  '/workflow-config/detail': '審批流程-詳情',
  // 页面说明
  '/page-description-editor': '頁面說明-編輯',
  '/page-prd-view': 'PRD文檔-詳情',
}

/** 匹配二级页面名称（支持动态路由前缀） */
function matchSubPage(path: string): string | null {
  if (SUB_PAGE_NAME[path]) return SUB_PAGE_NAME[path]
  for (const [prefix, name] of Object.entries(SUB_PAGE_NAME)) {
    if (path.startsWith(prefix + '/') || path.startsWith(prefix + '?')) {
      return name
    }
  }
  return null
}

/** 标准化路径：去除 query string 和 hash */
function normalizePath(pathname: string): string {
  return pathname.split('?')[0].split('#')[0]
}

export default function MenuTabs() {
  const location = useLocation()
  const navigate = useNavigate()
  const { i18n: i18nInstance } = useTranslation()
  const [tabs, setTabs] = useState<MenuTab[]>([HOME_TAB])
  const [pathNameMap, setPathNameMap] = useState<Record<string, { key: string; name: string }>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  /** 加载后端菜单树，构建 path → name 映射 */
  useEffect(() => {
    let cancelled = false
    fetchMenuTree().then((tree) => {
      if (!cancelled && tree.length > 0) {
        setPathNameMap(buildPathMap(tree))
      }
    }).catch(() => { /* 静默，使用 fallback */ })
    return () => { cancelled = true }
  }, [])

  /** 从 localStorage 恢复历史标签 */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TABS_STORAGE_KEY)
      if (saved) {
        const parsed: MenuTab[] = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasHome = parsed.some(t => t.path === '/')
          const restored = hasHome ? parsed : [HOME_TAB, ...parsed]
          setTabs(restored)
        }
      }
    } catch { /* 忽略解析错误 */ }
  }, [])

  /** 持久化标签到 localStorage */
  useEffect(() => {
    try {
      localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs))
    } catch { /* 忽略存储错误 */ }
  }, [tabs])

  /** 获取路径对应的菜单名称 */
  const getMenuName = useCallback((pathname: string): string => {
    const normalized = normalizePath(pathname)
    // 优先检查二级页面（新增/编辑/详情）
    const subPageName = matchSubPage(normalized)
    if (subPageName) return subPageName
    // 后端菜单树
    const backendEntry = pathNameMap[normalized]
    if (backendEntry) {
      return translateMenuName(backendEntry.key, backendEntry.name)
    }
    // 降级 fallback
    return FALLBACK_PATH_NAME[normalized] || normalized.replace(/^\//, '').replace(/-/g, ' ')
  }, [pathNameMap, i18nInstance.language])

  /** 路由变化时自动添加/激活标签 */
  useEffect(() => {
    const currentPath = normalizePath(location.pathname)
    if (currentPath === '/login') return

    setTabs((prev) => {
      const exists = prev.find(t => t.path === currentPath)
      if (exists) return prev
      const title = getMenuName(currentPath)
      return [...prev, { path: currentPath, title }]
    })
  }, [location.pathname, getMenuName])

  /** 语言变化时刷新所有标签名称 */
  useEffect(() => {
    setTabs((prev) => prev.map((tab) => ({
      ...tab,
      title: tab.path === '/' ? '首頁' : getMenuName(tab.path),
    })))
  }, [i18nInstance.language, getMenuName])

  /** 点击标签：导航到对应路径 */
  const handleTabClick = useCallback((path: string) => {
    if (path === normalizePath(location.pathname)) return
    navigate(path)
  }, [navigate, location.pathname])

  /** 关闭标签 */
  const handleClose = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    setTabs((prev) => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(t => t.path === path)
      const next = prev.filter(t => t.path !== path)
      if (path === normalizePath(location.pathname) && next.length > 0) {
        const targetIdx = Math.min(idx, next.length - 1)
        navigate(next[targetIdx].path)
      }
      return next
    })
  }, [navigate, location.pathname])

  /** 当前激活的路径 */
  const activePath = normalizePath(location.pathname)

  /** 自动滚动激活标签到可视区域 */
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const activeEl = container.querySelector('.menu-tab-item--active') as HTMLElement | null
    if (activeEl) {
      const cRect = container.getBoundingClientRect()
      const eRect = activeEl.getBoundingClientRect()
      if (eRect.right > cRect.right || eRect.left < cRect.left) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
      }
    }
  }, [activePath])

  /** 右键菜单 */
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; path: string } | null>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, path })
  }, [])

  useEffect(() => {
    if (!ctxMenu) return
    const handler = () => setCtxMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [ctxMenu])

  const handleCloseOthers = useCallback((path: string) => {
    setTabs((prev) => {
      const kept = prev.filter(t => t.path === path || t.path === '/')
      if (path !== activePath) navigate(path)
      return kept
    })
    setCtxMenu(null)
  }, [navigate, activePath])

  const handleCloseRight = useCallback((path: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex(t => t.path === path)
      const kept = prev.filter((_, i) => i <= idx || prev[i].path === '/')
      if (!kept.some(t => t.path === activePath)) {
        navigate(path)
      }
      return kept
    })
    setCtxMenu(null)
  }, [navigate, activePath])

  const handleCloseAll = useCallback(() => {
    setTabs([HOME_TAB])
    navigate('/')
    setCtxMenu(null)
  }, [navigate])

  if (tabs.length === 0) return null

  return (
    <>
      <div className="menu-tabs-bar">
        <div className="menu-tabs-scroll" ref={scrollRef}>
          {tabs.map((tab) => (
            <div
              key={tab.path}
              className={`menu-tab-item${tab.path === activePath ? ' menu-tab-item--active' : ''}`}
              onClick={() => handleTabClick(tab.path)}
              onContextMenu={(e) => handleContextMenu(e, tab.path)}
            >
              {tab.path === '/' && <HomeOutlined className="menu-tab-home-icon" />}
              <span className="menu-tab-title">{tab.title}</span>
              {tabs.length > 1 && (
                <span
                  className="menu-tab-close"
                  onClick={(e) => handleClose(e, tab.path)}
                  title="關閉"
                >
                  <CloseOutlined />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {ctxMenu && (
        <div
          className="menu-tabs-context"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="menu-tabs-context-item" onClick={() => handleCloseOthers(ctxMenu.path)}>
            關閉其它
          </div>
          <div className="menu-tabs-context-item" onClick={() => handleCloseRight(ctxMenu.path)}>
            關閉右側
          </div>
          {ctxMenu.path !== '/' && (
            <div className="menu-tabs-context-item menu-tabs-context-item--danger" onClick={handleCloseAll}>
              關閉全部
            </div>
          )}
        </div>
      )}
    </>
  )
}
