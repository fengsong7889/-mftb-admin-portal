import { useState, useEffect, useRef, useMemo } from 'react'
import { Input, Tag, Empty, Dropdown, Modal, message, Drawer, Progress, Spin } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { fetchMenuTree } from '../../api/menu'
import type { MenuVO } from '../../api/menu'
import { fetchQuickFavorites, saveQuickFavorites } from '../../api/auth'
import { pinyin } from 'pinyin-pro'
import { translateMenuName } from '../../i18n/menuNameEn'
import PikachuFace from '../../components/PikachuFace'
import { sendAgentMessage, fetchEngineStatus, probeEngineStatus, getEngineMode, setEngineMode } from '../../api/agent'
import type { ChatMessage, LlmEngineStatus, LlmEngineMode } from '../../api/agent'
import { fetchMyQuotaUsage, fetchMyModels, currencySymbol, formatNumber, formatCost } from '../../api/aiMyCenter'
import type { MyQuotaUsage, MyModel, QuotaDimension, QuotaSource } from '../../api/aiMyCenter'
import aiLogo from '../../assets/ai-logo.png'
import {
  SearchOutlined,
  PlusOutlined,
  DeleteOutlined,
  AccountBookOutlined,
  FileSearchOutlined,
  SwapOutlined,
  AuditOutlined,
  WalletOutlined,
  DatabaseOutlined,
  FireOutlined,
  CheckCircleOutlined,
  FontSizeOutlined,
  LineChartOutlined,
  ShoppingOutlined,
  SendOutlined,
  UserOutlined,
  ThunderboltOutlined,
  DownOutlined,
  LockOutlined,
} from '@ant-design/icons'
import './index.css'

/** AI 標誌圖標（幾何拼色 Ai Logo） */
const AiLogo = ({ size = 40 }: { size?: number }) => (
  <img src={aiLogo} alt="AI" width={size} height={size} className="home-ai-logo" />
)

/** 菜单分组英文名（英文模式查映射） */
const GROUP_NAME_EN: Record<string, string> = {
  '推廣金管理': 'Promotion Funds',
  '商戶通對賬': 'Merchant Reconciliation',
  '審批管理': 'Approval Management',
  '搜索配置': 'Search Config',
  '搜索引导': 'Search Guide',
  '搜索词库': 'Search Library',
  '報表統計': 'Reports',
  '商家推广工具': 'Merchant Promotion Tools',
  '推广通': 'Promotion Pass',
}

/** 所有可用菜单 */
const allMenus = [
  { key: 'account-balance', label: '賬戶餘額', icon: <AccountBookOutlined />, path: '/account-balance', group: '推廣金管理' },
  { key: 'batch-query', label: '批次查詢', icon: <SearchOutlined />, path: '/batch-query', group: '推廣金管理' },
  { key: 'detail-query', label: '明細查詢', icon: <FileSearchOutlined />, path: '/detail-query', group: '推廣金管理' },
  { key: 'writeoff-reconcile', label: '充消對賬', icon: <AuditOutlined />, path: '/writeoff-reconcile', group: '商戶通對賬' },
  { key: 'debt-reconcile', label: '欠款對賬', icon: <CheckCircleOutlined />, path: '/debt-reconcile', group: '商戶通對賬' },
  { key: 'approval-center', label: '審批中心', icon: <AuditOutlined />, path: '/approval-center', group: '審批管理' },
  { key: 'search-config', label: '搜索配置', icon: <SearchOutlined />, path: '/search-config', group: '搜索配置' },
  { key: 'hint-config', label: '底紋配置', icon: <FontSizeOutlined />, path: '/hint-config', group: '搜索引导' },
  { key: 'hot-search-config', label: '熱搜配置', icon: <FireOutlined />, path: '/hot-search-config', group: '搜索引导' },
  { key: 'word-segmentation', label: '分詞管理', icon: <DatabaseOutlined />, path: '/word-segmentation', group: '搜索词库' },
  { key: 'synonym-config', label: '同義詞配置', icon: <SwapOutlined />, path: '/synonym-config', group: '搜索词库' },
  { key: 'hot-search-library', label: '熱搜詞庫', icon: <FireOutlined />, path: '/hot-search-library', group: '搜索词库' },
  { key: 'hint-report', label: '底紋報表', icon: <LineChartOutlined />, path: '/hint-report', group: '報表統計' },
  { key: 'hot-search-report', label: '熱搜報表', icon: <LineChartOutlined />, path: '/hot-search-report', group: '報表統計' },
  { key: 'promotion-dashboard', label: '數據看板', icon: <LineChartOutlined />, path: '/promotion-dashboard', group: '商家推广工具' },
  { key: 'promotion-algorithm', label: '算法庫', icon: <DatabaseOutlined />, path: '/promotion-algorithm', group: '商家推广工具' },
  { key: 'promotion-slot-config', label: '瀑布流策略', icon: <SwapOutlined />, path: '/promotion-slot-config', group: '商家推广工具' },
  { key: 'promotion-waterfall', label: '銷售定價', icon: <WalletOutlined />, path: '/promotion-waterfall', group: '商家推广工具' },
  { key: 'merchant-order-manage', label: '訂單管理', icon: <FileSearchOutlined />, path: '/merchant-order-manage', group: '商家推广工具' },
  { key: 'promotion-sales-config', label: '店鋪推廣', icon: <ShoppingOutlined />, path: '/promotion-sales-config', group: '推广通' },
  { key: 'promotion-order-manage', label: '訂單管理', icon: <FileSearchOutlined />, path: '/promotion-order-manage', group: '推广通' },
  { key: 'promotion-report-overview', label: '數據概覽', icon: <LineChartOutlined />, path: '/promotion-report-overview', group: '推广通' },
  { key: 'promotion-report-order', label: '訂單效果報表', icon: <LineChartOutlined />, path: '/promotion-report-order', group: '推广通' },
  { key: 'promotion-report-compare', label: '推薦類型對比', icon: <LineChartOutlined />, path: '/promotion-report-compare', group: '推广通' },
]

