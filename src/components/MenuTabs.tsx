import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CloseOutlined, HomeOutlined } from '@ant-design/icons'
import { fetchMenuTree } from '../api/menu'
import type { MenuVO } from '../api/menu'
import { translateMenuName } from '../i18n/menuNameEn'
import { pathToKey } from './Sidebar'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
 * 从后端菜单树构建 path → { key, name } 映射 + menuKey → name 映射
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

function buildKeyNameMap(menus: MenuVO[], result: Record<string, string> = {}) {
  for (const m of menus) {
    result[m.menuKey] = m.name
    if (m.children?.length) {
      buildKeyNameMap(m.children, result)
    }
  }
  return result
}

/**
 * 子页面完整标题 —— 与页面标题（H2 / DetailPageHeader）完全一致，优先级最高
 * fixed：固定标题；add/edit：新增/編輯标题（判定与页面 isEdit 一致：editParam 参数非空且 mode≠detail，editParam 默认 'id'）
 * typeParam/typeMap/typeDefault：标题按 query 参数值切换（如審批中心按 type、贈送管理按 mode）
 * 值以 'i18n:' 前缀标识 i18n key（随语言切换），其余为页面硬编码文案原样使用
 */
interface SubPageTitle {
  fixed?: string
  add?: string
  edit?: string
  editParam?: string
  typeParam?: string
  typeDefault?: string
  typeMap?: Record<string, string>
}

