import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CloseOutlined, HomeOutlined } from '@ant-design/icons'
import type { MenuVO } from '../api/menu'
import { translateMenuName } from '../i18n/menuNameEn'
import { OFFLINE_MENU_LABELS } from '../constants/offlineMenus'
import { pathToKey } from './Sidebar'
import { isPathBackendConnected } from '../constants/menuDataSource'
import { useMenu } from '../contexts/MenuContext'
import { useAuth } from '../contexts/AuthContext'
import { ROUTE_MENU_KEY_MAP } from '../pages/Permission/types'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { HR_DICT_TYPE } from '../api/hrDict'
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
function buildPathMap(menus: MenuVO[], result: Record<string, { key: string; name: string; nameEn?: string | null }> = {}) {
  for (const m of menus) {
    if (m.path) {
      result[m.path] = { key: m.menuKey, name: m.name, nameEn: m.nameEn }
    }
    if (m.children?.length) {
      buildPathMap(m.children, result)
    }
  }
  return result
}

/** menuKey → 菜单名（含 DB name_en, 非中文语言优先取 DB） */
function buildKeyNameMap(menus: MenuVO[], result: Record<string, { name: string; nameEn?: string | null }> = {}) {
  for (const m of menus) {
    result[m.menuKey] = { name: m.name, nameEn: m.nameEn }
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
 * nameParam/nameMap：标题追加 query 参数对应名称后缀（如新增算法按 type 追加算法类型名）
 * 值以 'i18n:' 前缀标识 i18n key（随语言切换），其余为页面硬编码文案原样使用
 */
interface SubPageTitle {
  fixed?: string
  /** 详情页标题（前缀匹配到列表条目且有额外路径段时使用） */
  detailFixed?: string
  add?: string
  edit?: string
  editParam?: string
  typeParam?: string
  typeDefault?: string
  typeMap?: Record<string, string>
  /** 标题按 mode query 参数值切换（如採購訂單 ?mode=add） */
  modeParam?: string
  modeMap?: Record<string, string>
  /** 追加名称后缀的 query 参数名（默认 'type'），配合 nameMap 使用 */
  nameParam?: string
  /** query 参数值 → 追加到标题尾部的名称（如算法类型 i18n key） */
  nameMap?: Record<string, string>
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
      ai_access: 'i18n:approvalDetail.typeTitleAiAccess',
    },
  },
  // 搜索校验（动态路由 /search-verify-detail/:id）
  '/search-verify-detail': { fixed: 'i18n:searchVerifyDetail.title' },
  // 商家推广工具
  '/promotion-algorithm-add': {
    add: 'i18n:recommend.addAlgo',
    edit: 'i18n:recommend.editAlgo',
    modeParam: 'mode',
    modeMap: { detail: 'i18n:recommend.algoDetail' },
    nameMap: {
      '1': 'i18n:recommend.algoInvincibleStar',
      '2': 'i18n:recommend.algoNewStoreAd',
      '3': 'i18n:recommend.algoHotReviveAd',
      '4': 'i18n:recommend.algoExclusiveMerchant',
      '5': 'i18n:recommend.algoPopularMerchant',
      '6': 'i18n:recommend.algoGuessYouLike',
      '7': 'i18n:recommend.algoOrganicTraffic',
      '11': 'i18n:recommend.algoBrandMerchant',
      '12': 'i18n:recommend.algoGoldAd',
      '13': 'i18n:recommend.algoGoldenSignboard',
      '14': 'i18n:recommend.algoProductPromo',
      '15': 'i18n:recommend.algoTrafficAd',
    },
  },
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
  '/ai-operation-auth-edit': { add: '新增工具', edit: '編輯工具' },
  '/ai-operation-auth-log': { fixed: '調用日誌' },
  '/employee-detail': { fixed: '員工詳情' },
  '/ai-access-apply': { fixed: 'i18n:aiApply.pageTitle' },
  '/ai-mcp-service': { fixed: 'i18n:mcpService.pageTitle' },
  // 审批流程（动态路由 /workflow-config/detail/:id）
  '/workflow-config/detail': { fixed: '審批流程詳情' },
  // 版本管理
  '/version-history-detail': { fixed: 'i18n:versionHistory.detailTitle' },
  '/version-history-add': { fixed: 'i18n:versionHistory.addVersion' },
  // 对话审计（动态路由 /ai-conversation-audit/:id）
  '/ai-conversation-audit': { fixed: '對話審計', detailFixed: '對話詳情' },
  '/version-history-edit': { fixed: 'i18n:versionHistory.editVersion' },
  // 页面说明（页面标题含动态页面名，取静态主体）
  '/page-description-editor': { fixed: '編輯界面說明' },
  '/page-prd-view': { fixed: '界面需求說明' },
  // 采购执行（?mode=add/edit → 与页面 H2 标题同一 i18n key；?id=X → 詳情）
  '/purchase-order': { modeParam: 'mode', modeMap: { add: 'i18n:asset.addPoTitle', edit: 'i18n:asset.editPoTitle' }, detailFixed: 'i18n:eam.purchaseOrderDetailTitle' },
  // 資產管理（EAM）子页面 —— 与页面标题（H2 / DetailPageHeader）一致；页面标题含动态单号/员工名时取静态主体
  '/asset-claim/add': { fixed: 'i18n:asset.claimTitle' },
  '/asset-claim/detail': { fixed: '領用資產詳情' },
  '/asset-claim/record': { fixed: '领用及签收凭证详情' },
  '/asset-borrow/add': { fixed: '借用登記' },
  '/asset-borrow/detail': { fixed: '借用詳情' },
  '/asset-borrow/renew': { fixed: '續借' },
  '/asset-return/add': { fixed: '歸還登記' },
  '/asset-return/detail': { fixed: '歸還詳情' },
  '/asset-return/dispose': { fixed: '處置登記' },
  '/asset-return/recover': { fixed: '遺失找回' },
}