/** 默认常用菜单 */
const defaultFavorites = [
  'account-balance',
  'batch-query',
  'detail-query',
  'approval-center',
]

/** localStorage key（按用戶隔離） */
const FAV_KEY = (username: string) => `home_favorites:${username}`

/** 从 localStorage 读取已保存的快捷入口 */
const loadFavorites = (username: string): string[] => {
  try {
    const raw = localStorage.getItem(FAV_KEY(username))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* 数据损坏则回退默认 */ }
  return defaultFavorites
}

/** 快捷提问 */
const quickQuestions = [
  { icon: <SearchOutlined />, text: '查詢推廣金充值批次' },
  { icon: <AuditOutlined />, text: '最近有什麼待審批的單子？' },
  { icon: <ThunderboltOutlined />, text: '今天充值了多少推廣金？' },
  { icon: <LineChartOutlined />, text: '查詢推廣金消費最多集團' },
]

/** 中文姓名转英文拼音格式：名在前、姓在后，首字母大写 */
const chineseNameToPinyinEnglish = (name: string): string => {
  if (!name) return ''
  if (!/[\u4e00-\u9fa5]/.test(name)) return name
  const py = pinyin(name, { toneType: 'none', type: 'array' })
  if (py.length <= 1) return name
  const surname = py[0]
  const givenName = py.slice(1).join('')
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return `${capitalize(givenName)} ${capitalize(surname)}`
}

/** 时段问候 */
const getGreeting = (hour: number, t: (key: string) => string) => {
  if (hour >= 5 && hour < 11) return t('home.greetingMorning')
  if (hour >= 11 && hour < 13) return t('home.greetingNoon')
  if (hour >= 13 && hour < 18) return t('home.greetingAfternoon')
  return t('home.greetingEvening')
}

/** 引擎模型 ID → 展示縮寫（膠囊位窄，只顯示供應商縮寫，完整名在下拉菜單） */
const ENGINE_LABELS: Record<string, string> = {
  'qwen3.7-flash': 'QW',
  'deepseek-chat': 'DS',
  'deepseek-v4-flash': 'DS',
  'deepseek-v4-pro': 'DS Pro',
}

/** 額度維度來源 → Tag 顏色（員工/部門/職位/角色四維度視覺區分） */
const DIM_SOURCE_COLOR: Record<QuotaSource, string> = {
  employee: '#722ED1',
  department: '#1890FF',
  position: '#E8720C',
  role: '#13C2C2',
}

/** 額度維度來源 → i18n key */
const DIM_SOURCE_LABEL_KEY: Record<QuotaSource, string> = {
  employee: 'home.usageDimSourceEmployee',
  department: 'home.usageDimSourceDepartment',
  position: 'home.usageDimSourcePosition',
  role: 'home.usageDimSourceRole',
}

/** AI 助手未開通原因：無模型權限 / 無額度 / 兩者皆無 */
type AiBlockReason = 'no-models' | 'no-quota' | 'no-both'

/** 未開通原因 → Hero 引導卡標題 i18n key（標題直接突出缺失項） */
const BLOCKED_TITLE_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.aiBlockedNoModelsTitle',
  'no-quota': 'home.aiBlockedNoQuotaTitle',
  'no-both': 'home.aiBlockedNoBothTitle',
}

/** 未開通原因 → Hero 引導卡描述 i18n key */
const BLOCKED_DESC_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.aiBlockedNoModelsDesc',
  'no-quota': 'home.aiBlockedNoQuotaDesc',
  'no-both': 'home.aiBlockedNoBothDesc',
}

/** 未開通原因 → 對話中警示橫幅 i18n key */
const BLOCKED_BANNER_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.aiBlockedBannerNoModels',
  'no-quota': 'home.aiBlockedBannerNoQuota',
  'no-both': 'home.aiBlockedBannerNoBoth',
}

/** 未開通原因 → 模型選擇下拉面板標題/描述 i18n key */
const ENGINE_PANEL_TITLE_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.enginePanelNoModelsTitle',
  'no-quota': 'home.enginePanelNoQuotaTitle',
  'no-both': 'home.enginePanelNoBothTitle',
}
const ENGINE_PANEL_DESC_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.enginePanelNoModelsDesc',
  'no-quota': 'home.enginePanelNoQuotaDesc',
  'no-both': 'home.enginePanelNoBothDesc',
}

/** 性能優先本地標記：後端網關支持後正式生效，當前請求仍按省錢優先路由，僅膠囊展示 */
const PERF_MODE_KEY = 'llm_engine_perf'
const getPerfMode = () => localStorage.getItem(PERF_MODE_KEY) === 'performance'

/** 將 AI 回覆中的字面 \n 轉為真正換行（CSS white-space: pre-wrap 負責渲染） */
const formatAiText = (text: string) => text.replace(/\\n/g, '\n')