const SUB_PAGE_FULL_TITLE: Record<string, SubPageTitle> = {
  // 财务管理
  '/recharge-add': { fixed: 'i18n:accountBalance.rechargePageTitle' },
  '/transfer-add': { fixed: 'i18n:accountBalance.transferTitle' },
  '/deduct-add': { fixed: 'i18n:accountBalance.deductPageTitle' },
  '/merge-add': { fixed: 'i18n:accountBalance.mergePageTitle' },
  '/batch-detail': { fixed: 'i18n:batchDetail.pageTitle' },
  '/debt-detail': { fixed: 'i18n:debtDetail.pageTitle' },
  '/approval-detail': {
    typeParam: 'type',
    typeDefault: 'recharge',
    typeMap: {
      recharge: 'i18n:approvalDetail.typeTitleRecharge',
      deduct: 'i18n:approvalDetail.typeTitleDeduct',
      transfer: 'i18n:approvalDetail.typeTitleTransfer',
      merge: 'i18n:approvalDetail.typeTitleMerge',
      gift: 'i18n:approvalDetail.typeTitleGift',
    },
  },
  // 搜索校验（动态路由 /search-verify-detail/:id）
  '/search-verify-detail': { fixed: 'i18n:searchVerifyDetail.title' },
  // 商家推广工具
  '/promotion-algorithm-add': { add: 'i18n:recommend.addAlgo', edit: 'i18n:recommend.editAlgo' },
  '/promotion-slot-config-add': { add: 'i18n:promotionSlotConfig:addSlotConfig', edit: 'i18n:promotionSlotConfig:editSlotConfig' },
  '/promotion-waterfall-add': { add: 'i18n:recommend.addPricingTitle', edit: 'i18n:recommend.editPricingTitle' },
  '/order-detail': { fixed: 'i18n:orderDetail.detailTitle' },
  // 赠送管理（?mode=gift → 贈送廣告天數；否则新增推廣贈送）
  '/gift-add': {
    typeParam: 'mode',
    typeMap: { gift: 'i18n:giftAdd.giftAdDays' },
    add: 'i18n:giftAdd.addGift',
  },
  '/gift-detail-view': { fixed: 'i18n:giftDetailView.pageTitle' },
  // AI 智能中心（页面标题硬编码）
  '/ai-model-edit': { fixed: '編輯模型' },
  '/ai-model-detail': { fixed: '模型詳情' },
  '/ai-dept-auth-edit': { add: '新增模型授權-部門', edit: '編輯模型授權-部門' },
  '/ai-dept-auth-detail': { fixed: '授權模型詳情-部門' },
  '/ai-pos-auth-edit': { add: '新增模型授權-職位', edit: '編輯模型授權-職位' },
  '/ai-pos-auth-detail': { fixed: '授權模型詳情-職位' },
  '/ai-role-auth-edit': { add: '新增模型授權-角色', edit: '編輯模型授權-角色', editParam: 'roleId' },
  '/ai-role-auth-detail': { fixed: '授權模型詳情-角色' },
  '/ai-dept-quota-edit': { add: '新增部門額度', edit: '編輯部門額度' },
  '/ai-dept-quota-detail': { fixed: '部門額度詳情' },
  '/ai-emp-quota-edit': { add: '新增模型額度-職位', edit: '編輯模型額度-職位' },
  '/ai-emp-quota-detail': { fixed: '額度詳情-職位' },
  '/ai-role-quota-edit': { add: '新增模型額度-角色', edit: '編輯模型額度-角色' },
  '/ai-role-quota-detail': { fixed: '額度詳情-角色' },
  // 审批流程（动态路由 /workflow-config/detail/:id）
  '/workflow-config/detail': { fixed: '審批流程詳情' },
  // 页面说明（页面标题含动态页面名，取静态主体）
  '/page-description-editor': { fixed: '編輯界面說明' },
  '/page-prd-view': { fixed: '界面需求說明' },
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

/** 标准化路径：去除 query string 和 hash */
function normalizePath(pathname: string): string {
  return pathname.split('?')[0].split('#')[0]
}

/** 解析标题文案：'i18n:' 前缀走 t() 翻译（随语言切换），否则为页面硬编码文案原样返回 */
function resolveTitle(raw: string, t: TFunction): string {
  return raw.startsWith('i18n:') ? t(raw.slice(5)) : raw
}

/** 匹配子页面完整标题（与页面标题一致；支持动态路由前缀与 query 参数区分新增/編輯/类型） */
function matchFullTitle(pathname: string, t: TFunction): string | null {
  const normalized = normalizePath(pathname)
  let entry = SUB_PAGE_FULL_TITLE[normalized]
  if (!entry) {
    // 动态路由前缀匹配（如 /search-verify-detail/:id、/workflow-config/detail/:id）
    for (const [prefix, e] of Object.entries(SUB_PAGE_FULL_TITLE)) {
      if (normalized.startsWith(prefix + '/')) { entry = e; break }
    }
  }
  if (!entry) return null

  const qs = pathname.split('?')[1]
  const params = qs ? new URLSearchParams(qs) : null

  // 标题按 query 参数值切换（如審批中心按 type、贈送管理按 mode）
  if (entry.typeParam && entry.typeMap) {
    const typeValue = params?.get(entry.typeParam) ?? entry.typeDefault ?? ''
    if (entry.typeMap[typeValue]) return resolveTitle(entry.typeMap[typeValue], t)
  }

  if (entry.fixed) return resolveTitle(entry.fixed, t)
  if (entry.add && entry.edit) {
    // 与页面 isEdit 判定一致：editParam（默认 id）非空且 mode≠detail 为編輯模式
    const editParam = entry.editParam ?? 'id'
    const isEdit = !!params?.get(editParam) && params.get('mode') !== 'detail'
    return resolveTitle(isEdit ? entry.edit : entry.add, t)
  }
  return null
}

/** 需要保留 query string 的路径（用于区分新增/编辑等模式，与标签标题联动） */
const TAB_PATHS_WITH_QUERY = new Set([
  '/promotion-algorithm-add',
  '/promotion-slot-config-add',
  '/promotion-waterfall-add',
  '/gift-add',
  '/approval-detail',
  '/ai-dept-auth-edit',
  '/ai-dept-auth-detail',
  '/ai-pos-auth-edit',
  '/ai-pos-auth-detail',
  '/ai-role-auth-edit',
  '/ai-role-auth-detail',
  '/ai-dept-quota-edit',
  '/ai-dept-quota-detail',
  '/ai-emp-quota-edit',
  '/ai-emp-quota-detail',
  '/ai-role-quota-edit',
  '/ai-role-quota-detail',
])

/** Tab 路径：特定路径保留 query string 以区分新增/编辑 */
function tabPath(pathname: string): string {
  const normalized = normalizePath(pathname)
  if (TAB_PATHS_WITH_QUERY.has(normalized)) {
    const qs = pathname.split('?')[1]
    return qs ? `${normalized}?${qs}` : normalized
  }
  return normalized
}

export default function MenuTabs() {
  const location = useLocation()
  const navigate = useNavigate()
  const { i18n: i18nInstance, t } = useTranslation()
  const [tabs, setTabs] = useState<MenuTab[]>([HOME_TAB])
  const [pathNameMap, setPathNameMap] = useState<Record<string, { key: string; name: string }>>({})
  const [keyNameMap, setKeyNameMap] = useState<Record<string, string>>({})
  const scrollRef = useRef<HTMLDivElement>(null)

  /** 加载后端菜单树，构建 path → name 及 menuKey → name 映射 */
  useEffect(() => {
    let cancelled = false
    fetchMenuTree().then((tree) => {
      if (!cancelled && tree.length > 0) {
        setPathNameMap(buildPathMap(tree))
        setKeyNameMap(buildKeyNameMap(tree))
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

  /** 获取路径对应的菜单名称（子页面优先用与页面标题一致的完整标题，菜单页与侧边栏一致） */
  const getMenuName = useCallback((pathname: string): string => {
    const normalized = normalizePath(pathname)

    // 1. 子页面完整标题（与页面标题完全一致，优先级最高）
    const fullTitle = matchFullTitle(pathname, t)
    if (fullTitle) return fullTitle

    // 2. 后端菜单树 path 直接匹配
    const backendEntry = pathNameMap[normalized]
    if (backendEntry) {
      return translateMenuName(backendEntry.key, backendEntry.name)
    }

    // 3. 通过 pathToKey（与侧边栏共享）找到 menuKey，再从后端 keyNameMap 获取名称
    const menuKey = pathToKey[normalized]
    if (menuKey && keyNameMap[menuKey]) {
      return translateMenuName(menuKey, keyNameMap[menuKey])
    }

    // 4. 后端菜单不可用时的降级 fallback
    return FALLBACK_PATH_NAME[normalized] || normalized.replace(/^\//, '').replace(/-/g, ' ')
  }, [pathNameMap, keyNameMap, t])

  /** 路由变化时自动添加/激活标签 */
  useEffect(() => {
    // location.pathname 不含 query string，需拼接 location.search
    const fullPath = location.pathname + location.search
    const currentTabPath = tabPath(fullPath)
    if (normalizePath(currentTabPath) === '/login') return

    setTabs((prev) => {
      const exists = prev.find(t => t.path === currentTabPath)
      if (exists) return prev
      const title = getMenuName(currentTabPath)
      return [...prev, { path: currentTabPath, title }]
    })
  }, [location.pathname, location.search, getMenuName])

  /** 语言变化时刷新所有标签名称 */
  useEffect(() => {
    setTabs((prev) => prev.map((tab) => ({
      ...tab,
      title: tab.path === '/' ? '首頁' : getMenuName(tab.path),
    })))
  }, [i18nInstance.language, getMenuName])

  /** 点击标签：导航到对应路径 */
  const handleTabClick = useCallback((path: string) => {
    const currentFullPath = location.pathname + location.search
    if (path === tabPath(currentFullPath)) return
    navigate(path)
  }, [navigate, location.pathname, location.search])

  /** 关闭标签 */
  const handleClose = useCallback((e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    setTabs((prev) => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(t => t.path === path)
      const next = prev.filter(t => t.path !== path)
      const currentFullPath = location.pathname + location.search
      if (path === tabPath(currentFullPath) && next.length > 0) {
        const targetIdx = Math.min(idx, next.length - 1)
        navigate(next[targetIdx].path)
      }
      return next
    })
  }, [navigate, location.pathname, location.search])

  /** 当前激活的路径 */
  const activePath = tabPath(location.pathname + location.search)

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