/**
 * 非菜单页（后端 sys_menu 无记录）的标签名兜底：详情页 / 独立配置页 / 原型页。
 * 菜单页名称一律取自后端菜单树（DB 为唯一真值），此处不再维护菜单名副本。
 */
const SUB_PAGE_NAME: Record<string, string> = {
  '/ai-operation-auth-edit': 'AI 操作授權',
  '/ai-operation-auth-log': 'AI 操作授權',
  '/ai-pos-auth': '職位授權',
  '/employee-detail': '員工詳情',
  '/gift-add': '新增贈送',
  '/gift-detail-view': '贈送明細',
  '/map-planning': '地圖規劃',
  '/oa-purchase-request': '採購申請',
  '/order-detail': '訂單詳情',
  '/promotion-order-manage': '訂單管理',
  '/store-data-config': '門店數據配置',
  '/translation-manage': '翻譯工作台',
}

/**
 * 离线菜单（仍依赖 mock）的 path → 名称：由 OFFLINE_MENUS 与 Sidebar 的 pathToKey 派生，
 * 避免第三份手写菜单名副本；后端可用时仍以后端菜单树名称为准。
 */
const OFFLINE_PATH_NAME: Record<string, string> = {}
for (const [path, menuKey] of Object.entries(pathToKey)) {
  const label = OFFLINE_MENU_LABELS[menuKey]
  if (label) {
    OFFLINE_PATH_NAME[path] = label
  }
}

/** 后端菜单树不可用时的降级名称表：离线菜单（派生） + 无菜单记录的子页面 */
const FALLBACK_PATH_NAME: Record<string, string> = {
  ...OFFLINE_PATH_NAME,
  ...SUB_PAGE_NAME,
}

/** 标准化路径：去除 query string 和 hash */
function normalizePath(pathname: string): string {
  return pathname.split('?')[0].split('#')[0]
}

/** 解析标题文案：'i18n:' 前缀走 t() 翻译（随语言切换），否则为页面硬编码文案原样返回 */
function resolveTitle(raw: string, t: TFunction): string {
  return raw.startsWith('i18n:') ? t(raw.slice(5)) : raw
}