/** 递归收集菜单 key → 名称映射 */
const collectMenuNames = (menus: MenuVO[], map: Record<string, string>) => {
  menus.forEach((m) => {
    map[m.menuKey] = m.name
    if (m.children?.length) collectMenuNames(m.children, map)
  })
}

export default function Home() {
  const navigate = useNavigate()
  const { t, i18n: i18nInstance } = useTranslation()
  const { user } = useAuth()
  const [searchText, setSearchText] = useState('')
  const [favorites, setFavorites] = useState<string[]>(defaultFavorites)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [menuNameMap, setMenuNameMap] = useState<Record<string, string>>({})
  const [quoteIndex, setQuoteIndex] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  /* ── 对话状态 ── */
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  /* ── 當前引擎（模型通道 / 使用權限）── */
  const [engine, setEngine] = useState<LlmEngineStatus | null>(null)

  /* ── 性能優先（本地標記）與我的用量 ── */
  const [perfMode, setPerfMode] = useState(getPerfMode)
  const [usageOpen, setUsageOpen] = useState(false)
  const [usageLoading, setUsageLoading] = useState(false)
  const [myUsage, setMyUsage] = useState<MyQuotaUsage | null>(null)

  /* ── 我的授權模型與網關已接入模型（modelKey → 引擎模式） ── */
  const [myModels, setMyModels] = useState<MyModel[]>([])
  const [connectedModels, setConnectedModels] = useState<Record<string, LlmEngineMode>>({})

  /* ── 開通狀態判定依據（接口成功返回才置 true，網絡故障不誤判為未開通） ── */
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [usageLoaded, setUsageLoaded] = useState(false)

  /** 打開「我的用量」抽屜（每次打開重新拉取，與能耗統計同源） */
  const handleOpenUsage = () => {
    setUsageOpen(true)
    setUsageLoading(true)
    fetchMyQuotaUsage()
      .then((data) => { setMyUsage(data); setUsageLoaded(true) })
      .catch(() => { /* 靜默失敗：保留上次數據，不影響開通態判定 */ })
      .finally(() => setUsageLoading(false))
  }

  /**
   * 被限制的通道：取代理側 /api/llm/status 回傳的 denied（primary/off-peak）
   * 代理已用登錄 JWT 回源後端換取賬號並讀白名單計算，前端不再自行判定權限，
   * 只消費服務端結論做彈窗告知；真正的攔截發生在代理側（改本地數據也繞不過）
   */
  const deniedChannels = useMemo(() => engine?.denied ?? [], [engine])

  /**
   * 未開通判定（僅在接口成功返回後下結論，網絡故障不誤傷正常用戶）：
   * - 無授權模型 = 無模型權限（模型權限是使用前提）
   * - 無任何額度配置 = 無可用額度，同樣不可用
   * - 兩者皆缺 = no-both，提示同時說明權限與額度
   * 三種原因分開提示，引導用戶聯繫管理員開通對應權限
   */
  const noModels = modelsLoaded && myModels.length === 0
  const noQuota = usageLoaded && (myUsage?.dimensions.length ?? 0) === 0
  const blockReason: AiBlockReason | null =
    noModels && noQuota ? 'no-both' : noModels ? 'no-models' : noQuota ? 'no-quota' : null
  const aiBlocked = blockReason !== null

  /** 定時刷新引擎路由結果（手動切換 / 代理重啟後同步到膠囊） */
  useEffect(() => {
    let cancelled = false
    const load = () => fetchEngineStatus().then((s) => { if (!cancelled) setEngine(s) })
    load()
    const timer = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  /** 加載我的授權模型；並分別探測兩條通道得到網關真實接入的模型清單 */
  useEffect(() => {
    let cancelled = false
    fetchMyModels()
      .then((list) => { if (!cancelled) { setMyModels(list); setModelsLoaded(true) } })
      .catch(() => { /* 靜默失敗：下拉回退空態提示，不參與開通態判定 */ })
    Promise.all([probeEngineStatus('primary'), probeEngineStatus('off-peak')]).then(([primary, offPeak]) => {
      if (cancelled) return
      const map: Record<string, LlmEngineMode> = {}
      if (primary?.model) map[primary.model] = 'primary'
      if (offPeak?.model) map[offPeak.model] = 'off-peak'
      setConnectedModels(map)
    })
    return () => { cancelled = true }
  }, [])

  /** 从后端加载当前用户的快捷入口（后端不可用时回退 localStorage） */
  useEffect(() => {
    let cancelled = false
    fetchQuickFavorites().then((keys) => {
      if (!cancelled && keys.length > 0) setFavorites(keys)
    }).catch(() => {
      // 后端不可用，回退 localStorage
      if (!cancelled && user?.username) {
        const cached = loadFavorites(user.username)
        if (cached !== defaultFavorites) setFavorites(cached)
      }
    })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** 加载后端菜单名称 */
  useEffect(() => {
    let cancelled = false
    fetchMenuTree().then((tree) => {
      if (!cancelled) {
        const map: Record<string, string> = {}
        collectMenuNames(tree, map)
        setMenuNameMap(map)
      }
    })
    return () => { cancelled = true }
  }, [])

  /** 初始加載我的用量數據（用於首頁按鈕顯示剩餘百分比與開通態判定） */
  useEffect(() => {
    let cancelled = false
    fetchMyQuotaUsage().then((data) => {
      if (!cancelled) { setMyUsage(data); setUsageLoaded(true) }
    }).catch(() => { /* 靜默失敗，不影響首頁加載，不參與開通態判定 */ })
    return () => { cancelled = true }
  }, [])

  const menuList = useMemo(() => (
    allMenus.map((m) => {
      const backendName = menuNameMap[m.key]
      return backendName ? { ...m, label: backendName } : m
    })
  ), [menuNameMap])

  /** 时钟 */
  useEffect(() => {
    timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  /** 勵志語錄（每 10 秒輪播） */
  const motivationalQuotes = [
    t('home.quotes.0'), t('home.quotes.1'), t('home.quotes.2'),
    t('home.quotes.3'), t('home.quotes.4'), t('home.quotes.5'),
  ]

  /** 引擎模式 → 展示文案（手動模式顯示真實模型名） */
  const engineModeLabel = (mode: LlmEngineMode): string => {
    if (mode === 'auto') return t(perfMode ? 'home.enginePerfPriority' : 'home.engineCostSaving')
    return modelDisplayName(modeModelKey(mode)) ?? mode
  }

  /** 模型展示名：優先授權模型清單，其次縮寫映射，最後原始標識 */
  const modelDisplayName = (modelKey: string | null | undefined): string | null => {
    if (!modelKey) return null
    return myModels.find((m) => m.modelKey === modelKey)?.modelName ?? ENGINE_LABELS[modelKey] ?? modelKey
  }

  /** 引擎模式 → 網關已接入的模型標識（探測結果反查） */
  const modeModelKey = (mode: LlmEngineMode): string | null =>
    Object.entries(connectedModels).find(([, mapped]) => mapped === mode)?.[0] ?? null

  /** 快捷提问 */
  const quickQuestions = [
    { icon: <SearchOutlined />, text: t('home.quickQ0') },
    { icon: <AuditOutlined />, text: t('home.quickQ1') },
    { icon: <ThunderboltOutlined />, text: t('home.quickQ2') },
    { icon: <LineChartOutlined />, text: t('home.quickQ3') },
  ]

  /** 勵志語錄每 10 秒輪播 */
  useEffect(() => {
    const qTimer = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % motivationalQuotes.length)
    }, 10000)
    return () => clearInterval(qTimer)
  }, [motivationalQuotes.length])

  /** 消息自动滚动 */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const translateGroup = (zh: string) => (
    i18nInstance.language?.startsWith('en') ? (GROUP_NAME_EN[zh] ?? zh) : zh
  )

  /** 日期时间本地化 */
  const dateLocale = i18nInstance.language?.startsWith('en') ? 'en-MO' : 'zh-Hant-MO'

  const filteredMenus = searchText
    ? menuList.filter((m) => {
        const label = translateMenuName(m.key, m.label)
        const group = translateGroup(m.group)
        return label.includes(searchText) || group.includes(searchText)
      })
    : []

  const addFavorite = (key: string) => {
    if (!favorites.includes(key)) setFavorites([...favorites, key])
    setShowAddMenu(false)
    setSearchText('')
  }

  const removeFavorite = (key: string) => {
    setFavorites(favorites.filter((k) => k !== key))
  }

  /** 持久化快捷入口：优先存后端，同时写 localStorage 作为离线缓存 */
  useEffect(() => {
    if (user?.username) {
      localStorage.setItem(FAV_KEY(user.username), JSON.stringify(favorites))
      saveQuickFavorites(favorites).catch(() => { /* 后端不可用时仅保留 localStorage */ })
    }
  }, [favorites, user?.username])

  const getMenuInfo = (key: string) => menuList.find((m) => m.key === key)

  /** 发送消息 */
  const handleSend = async (preset?: string) => {
    const text = (preset ?? inputText).trim()
    if (!text || sending) return
    // 未開通兜底：輸入區已禁用，這裡防快捷提問等入口繞過
    if (aiBlocked) {
      message.warning(t('home.aiBlockedSendMsg'))
      return
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date(),
    }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInputText('')
    setSending(true)

    try {
      const reply = await sendAgentMessage(newMessages)
      setMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }])
    } catch {
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('home.aiServiceError'),
        timestamp: new Date(),
      }])
    } finally {
      setSending(false)
    }
  }

  const dateStr = currentTime.toLocaleDateString(dateLocale, {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
  const timeStr = currentTime.toLocaleTimeString(dateLocale, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

  const isEmpty = messages.length === 0

  /** 賬號所選頭像：支持 pikachu / DiceBear URL / base64 三種 */
  const avatarKey = user?.avatar ?? ''
  const isPikachuAvatar = !avatarKey || avatarKey.startsWith('pikachu-')
  const avatarExpression = isPikachuAvatar ? (avatarKey.replace('pikachu-', '') || 'default') : ''
  const isCustomOrPresetAvatar = avatarKey.startsWith('https://') || avatarKey.startsWith('data:')

  /** 頭部按鈕剩餘百分比提示：取日维度中最緊的一個，無日维度時回退月维度 */
  const chipRemainingPercent = useMemo(() => {
    if (!myUsage || myUsage.dimensions.length === 0) return null
    const remainingOf = (dim: QuotaDimension): number | null => {
      const quota = Number(dim.quotaValue) || 0
      if (quota <= 0) return null
      return Math.max(0, 100 - Math.round((Number(dim.usedValue) / quota) * 100))
    }
    const pick = (period: 'daily' | 'monthly') => myUsage!.dimensions
      .filter((d) => d.period === period)
      .map(remainingOf)
      .filter((v): v is number => v !== null)
    const daily = pick('daily')
    const pool = daily.length > 0 ? daily : pick('monthly')
    return pool.length > 0 ? Math.min(...pool) : null
  }, [myUsage])

  /** 當前引擎：模型展示名 + 策略（綠色=省錢優先，橙色=性能優先，藍色=手動固定）；
   *  未開通時直接說明缺什麼（無可用模型 / 無可用額度），不用「未開通」模糊詞 */
  const engineName = engine?.model ? (modelDisplayName(engine.model) ?? engine.model) : null
  const engineMode = engine?.mode ?? getEngineMode()
  const engineChipText = blockReason
    ? t(blockReason === 'no-quota' ? 'home.engineChipNoQuota' : 'home.engineChipNoModels')
    : engine
      ? `${engineName}·${engineMode === 'auto' ? t(perfMode ? 'home.enginePerfPriority' : 'home.engineCostSaving') : t('home.engineManualFixed')}`
      : t('home.aiEngineNotDetected')

  /** 高亮項：智能路由下區分省錢/性能優先（兩者請求層面都是 auto） */
  const selectedEngineKey = engineMode === 'auto' && perfMode ? 'performance' : engineMode

  /** 引擎模式下拉：智能路由 + 指定模型兩組；指定模型來自後端真實授權清單，已接入網關者方可選用 */
  const engineMenuItems: MenuProps['items'] = [
    {
      type: 'group',
      label: t('home.engineSmartRouting'),
      children: [
        {
          key: 'auto',
          label: (
            <div className="home-ai-engine-opt">
              <strong>{t('home.engineCostSaving')}</strong>
              <span>{t('home.engineCostSavingDesc')}</span>
            </div>
          ),
        },
        {
          key: 'performance',
          label: (
            <div className="home-ai-engine-opt">
              <strong>{t('home.enginePerfPriority')}</strong>
              <span>{t('home.enginePerfPriorityDesc')}</span>
            </div>
          ),
        },
      ],
    },
    {
      type: 'group',
      label: t('home.engineSpecifiedModel'),
      children: myModels.length === 0
        ? [{
            key: 'no-models',
            disabled: true,
            label: (
              <div className="home-ai-engine-opt" style={{ opacity: 0.55 }}>
                <span>{t('home.engineNoModels')}</span>
              </div>
            ),
          }]
        : myModels.map((model) => {
            const mode = connectedModels[model.modelKey]
            if (!mode) {
              return {
                key: `pending:${model.modelKey}`,
                label: (
                  <div className="home-ai-engine-opt" style={{ opacity: 0.55 }}>
                    <strong>{model.modelName}</strong>
                    <span>{model.providerName ? `${model.providerName} · ` : ''}{t('home.enginePendingNote')}</span>
                  </div>
                ),
              }
            }
            return {
              key: mode,
              label: (
                <div className="home-ai-engine-opt">
                  <strong>{model.modelName}</strong>
                  <span>{model.providerName ? `${model.providerName} · ` : ''}{model.modelKey}</span>
                </div>
              ),
            }
          }),
    },
  ]

  /** 無權限提示：沿用全局確認彈窗規範，只保留「我知道了」按鈕 */
  const showModelDeniedModal = (model: string) => {
    Modal.warning({
      title: t('home.engineModelDeniedTitle'),
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 480,
      content: t('home.engineModelDeniedContent', { model, username: user?.username ?? '--' }),
      okText: '我知道了',
    })
  }

  /** 省錢優先受限告知：自動調度範疇被權限收窄，故障時沒有備選模型可接管，只提醒不阻止切換 */
  const showAutoLimitedModal = (channels: string[]) => {
    const names = channels.map((channel) => modelDisplayName(modeModelKey(channel as LlmEngineMode)) ?? channel)
    Modal.warning({
      title: t('home.engineAutoLimitedTitle'),
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: t('home.engineAutoLimitedContent', { username: user?.username ?? '--', models: names.join('、') }),
      okText: '我知道了',
    })
  }

  /** 選擇引擎模式：未接入模型僅提示；性能優先本地標記；固定模式被權限攔截只彈窗 */
  const handleEngineModeSelect: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('pending:') || key === 'no-models') {
      message.info(t('home.enginePendingMsg'))
      return
    }
    if (key === 'performance') {
      setPerfMode(true)
      localStorage.setItem(PERF_MODE_KEY, 'performance')
      setEngineMode('auto')
      fetchEngineStatus().then(setEngine)
      message.info(t('home.enginePerfMsg'))
      return
    }
    if (key === 'auto') {
      setPerfMode(false)
      localStorage.removeItem(PERF_MODE_KEY)
    }
    const next = key as LlmEngineMode
    if ((next === 'primary' || next === 'off-peak') && deniedChannels.includes(next)) {
      showModelDeniedModal(modelDisplayName(modeModelKey(next)) ?? next)
      return
    }
    setEngineMode(next)
    fetchEngineStatus().then(setEngine)
    if (next === 'auto' && deniedChannels.length > 0) {
      showAutoLimitedModal(deniedChannels)
      return
    }
    message.success(t('home.engineSwitchSuccess', { mode: engineModeLabel(next) }))
  }

  /** 代理回傳的受限清單到位後校正：已固定到無權限通道時自動回到省錢優先 */
  useEffect(() => {
    if ((engineMode === 'primary' || engineMode === 'off-peak') && deniedChannels.includes(engineMode)) {
      setEngineMode('auto')
      fetchEngineStatus().then(setEngine)
      message.info(t('home.engineAutoSwitchMsg', { model: modelDisplayName(modeModelKey(engineMode)) ?? engineMode }))
    }
  }, [engineMode, deniedChannels]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="home-page">
      {/* 精简问候栏 */}
      <div className="home-greeting">
        <div className="home-greeting-left">
          <div className={`home-greeting-avatar${isPikachuAvatar ? ' home-greeting-avatar--pikachu' : ''}`}>
            {isPikachuAvatar ? <PikachuFace expression={avatarExpression} size={44} /> : isCustomOrPresetAvatar ? <img src={avatarKey} alt="avatar" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} /> : <UserOutlined />}
          </div>
          <div className="home-greeting-text">
            <h2>{getGreeting(currentTime.getHours(), t)}，{(!i18nInstance.language?.startsWith('zh') ? chineseNameToPinyinEnglish(user?.name || '') : user?.name) || t('home.greetingPartner')} {t('home.partnerEmoji')}</h2>
            <p className="home-greeting-quote" key={quoteIndex}>{motivationalQuotes[quoteIndex]}</p>
          </div>
        </div>
        <div className="home-greeting-right">
          <div className="home-greeting-time">{timeStr}</div>
          <div className="home-greeting-date">{dateStr}</div>
        </div>
      </div>

      {/* 主区域：左 AI 助手 + 右快捷入口 */}
      <div className="home-main-grid">
      {/* AI 助手（核心） */}
      <div className="home-ai">
        <div className="home-ai-header">
          <div className="home-ai-avatar"><AiLogo size={40} /></div>
          <div className="home-ai-title">
            <h3>{t('home.aiTitle')}<span className="home-ai-badge">{t('home.aiBeta')}</span></h3>
            <span className={`home-ai-status${aiBlocked ? ' home-ai-status--blocked' : ''}`}>
              <i />{aiBlocked ? t('home.aiBlockedBadge') : t('home.aiOnline')}
            </span>
          </div>
          <div className="home-ai-badges">
            <button
              type="button"
              className={`home-ai-engine${aiBlocked ? ' home-ai-engine--blocked' : ''}`}
              onClick={handleOpenUsage}
              title={t('home.aiMyUsage')}
            >
              <i />
              {t('home.aiMyUsage')}
              {chipRemainingPercent !== null && (
                (() => {
                  // 顏色狀態：60-100% 綠色 (安全)，20-59% 橙色 (警示)，<20% 紅色 (緊急)
                  const getColor = (percent: number) => {
                    if (percent >= 60) return '#52C41A'  // 綠色
                    if (percent >= 20) return '#FAAD14'  // 橙色
                    return '#FF4D4F'  // 紅色
                  }
                  const getStatusText = (percent: number) => {
                    if (percent >= 60) return t('home.aiQuotaSufficient')
                    if (percent >= 20) return t('home.aiQuotaTight')
                    return t('home.aiQuotaInsufficient')
                  }
                  return (
                    <span style={{ marginLeft: 8, fontSize: 12, color: getColor(chipRemainingPercent), fontWeight: 600 }}>
                      ·{chipRemainingPercent}% ({getStatusText(chipRemainingPercent)})
                    </span>
                  )
                })()
              )}
            </button>
            <Dropdown
              menu={aiBlocked
                ? { items: [] }
                : { items: engineMenuItems, selectable: true, selectedKeys: [selectedEngineKey], onClick: handleEngineModeSelect }}
              dropdownRender={aiBlocked && blockReason
                /* 未開通時下拉不再展示智能路由選項，替換為原因說明面板 */
                ? () => (
                  <div className="home-ai-engine-panel">
                    <div className="home-ai-engine-panel-icon"><LockOutlined /></div>
                    <div className="home-ai-engine-panel-title">{t(ENGINE_PANEL_TITLE_KEY[blockReason])}</div>
                    <div className="home-ai-engine-panel-desc">{t(ENGINE_PANEL_DESC_KEY[blockReason])}</div>
                  </div>
                )
                : undefined}
              trigger={['click']}
              placement="bottomRight"
              rootClassName={aiBlocked ? 'home-ai-engine-dropdown' : undefined}
            >
              <button
                type="button"
                className={`home-ai-engine${aiBlocked ? ' home-ai-engine--blocked' : engineMode !== 'auto' ? ' home-ai-engine--manual' : perfMode ? ' home-ai-engine--perf' : ''}`}
              >
                <i />
                {engineChipText}
                <DownOutlined className="home-ai-engine-caret" />
              </button>
            </Dropdown>
          </div>
        </div>

        <div className="home-ai-body">
          {isEmpty ? (
            blockReason ? (
              /* 未開通引導卡：卡片式背景 + 品牌橙頂條，標題突出缺失項，描述給出開通路徑 */
              <div className="home-ai-hero">
                <div className="home-ai-hero-card">
                  <div className="home-ai-hero-icon home-ai-hero-icon--blocked">
                    <LockOutlined />
                  </div>
                  <h4>{t(BLOCKED_TITLE_KEY[blockReason])}</h4>
                  <p>{t(BLOCKED_DESC_KEY[blockReason])}</p>
                  <button type="button" className="home-ai-blocked-action" onClick={handleOpenUsage}>
                    <WalletOutlined />
                    {t('home.aiBlockedViewUsage')}
                  </button>
                </div>
              </div>
            ) : (
            <div className="home-ai-hero">
              <div className="home-ai-hero-icon"><AiLogo size={64} /></div>
              <h4>{t('home.aiHeroTitle')}</h4>
              <p>{t('home.aiHeroDesc')}</p>
              <div className="home-ai-suggest">
                {quickQuestions.map((q) => (
                  <button key={q.text} className="home-ai-suggest-item" onClick={() => handleSend(q.text)}>
                    <span className="home-ai-suggest-icon">{q.icon}</span>
                    <span>{q.text}</span>
                  </button>
                ))}
              </div>
            </div>
            )
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`home-chat-bubble ${msg.role}`}>
                  <div className={`home-chat-avatar${msg.role === 'user' && !isPikachuAvatar && !isCustomOrPresetAvatar ? ' home-chat-avatar--default' : ''}`}>
                    {msg.role === 'assistant' ? <AiLogo size={32} /> : isPikachuAvatar ? <PikachuFace expression={avatarExpression} size={32} /> : isCustomOrPresetAvatar ? <img src={avatarKey} alt="avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} /> : <UserOutlined />}
                  </div>
                  <div className="home-chat-content">
                    <div className="home-chat-text">{msg.role === 'assistant' ? formatAiText(msg.content) : msg.content}</div>
                  </div>
                </div>
              ))}
              {sending && (
                <div className="home-chat-bubble assistant">
                  <div className="home-chat-avatar"><AiLogo size={32} /></div>
                  <div className="home-chat-content">
                    <div className="home-chat-text home-chat-typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {!isEmpty && (
          blockReason ? (
            /* 對話中權限/額度被回收：警示橫幅替代快捷提問條，告知無法繼續（三態文案） */
            <div className="home-ai-blocked-banner">
              <LockOutlined />
              <span>{t(BLOCKED_BANNER_KEY[blockReason])}</span>
            </div>
          ) : (
          <div className="home-ai-quick">
            {quickQuestions.map((q) => (
              <button key={q.text} className="home-ai-quick-btn" onClick={() => handleSend(q.text)}>
                {q.text}
              </button>
            ))}
          </div>
          )
        )}

        <div className="home-ai-input">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={() => handleSend()}
            placeholder={aiBlocked ? t('home.aiInputBlocked') : t('home.aiInputPlaceholder')}
            className="home-ai-field"
            disabled={sending || aiBlocked}
          />
          <button
            className="home-ai-send"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || sending || aiBlocked}
          >
            <SendOutlined />
          </button>
        </div>
      </div>

      {/* 快捷入口（极简） */}
      <div className="home-quick">
        <div className="home-quick-head">
          <span className="home-quick-label">{t('home.quickEntryLabel')}</span>
          <div className="home-quick-search">
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb', fontSize: 13 }} />}
              placeholder={t('home.quickEntrySearchPlaceholder')}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onFocus={() => setShowAddMenu(true)}
              allowClear
              className="home-quick-field"
            />
            {showAddMenu && searchText && filteredMenus.length > 0 && (
              <div className="home-quick-dropdown">
                {filteredMenus.map((menu) => (
                  <div
                    key={menu.key}
                    className={`home-quick-item ${favorites.includes(menu.key) ? 'is-added' : ''}`}
                    onClick={() => !favorites.includes(menu.key) && addFavorite(menu.key)}
                  >
                    <span className="home-quick-item-icon">{menu.icon}</span>
                    <span className="home-quick-item-label">{translateMenuName(menu.key, menu.label)}</span>
                    <Tag>{translateGroup(menu.group)}</Tag>
                    {favorites.includes(menu.key) ? (
                      <span className="home-quick-item-added">{t('home.added')}</span>
                    ) : (
                      <PlusOutlined className="home-quick-item-add" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="home-quick-list">
          {favorites.length === 0 ? (
            <Empty description={t('home.quickEntryEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            favorites.map((key) => {
              const menu = getMenuInfo(key)
              if (!menu) return null
              return (
                <div key={key} className="home-quick-chip" onClick={() => navigate(menu.path)}>
                  <span className="home-quick-chip-icon">{menu.icon}</span>
                  <span className="home-quick-chip-label">{translateMenuName(menu.key, menu.label)}</span>
                  <button
                    className="home-quick-chip-remove"
                    onClick={(e) => { e.stopPropagation(); removeFavorite(key) }}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
      </div>

      {/* 我的用量抽屜（真實額度维度 + 實際用量，與能耗統計同源） */}
      <Drawer
        title={t('home.usageTitle')}
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
        width={520}
      >
        {usageLoading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}><Spin /></div>
        ) : myUsage ? (
          <>
            {/* 整體用量統計卡（biz_llm_usage 實時聚合） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: t('home.usageTodayTokens'), value: formatNumber(myUsage.usage.todayTokens), icon: <ThunderboltOutlined />, color: '#1890FF', bg: '#E6F7FF' },
                { label: t('home.usageTodayRequests'), value: formatNumber(myUsage.usage.todayRequests), icon: <LineChartOutlined />, color: '#E8720C', bg: '#FFF7E6' },
                {
                  label: t('home.usageTodayCosts'),
                  value: myUsage.usage.todayCosts.map((c) => `${currencySymbol(c.currency)}${formatCost(c.cost)}`).join(' / ') || '--',
                  icon: <WalletOutlined />, color: '#52C41A', bg: '#F6FFED',
                },
                { label: t('home.usageMonthTokens'), value: formatNumber(myUsage.usage.monthTokens), icon: <DatabaseOutlined />, color: '#722ED1', bg: '#F9F0FF' },
              ].map((stat, i) => (
                <div
                  key={i}
                  style={{
                    padding: 16, borderRadius: 12, background: stat.bg, border: `1px solid ${stat.color}22`, textAlign: 'center',
                    transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default', position: 'relative', overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)'
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ fontSize: 20, color: stat.color, marginBottom: 6 }}>{stat.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 2 }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* 我的額度维度（員工/部門/職位/角色，已用按請求明細實時聚合） */}
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('home.usageQuotaDimsTitle')}</div>
            {myUsage.dimensions.length === 0 ? (
              /* 無額度 = 無可用額度（不可用）：鎖定圖標卡 + 開通指引，避免「放心使用」式誤導 */
              <div style={{ border: '1px dashed #FFD591', background: '#FFFBF5', borderRadius: 12, padding: '20px 16px', textAlign: 'center', marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, margin: '0 auto 10px', borderRadius: '50%', background: '#FFF7E6', border: '1px solid #FFE7BA', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D46B08', fontSize: 18 }}>
                  <LockOutlined />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#262626', marginBottom: 6 }}>{t('home.usageDimsEmpty')}</div>
                <div style={{ fontSize: 12, color: '#8C8C8C', lineHeight: 1.7 }}>{t('home.usageDimsEmptyHint')}</div>
              </div>
            ) : (
              myUsage.dimensions.map((dim, i) => {
                const quota = Number(dim.quotaValue) || 0
                const used = Number(dim.usedValue) || 0
                const rawPercent = quota > 0 ? (used / quota) * 100 : 0
                const percent = Math.min(100, Math.round(rawPercent))
                const over = quota > 0 && used > quota
                const color = over ? '#FF4D4F' : rawPercent >= (dim.softThreshold ?? 80) ? '#FAAD14' : '#52C41A'
                const unit = dim.quotaType === 'token' ? t('home.usageUnitToken') : dim.quotaType === 'request' ? t('home.usageUnitRequest') : ''
                const fmt = (value: number) => (dim.quotaType === 'cost' ? `${currencySymbol(dim.currency)}${formatCost(value)}` : formatNumber(value))
                return (
                  <div
                    key={`${dim.source}-${dim.period}-${dim.quotaType}-${dim.modelId ?? 'all'}-${i}`}
                    style={{ border: '1px solid #F0F0F0', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <Tag color={DIM_SOURCE_COLOR[dim.source]} style={{ marginRight: 0 }}>{t(DIM_SOURCE_LABEL_KEY[dim.source])}</Tag>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dim.sourceName}</span>
                      </div>
                      <Tag style={{ marginRight: 0, color: '#8C8C8C' }}>{dim.modelName ?? t('home.usageDimAllModels')}</Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Tag style={{ marginRight: 0 }}>
                        {t(dim.period === 'daily' ? 'home.usageDimPeriodDaily' : 'home.usageDimPeriodMonthly')}
                        ·{t(dim.quotaType === 'token' ? 'home.usageDimTypeToken' : dim.quotaType === 'cost' ? 'home.usageDimTypeCost' : 'home.usageDimTypeRequest')}
                      </Tag>
                      <span style={{ fontSize: 12, fontWeight: 600, color }}>
                        {over
                          ? t('home.usageDimOver', { value: `${fmt(used - quota)}${unit ? ` ${unit}` : ''}` })
                          : t('home.usageDimRemaining', { value: `${fmt(Math.max(0, quota - used))}${unit ? ` ${unit}` : ''}` })}
                      </span>
                    </div>
                    <Progress percent={percent} strokeColor={color} format={(p) => `${p}%`} size="small" />
                    <div style={{ fontSize: 12, color: '#595959', marginTop: 2 }}>
                      {t('home.usageDimUsedPercent', { percent })} · {fmt(used)} / {fmt(quota)}{unit ? ` ${unit}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 4 }}>
                      {dim.period === 'daily' ? t('home.usageDimResetDaily') : t('home.usageDimResetOn', { date: dim.resetDate })}
                    </div>
                  </div>
                )
              })
            )}

            {/* 最近使用記錄 */}
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('home.usageRecentTitle')}</div>
            {myUsage.recentRecords.length === 0 ? (
              <Empty description={t('home.usageEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              myUsage.recentRecords.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F0F0F0' }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{r.model} · {r.mode}</div>
                    <div style={{ fontSize: 11, color: '#8C8C8C' }}>{r.time}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{formatNumber(r.promptTokens + r.completionTokens)} {t('home.usageUnitToken')}</div>
                    <div style={{ fontSize: 11, color: '#8C8C8C' }}>{r.currency ? `${currencySymbol(r.currency)}${formatCost(r.cost)}` : '--'}</div>
                  </div>
                </div>
              ))
            )}
            <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 12 }}>
              {t('home.usageRecentHint')}
            </div>
          </>
        ) : (
          <Empty description={t('home.usageEmpty')} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Drawer>
    </div>
  )
}
