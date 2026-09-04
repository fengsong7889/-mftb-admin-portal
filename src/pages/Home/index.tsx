import { useState, useEffect, useRef, useMemo } from 'react'
import { Input, Tag, Empty, Dropdown, Modal, message, Drawer, Progress, Spin } from 'antd'
import type { MenuProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { fetchMenuTree } from '../../api/menu'
import type { MenuVO } from '../../api/menu'
import { fetchQuickFavorites, saveQuickFavorites } from '../../api/auth'
import { translateMenuName } from '../../i18n/menuNameEn'
import PikachuFace from '../../components/PikachuFace'
import { sendAgentMessage, fetchEngineStatus, getEngineMode, setEngineMode } from '../../api/agent'
import type { ChatMessage, LlmEngineStatus, LlmEngineMode } from '../../api/agent'
import type { AiModelKey } from '../../hooks/useSystemRules'
import { fetchMockMyUsage, PENDING_MODEL_OPTIONS, CURRENCY_SYMBOL } from '../../api/mock/aiPlatformMock'
import type { MyUsage } from '../../api/mock/aiPlatformMock'
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

/** 勵志語錄（每 5 秒輪播） */
const motivationalQuotes = [
  '每一個偉大的事業，都從一個勇敢的開始出發。',
  '行動是治癒恐懼的良藥，猶豫拖延將不斷滋養恐懼。',
  '把簡單的事做好就是不簡單，把平凡的事做好就是不平凡。',
  '今天的努力是明天的伏筆，現在的付出是未來的禮物。',
  '不怕慢，只怕站；持續前進，終將抵達。',
  '機會總是留給有準備的人，而你正在準備。',
]

/** 引擎模型 ID → 展示縮寫（膠囊位窄，只顯示供應商縮寫，完整名在下拉菜單） */
const ENGINE_LABELS: Record<string, string> = {
  'qwen3.7-flash': 'QW',
  'deepseek-chat': 'DS',
  'deepseek-v4-flash': 'DS',
  'deepseek-v4-pro': 'DS Pro',
}

/** 引擎模式下拉選項：label 用於菜單與 toast，desc 為小字說明 */
const ENGINE_MODE_OPTIONS: Array<{ value: LlmEngineMode; label: string; desc: string }> = [
  { value: 'auto', label: '省錢優先（Auto）', desc: '全天走單價最低的模型，故障時自動切換其它模型支持' },
  { value: 'primary', label: '固定 QW', desc: '只用 QW 模型，故障時不回落，直接報錯' },
  { value: 'off-peak', label: '固定 DS', desc: '只用 DS 模型，故障時不回落，直接報錯' },
]

/** 引擎模式對應的模型標識（auto 不鎖定單一模型，但未開放的模型仍會被剔出候選與回落範圍） */
const ENGINE_MODE_MODEL: Record<LlmEngineMode, AiModelKey | null> = {
  auto: null,
  primary: 'QW',
  'off-peak': 'DS',
}

/** 模型 → 代理通道標識（與手動模式同值）：把賬號權限限制下發給代理側路由 */
const AI_MODEL_CHANNEL: Record<AiModelKey, LlmEngineMode> = {
  QW: 'primary',
  DS: 'off-peak',
}

/** 全部模型標識（供權限計算遍歷） */
const AI_MODEL_KEYS = Object.keys(AI_MODEL_CHANNEL) as AiModelKey[]

/** 模式 → 展示文案（復用選項定義，避免兩處維護） */
const ENGINE_MODE_LABELS = ENGINE_MODE_OPTIONS.reduce((acc, opt) => {
  acc[opt.value] = opt.label
  return acc
}, {} as Record<LlmEngineMode, string>)

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

/** 时段问候 */
const getGreeting = (hour: number) => {
  if (hour >= 5 && hour < 11) return '早安'
  if (hour >= 11 && hour < 13) return '午安'
  if (hour >= 13 && hour < 18) return '下午好'
  return '晚上好'
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
  const [myUsage, setMyUsage] = useState<MyUsage | null>(null)

  /** 打開「我的用量」抽屜（每次打開重新拉取，與能耗統計同源） */
  const handleOpenUsage = () => {
    setUsageOpen(true)
    setUsageLoading(true)
    fetchMockMyUsage().then((data) => setMyUsage(data)).finally(() => setUsageLoading(false))
  }

  /**
   * 被限制的模型：取代理側 /api/llm/status 回傳的 denied
   * 代理已用登錄 JWT 回源後端換取賬號並讀白名單計算，前端不再自行判定權限，
   * 只消費服務端結論做彈窗告知；真正的攔截發生在代理側（改本地數據也繞不過）
   */
  const deniedModels = useMemo(
    () => AI_MODEL_KEYS.filter((model) => (engine?.denied ?? []).includes(AI_MODEL_CHANNEL[model])),
    [engine],
  )

  /** 定時刷新引擎路由結果（手動切換 / 代理重啟後同步到膠囊） */
  useEffect(() => {
    let cancelled = false
    const load = () => fetchEngineStatus().then((s) => { if (!cancelled) setEngine(s) })
    load()
    const timer = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(timer) }
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

  /** 初始加載我的用量數據（用於首頁按鈕顯示今日剩餘百分比） */
  useEffect(() => {
    let cancelled = false
    fetchMockMyUsage().then((data) => {
      if (!cancelled) setMyUsage(data)
    }).catch(() => { /* 靜默失敗，不影響首頁加載 */ })
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

  /** 勵志語錄每 10 秒輪播 */
  useEffect(() => {
    const qTimer = setInterval(() => {
      setQuoteIndex((i) => (i + 1) % motivationalQuotes.length)
    }, 10000)
    return () => clearInterval(qTimer)
  }, [])

  /** 消息自动滚动 */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const translateGroup = (zh: string) => (
    i18nInstance.language?.startsWith('en') ? (GROUP_NAME_EN[zh] ?? zh) : zh
  )

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
        content: '⚠️ AI 服務暫時不可用，請稍後再試。',
        timestamp: new Date(),
      }])
    } finally {
      setSending(false)
    }
  }

  const dateStr = currentTime.toLocaleDateString('zh-Hant-MO', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
  const timeStr = currentTime.toLocaleTimeString('zh-Hant-MO', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

  const isEmpty = messages.length === 0

  /** 賬號所選頭像：支持 pikachu / DiceBear URL / base64 三種 */
  const avatarKey = user?.avatar ?? ''
  const isPikachuAvatar = !avatarKey || avatarKey.startsWith('pikachu-')
  const avatarExpression = isPikachuAvatar ? (avatarKey.replace('pikachu-', '') || 'default') : ''
  const isCustomOrPresetAvatar = avatarKey.startsWith('https://') || avatarKey.startsWith('data:')

  /** 當前引擎：模型縮寫 + 策略（綠色=省錢優先，橙色=性能優先，藍色=手動固定） */
  const engineName = engine?.model ? (ENGINE_LABELS[engine.model] ?? engine.model) : null
  const engineMode = engine?.mode ?? getEngineMode()
  const engineChipText = engine
    ? `${engineName}·${engineMode === 'auto' ? (perfMode ? '性能' : '省') : '固定'}`
    : '引擎未偵測'

  /** 高亮項：智能路由下區分省錢/性能優先（兩者請求層面都是 auto） */
  const selectedEngineKey = engineMode === 'auto' && perfMode ? 'performance' : engineMode

  /** 引擎模式下拉：智能路由 + 指定模型兩組，按權限動態列出（QW/DS 已接入網關，其餘為擴充展示） */
  const engineMenuItems: MenuProps['items'] = [
    {
      type: 'group',
      label: '智能路由',
      children: [
        {
          key: 'auto',
          label: (
            <div className="home-ai-engine-opt">
              <strong>省錢優先（Auto）</strong>
              <span>全天走單價最低的模型，故障時自動切換其它模型支持</span>
            </div>
          ),
        },
        {
          key: 'performance',
          label: (
            <div className="home-ai-engine-opt">
              <strong>性能優先</strong>
              <span>優選響應質量與速度最佳的模型，網關支持後生效</span>
            </div>
          ),
        },
      ],
    },
    {
      type: 'group',
      label: '指定模型',
      children: [
        ...ENGINE_MODE_OPTIONS.filter((opt) => opt.value !== 'auto').map((opt) => ({
          key: opt.value,
          label: (
            <div className="home-ai-engine-opt">
              <strong>{opt.label}</strong>
              <span>{opt.desc}</span>
            </div>
          ),
        })),
        ...PENDING_MODEL_OPTIONS.map((m) => ({
          key: `pending:${m.label}`,
          label: (
            <div className="home-ai-engine-opt" style={{ opacity: 0.55 }}>
              <strong>{m.label}</strong>
              <span>{m.note}</span>
            </div>
          ),
        })),
      ],
    },
  ]

  /** 無權限提示：沿用全局確認彈窗規範，只保留「我知道了」按鈕 */
  const showModelDeniedModal = (model: AiModelKey) => {
    Modal.warning({
      title: '該模型暫未對你開放',
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 480,
      content: `${model} 模型目前僅對指定賬號開放，你的賬號（${user?.username ?? '--'}）不在使用範圍內。如需使用，請聯繫管理員申請開通。`,
      okText: '我知道了',
    })
  }

  /** 省錢優先受限告知：自動調度範疇被權限收窄，故障時沒有備選模型可接管，只提醒不阻止切換 */
  const showAutoLimitedModal = (models: AiModelKey[]) => {
    Modal.warning({
      title: '省錢優先模式下你有部分模型不可用',
      icon: (
        <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>
      ),
      centered: true,
      className: 'custom-confirm-modal',
      width: 520,
      content: `你的賬號（${user?.username ?? '--'}）暫未開放 ${models.join('、')} 模型，省錢優先只會在已對你開放的模型之間自動調度。因此當可用模型發生意外故障時，沒有其它模型可以接管，請求會直接報錯，不會切換到未開放的模型。如需完整的故障兜底能力，請聯繫管理員申請開通。`,
      okText: '我知道了',
    })
  }

  /** 選擇引擎模式：擴充模型僅提示；性能優先本地標記；固定模式被權限攔截只彈窗 */
  const handleEngineModeSelect: MenuProps['onClick'] = ({ key }) => {
    if (key.startsWith('pending:')) {
      message.info('該模型尚未接入網關，完成接入並對你的賬號授權後即可選用')
      return
    }
    if (key === 'performance') {
      setPerfMode(true)
      localStorage.setItem(PERF_MODE_KEY, 'performance')
      setEngineMode('auto')
      fetchEngineStatus().then(setEngine)
      message.info('性能優先已記錄，後端網關支持後正式生效；當前仍按省錢優先路由')
      return
    }
    if (key === 'auto') {
      setPerfMode(false)
      localStorage.removeItem(PERF_MODE_KEY)
    }
    const next = key as LlmEngineMode
    const model = ENGINE_MODE_MODEL[next]
    if (model && deniedModels.includes(model)) {
      showModelDeniedModal(model)
      return
    }
    setEngineMode(next)
    fetchEngineStatus().then(setEngine)
    if (next === 'auto' && deniedModels.length > 0) {
      showAutoLimitedModal(deniedModels)
      return
    }
    message.success(`AI 引擎：${next === 'auto' ? '省錢優先' : ENGINE_MODE_LABELS[next]}`)
  }

  /** 代理回傳的受限清單到位後校正：已固定到無權限模型時自動回到省錢優先 */
  useEffect(() => {
    const model = ENGINE_MODE_MODEL[engineMode]
    if (model && deniedModels.includes(model)) {
      setEngineMode('auto')
      fetchEngineStatus().then(setEngine)
      message.info(`${model} 模型暫未對你的賬號開放，已自動切換為省錢優先`)
    }
  }, [engineMode, deniedModels])

  return (
    <div className="home-page">
      {/* 精简问候栏 */}
      <div className="home-greeting">
        <div className="home-greeting-left">
          <div className={`home-greeting-avatar${isPikachuAvatar ? ' home-greeting-avatar--pikachu' : ''}`}>
            {isPikachuAvatar ? <PikachuFace expression={avatarExpression} size={44} /> : isCustomOrPresetAvatar ? <img src={avatarKey} alt="avatar" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} /> : <UserOutlined />}
          </div>
          <div className="home-greeting-text">
            <h2>{getGreeting(currentTime.getHours())}，{user?.name || '夥伴'} 🐝</h2>
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
            <h3>AI 智能助手<span className="home-ai-badge">內測模式</span></h3>
            <span className="home-ai-status"><i />在線</span>
          </div>
          <div className="home-ai-badges">
            <button
              type="button"
              className="home-ai-engine"
              onClick={handleOpenUsage}
              title="查看今日/本月已用 Token、剩餘額度與費用概覽"
            >
              <i />
              我的用量
              {myUsage && myUsage.monthQuota > 0 && (
                (() => {
                  const dailyQuota = myUsage.monthQuota / 30
                  const remainingPercent = Math.max(0, 100 - Math.round((myUsage.todayTokens / dailyQuota) * 100))
                  // 顏色狀態：60-100% 綠色 (安全)，20-59% 橙色 (警示)，<20% 紅色 (緊急)
                  const getColor = (percent: number) => {
                    if (percent >= 60) return '#52C41A'  // 綠色
                    if (percent >= 20) return '#FAAD14'  // 橙色
                    return '#FF4D4F'  // 紅色
                  }
                  const getStatusText = (percent: number) => {
                    if (percent >= 60) return '充足'
                    if (percent >= 20) return '緊張'
                    return '不足'
                  }
                  return (
                    <span style={{ marginLeft: 8, fontSize: 12, color: getColor(remainingPercent), fontWeight: 600 }}>
                      ·{remainingPercent}% ({getStatusText(remainingPercent)})
                    </span>
                  )
                })()
              )}
            </button>
            <Dropdown
              menu={{ items: engineMenuItems, selectable: true, selectedKeys: [selectedEngineKey], onClick: handleEngineModeSelect }}
              trigger={['click']}
              placement="bottomRight"
            >
              <button
                type="button"
                className={`home-ai-engine${engineMode !== 'auto' ? ' home-ai-engine--manual' : perfMode ? ' home-ai-engine--perf' : ''}`}
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
            <div className="home-ai-hero">
              <div className="home-ai-hero-icon"><AiLogo size={64} /></div>
              <h4>有什麼可以幫你？</h4>
              <p>我可以查詢賬戶餘額、交易批次、審批狀態等，直接輸入或點下方快捷提問。</p>
              <div className="home-ai-suggest">
                {quickQuestions.map((q) => (
                  <button key={q.text} className="home-ai-suggest-item" onClick={() => handleSend(q.text)}>
                    <span className="home-ai-suggest-icon">{q.icon}</span>
                    <span>{q.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div key={msg.id} className={`home-chat-bubble ${msg.role}`}>
                  <div className="home-chat-avatar">
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
          <div className="home-ai-quick">
            {quickQuestions.map((q) => (
              <button key={q.text} className="home-ai-quick-btn" onClick={() => handleSend(q.text)}>
                {q.text}
              </button>
            ))}
          </div>
        )}

        <div className="home-ai-input">
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={() => handleSend()}
            placeholder="輸入你的問題"
            className="home-ai-field"
            disabled={sending}
          />
          <button
            className="home-ai-send"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || sending}
          >
            <SendOutlined />
          </button>
        </div>
      </div>

      {/* 快捷入口（极简） */}
      <div className="home-quick">
        <div className="home-quick-head">
          <span className="home-quick-label">快捷入口</span>
          <div className="home-quick-search">
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb', fontSize: 13 }} />}
              placeholder="搜索並添加菜單..."
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
                      <span className="home-quick-item-added">已添加</span>
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
            <Empty description="暫無快捷入口" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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

      {/* 我的用量抽屜（今日/本月 Token、剩餘額度、費用概覽、最近記錄） */}
      <Drawer
        title="我的用量"
        open={usageOpen}
        onClose={() => setUsageOpen(false)}
        width={480}
      >
        {usageLoading ? (
          <div style={{ padding: '80px 0', textAlign: 'center' }}><Spin /></div>
        ) : myUsage ? (
          <>
            {/* 統計卡（12.1 標準） */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
              {[
                { label: '今日已用 Token', value: myUsage.todayTokens.toLocaleString(), icon: <ThunderboltOutlined />, color: '#1890FF', bg: '#E6F7FF' },
                { label: '本月已用 Token', value: myUsage.monthTokens.toLocaleString(), icon: <DatabaseOutlined />, color: '#722ED1', bg: '#F9F0FF' },
                { label: '本月請求次數', value: myUsage.monthRequests.toLocaleString(), icon: <LineChartOutlined />, color: '#E8720C', bg: '#FFF7E6' },
                {
                  label: '本月費用（分幣種）',
                  value: myUsage.monthCosts.map((c) => `${CURRENCY_SYMBOL[c.currency]}${c.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`).join(' / ') || '--',
                  icon: <WalletOutlined />, color: '#52C41A', bg: '#F6FFED',
                },
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

            {/* 本月額度進度 */}
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>本月額度</div>
            <Progress
              percent={Math.min(100, Math.round((myUsage.monthTokens / myUsage.monthQuota) * 100))}
              strokeColor={myUsage.monthTokens / myUsage.monthQuota >= myUsage.softThreshold / 100 ? '#FAAD14' : '#E8720C'}
              format={(p) => `${p}%`}
            />
            <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 20 }}>
              已用 {myUsage.monthTokens.toLocaleString()} / {myUsage.monthQuota.toLocaleString()} Token；達到 {myUsage.softThreshold}% 軟提醒閾值後將通知你與主管，超出額度後按額度策略處理。
            </div>

            {/* 最近使用記錄 */}
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>最近使用</div>
            {myUsage.recentRecords.map((r) => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F0F0F0' }}>
                <div>
                  <div style={{ fontSize: 13 }}>{r.scene} · {r.model}</div>
                  <div style={{ fontSize: 11, color: '#8C8C8C' }}>{r.time}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{r.promptTokens + r.completionTokens} Token</div>
                  <div style={{ fontSize: 11, color: '#8C8C8C' }}>{CURRENCY_SYMBOL[r.currency]}{r.cost.toFixed(4)}</div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#8C8C8C', marginTop: 12 }}>
              完整明細請前往「智能中心(AI) → 能耗統計 / 能耗明細」查看；當前為一階段演示數據。
            </div>
          </>
        ) : (
          <Empty description="暫無用量數據" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Drawer>
    </div>
  )
}