/** 追加名称后缀（如算法类型名）：nameMap 命中 query 参数值时以「 · 名称」拼接 */
function appendName(title: string, entry: SubPageTitle, params: URLSearchParams | null, t: TFunction): string {
  if (!entry.nameMap || !params) return title
  const value = params.get(entry.nameParam ?? 'type')
  const raw = value ? entry.nameMap[value] : undefined
  return raw ? `${title} · ${resolveTitle(raw, t)}` : title
}

/** 匹配子页面完整标题（与页面标题一致；支持动态路由前缀与 query 参数区分新增/編輯/类型） */
function matchFullTitle(pathname: string, t: TFunction): string | null {
  const normalized = normalizePath(pathname)
  if (normalized === '/hr-dict-edit') {
    const params = new URLSearchParams(pathname.split('?')[1])
    const type = Object.values(HR_DICT_TYPE).find(value => value === params.get('type')) ?? HR_DICT_TYPE.EMPLOYER_COMPANY
    return t(params.get('id') ? 'hrDict.editTitle' : 'hrDict.addTitle', { type: t(`hrDict.types.${type}`) })
  }
  let entry = SUB_PAGE_FULL_TITLE[normalized]
  if (!entry) {
    // 动态路由前缀匹配（如 /search-verify-detail/:id、/workflow-config/detail/:id）
    for (const [prefix, e] of Object.entries(SUB_PAGE_FULL_TITLE)) {
      if (normalized.startsWith(prefix + '/')) {
        entry = e
        // 对话审计详情页：前缀匹配到列表条目时，若有额外路径段则使用详情标题
        if (e.detailFixed && normalized !== prefix) {
          return resolveTitle(e.detailFixed, t)
        }
        break
      }
    }
  }
  if (!entry) return null

  const qs = pathname.split('?')[1]
  const params = qs ? new URLSearchParams(qs) : null

  // 标题按 query 参数值切换（如審批中心按 type、贈送管理按 mode）
  if (entry.typeParam && entry.typeMap) {
    const typeValue = params?.get(entry.typeParam) ?? entry.typeDefault ?? ''
    if (entry.typeMap[typeValue]) return appendName(resolveTitle(entry.typeMap[typeValue], t), entry, params, t)
  }

  // 标题按 mode query 参数值切换（如採購訂單 ?mode=add/edit）
  if (entry.modeParam && entry.modeMap) {
    const modeValue = params?.get(entry.modeParam) ?? ''
    if (entry.modeMap[modeValue]) return appendName(resolveTitle(entry.modeMap[modeValue], t), entry, params, t)
    // 有 id 但无 mode → 详情页标题
    if (entry.detailFixed && params?.get('id')) return appendName(resolveTitle(entry.detailFixed, t), entry, params, t)
  }

  if (entry.fixed) return appendName(resolveTitle(entry.fixed, t), entry, params, t)
  if (entry.add && entry.edit) {
    // 与页面 isEdit 判定一致：editParam（默认 id）非空且 mode≠detail 为編輯模式
    const editParam = entry.editParam ?? 'id'
    const isEdit = !!params?.get(editParam) && params.get('mode') !== 'detail'
    return appendName(resolveTitle(isEdit ? entry.edit : entry.add, t), entry, params, t)
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
  '/ai-operation-auth-edit',
  '/hr-dict-edit',
  '/purchase-order',
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
  const { menuTree, status: menuStatus } = useMenu()
  const { hasMenuPermission } = useAuth()
  const [tabs, setTabs] = useState<MenuTab[]>([HOME_TAB])
  const scrollRef = useRef<HTMLDivElement>(null)

  /** 从共享菜单 Context 构建 path → name 及 menuKey → name 映射 */
  const pathNameMap = useMemo(() => menuTree ? buildPathMap(menuTree) : {}, [menuTree])
  const keyNameMap = useMemo(() => menuTree ? buildKeyNameMap(menuTree) : {}, [menuTree])

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

  /** 离线时过滤已接入后端的标签：保留首页 + 原型页面，移除后端菜单标签 */
  useEffect(() => {
    if (menuStatus !== 'offline') return
    setTabs((prev) => {
      const filtered = prev.filter(
        (tab) => tab.path === '/' || !isPathBackendConnected(tab.path),
      )
      return filtered.length === prev.length ? prev : filtered
    })
  }, [menuStatus])

  /** 获取路径对应的菜单名称（子页面优先用与页面标题一致的完整标题，菜单页与侧边栏一致） */
  const getMenuName = useCallback((pathname: string): string => {
    const normalized = normalizePath(pathname)

    // 1. 子页面完整标题（与页面标题完全一致，优先级最高）
    const fullTitle = matchFullTitle(pathname, t)
    if (fullTitle) return fullTitle

    // 2. 后端菜单树 path 直接匹配
    const backendEntry = pathNameMap[normalized]
    if (backendEntry) {
      return translateMenuName(backendEntry.key, backendEntry.name, backendEntry.nameEn)
    }

    // 3. 通过 pathToKey（与侧边栏共享）找到 menuKey，再从后端 keyNameMap 获取名称
    const menuKey = pathToKey[normalized]
    if (menuKey && keyNameMap[menuKey]) {
      return translateMenuName(menuKey, keyNameMap[menuKey].name, keyNameMap[menuKey].nameEn)
    }

    // 4. 后端菜单不可用时的降级 fallback
    return FALLBACK_PATH_NAME[normalized] || normalized.replace(/^\//, '').replace(/-/g, ' ')
  }, [pathNameMap, keyNameMap, t])

  /** 判断路由是否为「受控但当前用户无权限」（与 MenuPermissionGuard 同口径） */
  const isDeniedRoute = useCallback((pathname: string, search: string): boolean => {
    const isTransferAsset = pathname === '/asset-detail' && new URLSearchParams(search).get('context') === 'transfer'
    const menuKey = isTransferAsset ? 'asset-transfer-list' : (ROUTE_MENU_KEY_MAP[pathname] ?? pathToKey[pathname])
    return !!menuKey && !hasMenuPermission(menuKey)
  }, [hasMenuPermission])

  /** 路由变化时自动添加/激活标签 */
  useEffect(() => {
    // 无权限的受控路由不创建标签：避免泄漏无权限菜单名称、且点击标签只会反复 403
    if (isDeniedRoute(location.pathname, location.search)) return
    // location.pathname 不含 query string，需拼接 location.search
    const fullPath = location.pathname + location.search
    const currentTabPath = tabPath(fullPath)
    if (normalizePath(currentTabPath) === '/login') return

    const state: unknown = location.state
    const closingPath = state && typeof state === 'object' && 'closeMenuTab' in state && typeof state.closeMenuTab === 'string'
      ? tabPath(state.closeMenuTab) : null
    setTabs((previous) => {
      const prev = closingPath && closingPath !== '/' && closingPath !== currentTabPath
        ? previous.filter(tab => tab.path !== closingPath) : previous
      const exists = prev.find(t => t.path === currentTabPath)
      if (exists) return prev
      // 若當前路徑的基礎路徑已存在標籤（含 query），更新該標籤路徑與標題
      const normalizedBase = normalizePath(currentTabPath)
      if (normalizedBase !== currentTabPath) {
        const baseIdx = prev.findIndex(t => t.path === normalizedBase)
        if (baseIdx >= 0) {
          const title = getMenuName(currentTabPath)
          const updated = [...prev]
          updated[baseIdx] = { path: currentTabPath, title }
          return updated
        }
      }
      const title = getMenuName(currentTabPath)
      return [...prev, { path: currentTabPath, title }]
    })
    if (closingPath && state && typeof state === 'object') {
      // 消费一次性关闭指令，避免浏览器后退到列表时再次关闭后来新开的标签。
      const remainingState = { ...state }
      delete (remainingState as { closeMenuTab?: unknown }).closeMenuTab
      navigate(fullPath, { replace: true, state: remainingState })
    }
  }, [location.pathname, location.search, location.state, navigate, getMenuName, isDeniedRoute])

  /** 清理当前用户无权限的标签（含从 localStorage 恢复的越权历史标签），避免菜单名泄漏与反复 403 */
  useEffect(() => {
    setTabs((prev) => {
      const kept = prev.filter((tab) =>
        tab.path === '/' || !isDeniedRoute(normalizePath(tab.path), tab.path.split('?')[1] ?? ''),
      )
      return kept.length === prev.length ? prev : kept
    })
  }, [isDeniedRoute])

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
