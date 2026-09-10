import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Input, Tag, Empty, Dropdown, Modal, message, Drawer, Progress, Spin, Tooltip, Popover } from 'antd'
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
import { sendAgentMessage, fetchEngineStatus, probeEngineStatus, getEngineMode, setEngineMode, getContextWindowOptions, formatContextWindow } from '../../api/agent'
import type { ChatMessage, ChatAttachment, LlmEngineStatus, LlmEngineMode, LlmRequestOptions, ThinkingDepth } from '../../api/agent'
import { fetchMyQuotaUsage, fetchMyModels, fetchQuotaCheck, currencySymbol, formatNumber, formatCost } from '../../api/aiMyCenter'
import type { MyQuotaUsage, MyModel, QuotaDimension, QuotaSource, QuotaCheckResult } from '../../api/aiMyCenter'
import { fetchConversations, createConversation, updateConversation, deleteConversation, fetchDeletedConversations, restoreConversation, permanentDeleteConversation } from '../../api/aiConversation'
import type { AiConversation } from '../../api/aiConversation'
import type { Conversation } from '../../api/aiConversation'
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
  InfoCircleOutlined,
  PaperClipOutlined,
  CloseCircleOutlined,
  PictureOutlined,
  FileTextOutlined,
  HistoryOutlined,
  MessageOutlined,
  SettingOutlined,
  CheckOutlined,
  UndoOutlined,
  CompressOutlined,
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
  { key: 'promotion-sales-config', label: '店鋪推廣', icon: <ShoppingOutlined />, path: '/promotion-sales-config', group: '推广通' },
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

/** 快捷提问（模块级常量已废弃，组件内有翻译后的版本） */
// const quickQuestions = [...]  // 已移至组件内

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

/** 額度維度來源 → Tag 顏色（員工/部門/職位/角色四維度 + 審批授予視覺區分） */
const DIM_SOURCE_COLOR: Record<QuotaSource, string> = {
  employee: '#722ED1',
  department: '#1890FF',
  position: '#E8720C',
  role: '#13C2C2',
  grant: '#52C41A',
}

/** 額度維度來源 → i18n key */
const DIM_SOURCE_LABEL_KEY: Record<QuotaSource, string> = {
  employee: 'home.usageDimSourceEmployee',
  department: 'home.usageDimSourceDepartment',
  position: 'home.usageDimSourcePosition',
  role: 'home.usageDimSourceRole',
  grant: 'home.usageDimSourceGrant',
}

/** 上下文窗口使用率：醒目的胶囊按钮 + Popover 面板 */
const ContextUsageIndicator = ({
  usedTokens,
  contextWindow,
  onCompress,
  onNewChat,
  t,
}: {
  usedTokens: number
  contextWindow: number | undefined
  onCompress: () => void
  onNewChat: () => void
  t: (key: string) => string
}) => {
  if (!contextWindow || contextWindow <= 0) return null
  const ratio = Math.min(1, usedTokens / contextWindow)
  const percent = Math.round(ratio * 100)
  const usedLabel = usedTokens >= 1_000_000
    ? `${(usedTokens / 1_000_000).toFixed(1)}M`
    : `${Math.round(usedTokens / 1_000)}k`
  const limitLabel = contextWindow >= 1_000_000
    ? `${Math.round(contextWindow / 1_000_000)}M`
    : `${Math.round(contextWindow / 1_000)}k`
  const color = ratio < 0.5 ? '#52C41A' : ratio < 0.8 ? '#FAAD14' : '#FF4D4F'
  const bg = ratio < 0.5 ? '#F6FFED' : ratio < 0.8 ? '#FFFBE6' : '#FFF1F0'
  const border = ratio < 0.5 ? '#B7EB8F' : ratio < 0.8 ? '#FFE58F' : '#FFA39E'

  return (
    <Popover
      trigger="click"
      placement="topRight"
      arrow={false}
      overlayInnerStyle={{ padding: 0 }}
      content={
        <div className="home-ctx-popover">
          <div className="home-ctx-popover-header">
            <CompressOutlined className="home-ctx-popover-icon" />
            <span>{t('home.ctxPopoverTitle')}</span>
          </div>
          <div className="home-ctx-popover-stats">
            <span className="home-ctx-popover-pct" style={{ color }}>{percent}%</span>
            <span className="home-ctx-popover-tokens">{usedLabel} / {limitLabel}</span>
            <span className="home-ctx-popover-label">{t('home.ctxUsageLabel')}</span>
          </div>
          <div className="home-ctx-popover-bar-track">
            <div className="home-ctx-popover-bar-fill" style={{ width: `${percent}%`, background: color }} />
          </div>
          <div className="home-ctx-popover-actions">
            <button type="button" className="home-ctx-popover-btn home-ctx-popover-btn--compress" onClick={() => { onCompress() }}>
              <CompressOutlined /> {t('home.convCompress')}
            </button>
            <button type="button" className="home-ctx-popover-btn home-ctx-popover-btn--new" onClick={() => { onNewChat() }}>
              <PlusOutlined /> {t('home.convNew')}
            </button>
          </div>
        </div>
      }
    >
      <button type="button" className="home-ctx-capsule" style={{ background: bg, borderColor: border }} title={`${percent}% ${t('home.ctxUsageLabel')}`}>
        <span className="home-ctx-capsule-dot" style={{ background: color }} />
        <span className="home-ctx-capsule-pct" style={{ color }}>{percent}%</span>
        <span className="home-ctx-capsule-tokens">{usedLabel}/{limitLabel}</span>
      </button>
    </Popover>
  )
}

/** AI 助手未開通原因：無模型權限 / 無額度 / 兩者皆無 / 額度已用完(拒絕) / 需審批 */
type AiBlockReason = 'no-models' | 'no-quota' | 'no-both' | 'quota-exhausted' | 'needs-approval'

/** 未開通原因 → Hero 引導卡標題 i18n key（標題直接突出缺失項） */
const BLOCKED_TITLE_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.aiBlockedNoModelsTitle',
  'no-quota': 'home.aiBlockedNoQuotaTitle',
  'no-both': 'home.aiBlockedNoBothTitle',
  'quota-exhausted': 'home.aiQuotaExhaustedTitle',
  'needs-approval': 'home.aiNeedsApprovalTitle',
}

/** 未開通原因 → Hero 引導卡描述 i18n key */
const BLOCKED_DESC_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.aiBlockedNoModelsDesc',
  'no-quota': 'home.aiBlockedNoQuotaDesc',
  'no-both': 'home.aiBlockedNoBothDesc',
  'quota-exhausted': 'home.aiQuotaExhaustedDesc',
  'needs-approval': 'home.aiNeedsApprovalDesc',
}

/** 未開通原因 → 模型選擇下拉面板標題/描述 i18n key */
const ENGINE_PANEL_TITLE_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.enginePanelNoModelsTitle',
  'no-quota': 'home.enginePanelNoQuotaTitle',
  'no-both': 'home.enginePanelNoBothTitle',
  'quota-exhausted': 'home.aiQuotaExhaustedTitle',
  'needs-approval': 'home.aiNeedsApprovalTitle',
}
const ENGINE_PANEL_DESC_KEY: Record<AiBlockReason, string> = {
  'no-models': 'home.enginePanelNoModelsDesc',
  'no-quota': 'home.enginePanelNoQuotaDesc',
  'no-both': 'home.enginePanelNoBothDesc',
  'quota-exhausted': 'home.aiQuotaExhaustedDesc',
  'needs-approval': 'home.aiNeedsApprovalDesc',
}

/** 將 AI 回覆中的字面 \n 轉為真正換行（CSS white-space: pre-wrap 負責渲染） */
const formatAiText = (text: string) => text.replace(/\\n/g, '\n')

/** 递归收集菜单 key → 名称映射 */
const collectMenuNames = (menus: MenuVO[], map: Record<string, string>) => {
  menus.forEach((m) => {
    map[m.menuKey] = m.name
    if (m.children?.length) collectMenuNames(m.children, map)
  })
}

/** 文件大小限制（模块级常量） */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10MB
const MAX_FILE_SIZE = 5 * 1024 * 1024    // 5MB

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

  /* ── 多会话状态 ── */
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<number | null>(null)
  const [deletedConversations, setDeletedConversations] = useState<AiConversation[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  /** 消息排队队列（最多 3 条） */
  const [messageQueue, setMessageQueue] = useState<{ id: string; text: string; attachments: ChatAttachment[] }[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  /* ── 附件状态 ── */
  const [attachments, setAttachments] = useState<ChatAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  /** 当前活跃会话 */
  const activeConversation = conversations.find((c) => c.id === activeConvId)
  const messages = useMemo(() => activeConversation?.messages ?? [], [activeConversation])

  /** 加载会话列表 */
  useEffect(() => {
    let cancelled = false
    fetchConversations().then((list) => {
      if (cancelled) return
      const parsed = list.map((c) => {
        // 复用 parseConversation 逻辑
        let msgs: ChatMessage[] = []
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw: any[] = JSON.parse(c.messages)
          if (Array.isArray(raw)) {
            msgs = raw.map((m) => ({
              id: m.id as string,
              role: m.role as 'user' | 'assistant',
              content: m.content as string,
              attachments: m.attachments as ChatAttachment[] | undefined,
              timestamp: m.timestamp ? new Date(m.timestamp as string) : new Date(),
            }))
          }
        } catch { /* 损坏数据回退空 */ }
        return { id: c.id, title: c.title, messages: msgs, totalTokens: c.totalTokens ?? 0, createdAt: c.createdAt, updatedAt: c.updatedAt } as Conversation
      })
      setConversations(parsed)
      // 默认激活最新会话，若无则自动创建一个
      if (parsed.length > 0) {
        setActiveConvId(parsed[0].id)
      } else {
        handleCreateConversation()
      }
    }).catch(() => {
      // 后端不可用，创建一个本地会话
      if (!cancelled) {
        const localConv: Conversation = { id: Date.now(), title: '新對話', messages: [], totalTokens: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        setConversations([localConv])
        setActiveConvId(localConv.id)
      }
    })
    return () => { cancelled = true }
  }, [])

  /** 新建会话 */
  const handleCreateConversation = async () => {
    try {
      const conv = await createConversation()
      const newConv: Conversation = { id: conv.id, title: conv.title, messages: [], totalTokens: conv.totalTokens ?? 0, createdAt: conv.createdAt, updatedAt: conv.updatedAt }
      setConversations((prev) => [newConv, ...prev])
      setActiveConvId(newConv.id)
    } catch {
      // 后端不可用，本地创建
      const localConv: Conversation = { id: Date.now(), title: '新對話', messages: [], totalTokens: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setConversations((prev) => [localConv, ...prev])
      setActiveConvId(localConv.id)
    }
  }

  /** 删除会话 */
  const handleDeleteConversation = async (convId: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (conversations.length <= 1) {
      message.warning(t('home.convDeleteLast'))
      return
    }
    Modal.confirm({
      title: t('home.convDeleteConfirm'),
      centered: true,
      className: 'custom-confirm-modal',
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteConversation(convId)
        } catch { /* 后端不可用静默 */ }
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== convId)
          if (activeConvId === convId && next.length > 0) {
            setActiveConvId(next[0].id)
          }
          return next
        })
        // 刷新回收站列表
        loadDeletedConversations()
      },
    })
  }

  /** 加载回收站列表 */
  const loadDeletedConversations = async () => {
    try {
      const list = await fetchDeletedConversations()
      setDeletedConversations(list)
    } catch { /* 后端不可用静默 */ }
  }

  /** 恢复已删除的会话 */
  const handleRestoreConversation = async (convId: number) => {
    try {
      await restoreConversation(convId)
      message.success(t('home.convRestored'))
      // 重新加载活跃会话列表和回收站
      const [activeList, deletedList] = await Promise.all([
        fetchConversations(),
        fetchDeletedConversations(),
      ])
      const parsed = activeList.map((c) => {
        let msgs: ChatMessage[] = []
        try {
          const raw: any[] = JSON.parse(c.messages) // eslint-disable-line @typescript-eslint/no-explicit-any
          if (Array.isArray(raw)) {
            msgs = raw.map((m) => ({
              id: m.id as string,
              role: m.role as 'user' | 'assistant',
              content: m.content as string,
              attachments: m.attachments as ChatAttachment[] | undefined,
              timestamp: m.timestamp ? new Date(m.timestamp as string) : new Date(),
            }))
          }
        } catch { /* 损坏数据回退空 */ }
        return { id: c.id, title: c.title, messages: msgs, totalTokens: c.totalTokens ?? 0, createdAt: c.createdAt, updatedAt: c.updatedAt } as Conversation
      })
      setConversations(parsed)
      setDeletedConversations(deletedList)
      // 切换到恢复的会话
      setActiveConvId(convId)
    } catch {
      message.error(t('common.error'))
    }
  }

  /** 永久删除会话 */
  const handlePermanentDelete = (convId: number) => {
    Modal.confirm({
      title: t('home.convPermanentDeleteConfirm'),
      centered: true,
      className: 'custom-confirm-modal',
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await permanentDeleteConversation(convId)
          message.success(t('home.convPermanentDeleted'))
          setDeletedConversations((prev) => prev.filter((c) => c.id !== convId))
        } catch {
          message.error(t('common.error'))
        }
      },
    })
  }

  /** 更新活跃会话的消息（debounce 保存到后端） */
  const updateActiveMessages = useCallback((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === activeConvId)
      if (idx === -1) return prev
      const updated = [...prev]
      const conv = { ...updated[idx], messages: updater(updated[idx].messages), updatedAt: new Date().toISOString() }
      // 自动更新标题：取第一条用户消息的前 20 个字符
      if (conv.messages.length > 0 && conv.title === '新對話') {
        const firstUser = conv.messages.find((m) => m.role === 'user')
        if (firstUser) conv.title = firstUser.content.slice(0, 20) + (firstUser.content.length > 20 ? '...' : '')
      }
      updated[idx] = conv
      // debounce 保存到后端
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        updateConversation(conv.id, {
          title: conv.title,
          messages: JSON.stringify(conv.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            attachments: m.attachments,
            timestamp: m.timestamp.toISOString(),
          }))),
        }).catch(() => { /* 静默失败 */ })
      }, 2000)
      return updated
    })
  }, [activeConvId])

  /* ── 當前引擎（模型通道 / 使用權限）── */
  const [engine, setEngine] = useState<LlmEngineStatus | null>(null)

  /* ── 上下文窗口 & 思考模式設定 ── */
  const [contextWindow, setContextWindow] = useState<number | null>(null)
  const [thinkingEnabled, setThinkingEnabled] = useState(false)
  const [thinkingDepth, setThinkingDepth] = useState<ThinkingDepth>('xhigh')
  const [settingsOpen, setSettingsOpen] = useState(false)

  /* ── 我的用量 ── */
  const [usageOpen, setUsageOpen] = useState(false)
  const [usageLoading, setUsageLoading] = useState(false)
  const [myUsage, setMyUsage] = useState<MyQuotaUsage | null>(null)

  /* ── 我的授權模型與網關已接入模型（modelKey → 引擎模式） ── */
  const [myModels, setMyModels] = useState<MyModel[]>([])
  const [connectedModels, setConnectedModels] = useState<Record<string, LlmEngineMode>>({})

  /* ── 開通狀態判定依據（接口成功返回才置 true，網絡故障不誤判為未開通） ── */
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [usageLoaded, setUsageLoaded] = useState(false)

  /* ── 配額校驗結果（後端綜合所有維度給出處置動作） ── */
  const [quotaCheck, setQuotaCheck] = useState<QuotaCheckResult | null>(null)
  const [quotaCheckLoaded, setQuotaCheckLoaded] = useState(false)

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
   * - 後端配額校驗結果優先：reject → quota-exhausted，approve → needs-approval
   * - 前端兆底：所有维度 100% → quota-exhausted
   * 多種原因分開提示，引導用戶聯繫管理員開通對應權限
   */
  const noModels = modelsLoaded && myModels.length === 0
  const noQuota = usageLoaded && (myUsage?.dimensions.length ?? 0) === 0
  
  // 前端兆底：所有维度都已达到或超过 100%（当后端校验未加载时使用）
  const quotaExhaustedFallback = useMemo(() => {
    if (!usageLoaded || !myUsage || myUsage.dimensions.length === 0) return false
    return myUsage.dimensions.every((dim) => {
      const quota = Number(dim.quotaValue) || 0
      const used = Number(dim.usedValue) || 0
      if (quota <= 0) return false
      return used >= quota
    })
  }, [usageLoaded, myUsage])
  
  // 降级模式：后端返回 action=downgrade 时启用，允许发送但显示标识
  const downgradeMode = quotaCheckLoaded && quotaCheck?.action === 'downgrade'
  
  // 综合判定 blockReason：后端配额校验优先，前端兆底兜底
  const blockReason: AiBlockReason | null = useMemo(() => {
    // 模型权限是使用前提：无授权模型时无论配额校验结果如何都必须阻塞
    if (noModels) {
      return noQuota ? 'no-both' : 'no-models'
    }
    // 后端配额校验结果优先（已加载时以服务端结论为准）
    if (quotaCheckLoaded && quotaCheck) {
      if (quotaCheck.action === 'reject') return 'quota-exhausted'
      if (quotaCheck.action === 'approve') return 'needs-approval'
      // downgrade / allow → 不阻塞
      return null
    }
    // 后端未返回时，前端兆底判定
    if (noQuota) return 'no-quota'
    return quotaExhaustedFallback ? 'quota-exhausted' : null
  }, [noModels, noQuota, quotaCheckLoaded, quotaCheck, quotaExhaustedFallback])
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
      // 僅記錄通道真實匹配的模型：off-peak 未配置時代理會回落到 primary，
      // 若不校驗 channel 會把 primary 的模型誤標為 off-peak，導致點擊時觸發無權限彈窗
      if (primary?.model && primary.channel === 'primary') map[primary.model] = 'primary'
      if (offPeak?.model && offPeak.channel === 'off-peak') map[offPeak.model] = 'off-peak'
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

  /** 初始加載我的用量數據（用於資訊條與開通態判定） */
  useEffect(() => {
    let cancelled = false
    fetchMyQuotaUsage().then((data) => {
      if (!cancelled) { setMyUsage(data); setUsageLoaded(true) }
    }).catch(() => { /* 靜默失敗，不影響首頁加載，不參與開通態判定 */ })
    return () => { cancelled = true }
  }, [])

  /** 初始加載配額校驗（綜合所有維度給出處置動作） + 定時刷新 */
  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetchQuotaCheck().then((result) => {
        if (!cancelled) { setQuotaCheck(result); setQuotaCheckLoaded(true) }
      }).catch(() => { /* 靜默失敗，前端兆底兜底 */ })
    }
    load()
    const timer = setInterval(load, 60000)
    return () => { cancelled = true; clearInterval(timer) }
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
    if (mode === 'auto') return t('home.engineCostSaving')
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

  /** 发送消息（sending 时进入排队队列） */
  const handleSend = async (preset?: string) => {
    const text = (preset ?? inputText).trim()
    if (!text) return
    // 未開通兗底：輸入區已禁用，這裡防快捷提問等入口繞過
    if (aiBlocked) {
      message.warning(t('home.aiBlockedSendMsg'))
      return
    }

    // 正在发送中 → 进入排队队列（最多 3 条）
    if (sending) {
      if (messageQueue.length >= 3) {
        message.warning(t('home.aiQueueFull'))
        return
      }
      const queueItem = {
        id: `queue-${Date.now()}`,
        text,
        attachments: attachments.length > 0 ? [...attachments] : [],
      }
      setMessageQueue((prev) => [...prev, queueItem])
      setInputText('')
      setAttachments([])
      return
    }
  
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      timestamp: new Date(),
    }
    const newMessages = [...messages, userMsg]
    updateActiveMessages(() => newMessages)
    setInputText('')
    setAttachments([])
    setSending(true)
  
    try {
      const reply = await sendAgentMessage(newMessages, llmRequestOptions)
      updateActiveMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply.text,
        timestamp: new Date(),
      }])
      // 累积 tokens 并更新会话
      if (activeConvId) {
        setConversations((prev) => prev.map((c) =>
          c.id === activeConvId ? { ...c, totalTokens: (c.totalTokens ?? 0) + reply.tokens } : c
        ))
        updateConversation(activeConvId, {
          title: undefined,
          messages: undefined,
          totalTokens: (activeConversation?.totalTokens ?? 0) + reply.tokens,
        }).catch(() => {})
      }
    } catch {
      updateActiveMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('home.aiServiceError'),
        timestamp: new Date(),
      }])
    } finally {
      setSending(false)
    }
  }

  /** 当 sending 变为 false 且有排队消息时，自动处理下一条（定义在 llmRequestOptions 之后） */
  const processNextInQueueRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    if (!sending && messageQueue.length > 0 && processNextInQueueRef.current) {
      processNextInQueueRef.current()
    }
  }, [sending, messageQueue.length])

  /** 删除排队中的消息 */
  const handleRemoveQueueItem = (id: string) => {
    setMessageQueue((prev) => prev.filter((item) => item.id !== id))
  }

  /** 压缩当前会话：保留最近 4 条消息，旧消息替换为摘要标记 */
  const handleCompressConversation = () => {
    if (!activeConvId || messages.length <= 4) {
      message.info(t('home.convCompressNoNeed'))
      return
    }
    const keepCount = 4
    const compressed: ChatMessage[] = [
      {
        id: `compress-${Date.now()}`,
        role: 'assistant',
        content: `[已压缩：${messages.length - keepCount} 条旧消息已归纳为上下文摘要，保留最近 ${keepCount} 条消息继续对话]`,
        timestamp: new Date(),
      },
      ...messages.slice(-keepCount),
    ]
    // 估算压缩后的 tokens（约 4 字符/token）
    const estimatedTokens = Math.round(
      compressed.reduce((sum, m) => sum + m.content.length, 0) / 4
    )
    updateActiveMessages(() => compressed)
    setConversations((prev) => prev.map((c) =>
      c.id === activeConvId ? { ...c, totalTokens: estimatedTokens, messages: compressed } : c
    ))
    updateConversation(activeConvId, {
      messages: JSON.stringify(compressed.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      }))),
      totalTokens: estimatedTokens,
    }).catch(() => {})
    message.success(t('home.convCompressed'))
  }

  const dateStr = currentTime.toLocaleDateString(dateLocale, {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  })
  const timeStr = currentTime.toLocaleTimeString(dateLocale, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })

  const isEmpty = messages.length === 0

  /* ── 引擎模式（提前声明，供能力计算使用） ── */
  const engineMode = engine?.mode ?? getEngineMode()

  /* ── 当前模型能力计算 ── */
  const currentCapabilities = useMemo(() => {
    if (engineMode === 'auto') {
      // AUTO 模式：取所有授权模型能力的并集
      const caps = { text: true, image: false, audio: false, video: false, file: false, toolCalling: false, thinking: false }
      myModels.forEach((m) => {
        if (m.modalities) {
          const mods = m.modalities.split(',').map((s) => s.trim())
          if (mods.includes('image')) caps.image = true
          if (mods.includes('audio')) caps.audio = true
          if (mods.includes('video')) caps.video = true
        }
        if (m.visionSupport) caps.image = true
        if (m.functionCalling) caps.toolCalling = true
        if (m.thinkingMode) caps.thinking = true
      })
      // 有图片支持即表示支持文件上传
      caps.file = caps.image
      return caps
    }
    // 指定模型：找当前引擎对应的模型
    const currentModelKey = engine?.model
    const model = myModels.find((m) => m.modelKey === currentModelKey)
    if (!model) return { text: true, image: false, audio: false, video: false, file: false, toolCalling: false, thinking: false }
    const mods = model.modalities?.split(',').map((s) => s.trim()) ?? []
    return {
      text: true,
      image: mods.includes('image') || model.visionSupport,
      audio: mods.includes('audio'),
      video: mods.includes('video'),
      file: mods.includes('image') || model.visionSupport,
      toolCalling: model.functionCalling,
      thinking: model.thinkingMode,
    }
  }, [engineMode, myModels, engine?.model])

  /* ── 上下文窗口選項（按模型實際上限過濾） & 思考模式可用性 ── */
  const contextWindowOptions = useMemo(() => {
    if (engineMode === 'auto') {
      // AUTO 模式：取所有授權模型的最小上下文窗口
      const mins = myModels
        .map((m) => m.contextWindow)
        .filter((v): v is number => v != null && v > 0)
      if (mins.length === 0) return [128_000]
      const minMax = Math.min(...mins)
      return getContextWindowOptions(minMax)
    }
    // 指定模型：用當前引擎對應的模型
    const currentModelKey = engine?.model
    const model = myModels.find((m) => m.modelKey === currentModelKey)
    return getContextWindowOptions(model?.contextWindow ?? null)
  }, [engineMode, myModels, engine?.model])

  /** 思考模式是否可用（AUTO 模式下需所有模型都支持） */
  const thinkingAvailable = useMemo(() => {
    if (engineMode === 'auto') {
      return myModels.length > 0 && myModels.every((m) => m.thinkingMode)
    }
    const currentModelKey = engine?.model
    const model = myModels.find((m) => m.modelKey === currentModelKey)
    return model?.thinkingMode ?? false
  }, [engineMode, myModels, engine?.model])

  /** 初始化上下文窗口默認值（選項變化時自動調整） */
  useEffect(() => {
    if (contextWindowOptions.length > 0) {
      // 如果當前選擇不在選項中，默認選最後一個（最大）
      if (!contextWindow || !contextWindowOptions.includes(contextWindow)) {
        setContextWindow(contextWindowOptions[contextWindowOptions.length - 1])
      }
    }
  }, [contextWindowOptions]) // eslint-disable-line react-hooks/exhaustive-deps

  /** 構建 LLM 請求選項 */
  const llmRequestOptions = useMemo((): LlmRequestOptions => {
    const opts: LlmRequestOptions = {}
    if (contextWindow) opts.contextWindow = contextWindow
    if (thinkingEnabled && thinkingAvailable) opts.thinkingDepth = thinkingDepth
    return opts
  }, [contextWindow, thinkingEnabled, thinkingAvailable, thinkingDepth])

  /** 处理排队中的下一条消息 */
  const processNextInQueue = useCallback(async () => {
    if (messageQueue.length === 0) return
    const next = messageQueue[0]
    setMessageQueue((prev) => prev.slice(1))

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: next.text,
      attachments: next.attachments.length > 0 ? next.attachments : undefined,
      timestamp: new Date(),
    }
    const newMessages = [...messages, userMsg]
    updateActiveMessages(() => newMessages)
    setSending(true)

    try {
      const reply = await sendAgentMessage(newMessages, llmRequestOptions)
      updateActiveMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply.text,
        timestamp: new Date(),
      }])
      // 累积 tokens
      if (activeConvId) {
        setConversations((prev) => prev.map((c) =>
          c.id === activeConvId ? { ...c, totalTokens: (c.totalTokens ?? 0) + reply.tokens } : c
        ))
        updateConversation(activeConvId, {
          totalTokens: (activeConversation?.totalTokens ?? 0) + reply.tokens,
        }).catch(() => {})
      }
    } catch {
      updateActiveMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('home.aiServiceError'),
        timestamp: new Date(),
      }])
    } finally {
      setSending(false)
    }
  }, [messageQueue, messages, updateActiveMessages, llmRequestOptions, t, activeConvId, activeConversation?.totalTokens])

  // 将 processNextInQueue 赋值给 ref，供 useEffect 调用
  useEffect(() => {
    processNextInQueueRef.current = processNextInQueue
  }, [processNextInQueue])

  /* ── 文件处理 ── */

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((file) => {
      const isImage = file.type.startsWith('image/')
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE
      if (file.size > maxSize) {
        message.warning(t('home.fileTooLarge'))
        return
      }
      if (isImage) {
        // 图片 → base64 data URL
        const reader = new FileReader()
        reader.onload = () => {
          setAttachments((prev) => [...prev, {
            type: 'image',
            name: file.name,
            data: reader.result as string,
            mimeType: file.type,
          }])
        }
        reader.readAsDataURL(file)
      } else {
        // 其他文件 → 读取文本内容
        const reader = new FileReader()
        reader.onload = () => {
          setAttachments((prev) => [...prev, {
            type: 'file',
            name: file.name,
            data: reader.result as string,
            mimeType: file.type,
          }])
        }
        reader.readAsText(file)
      }
    })
  }, [t])

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index))
  }, [])

  /** 拖拽处理 */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }, [isDragging])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (currentCapabilities.image || currentCapabilities.file) {
      handleFileSelect(e.dataTransfer.files)
    }
  }, [currentCapabilities, handleFileSelect])

  /** 賬號所選頭像：支持 pikachu / DiceBear URL / base64 三種 */
  const avatarKey = user?.avatar ?? ''
  const isPikachuAvatar = !avatarKey || avatarKey.startsWith('pikachu-')
  const avatarExpression = isPikachuAvatar ? (avatarKey.replace('pikachu-', '') || 'default') : ''
  const isCustomOrPresetAvatar = avatarKey.startsWith('https://') || avatarKey.startsWith('data:')

  /** 頭部資訊條已用百分比：取日维度中最緊的一個，無日维度時回退月维度 */
  const infoBarUsedPercent = useMemo(() => {
    if (!myUsage || myUsage.dimensions.length === 0) return null
    const usedOf = (dim: QuotaDimension): number | null => {
      const quota = Number(dim.quotaValue) || 0
      if (quota <= 0) return null
      return Math.min(100, Math.round((Number(dim.usedValue) / quota) * 100))
    }
    const pick = (period: 'daily' | 'monthly') => myUsage!.dimensions
      .filter((d) => d.period === period)
      .map(usedOf)
      .filter((v): v is number => v !== null)
    const daily = pick('daily')
    const pool = daily.length > 0 ? daily : pick('monthly')
    return pool.length > 0 ? Math.max(...pool) : null
  }, [myUsage])

  /** 當前引擎：auto 模式只顯示策略名（模型多時拼接會溢位）；手動模式顯示指定模型名稱 */
  const engineName = engine?.model ? (modelDisplayName(engine.model) ?? engine.model) : null
  const engineChipText = blockReason
    ? (blockReason === 'quota-exhausted' || blockReason === 'no-quota'
        ? t('home.engineChipNoQuota')
        : blockReason === 'needs-approval'
          ? t('home.engineChipNeedsApproval')
          : t('home.engineChipNoModels'))
    : engine
      ? engineMode === 'auto' ? t('home.engineCostSaving') : (engineName ?? t('home.aiEngineNotDetected'))
      : t('home.aiEngineNotDetected')

  /** 高亮項 */
  const selectedEngineKey = engineMode

  /** 已接入網關的授權模型（未接入者不展示） */
  const availableModels = myModels.filter((m) => connectedModels[m.modelKey])

  /** 模型選擇器展示列表：有模型權限但額度阻塞時，展示全部授權模型（不受 connectedModels 限制） */
  const selectorModels = (myModels.length > 0 && blockReason && blockReason !== 'no-models' && blockReason !== 'no-both')
    ? myModels
    : availableModels

  /** 引擎模式下拉：智能路由 + 指定模型兩組；只展示已接入網關的授權模型 */
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
      ],
    },
    {
      type: 'group',
      label: t('home.engineSpecifiedModel'),
      children: selectorModels.length === 0
        ? [{
            key: 'no-models',
            disabled: true,
            label: (
              <div className="home-ai-engine-opt" style={{ opacity: 0.55 }}>
                <span>{t('home.engineNoModels')}</span>
              </div>
            ),
          }]
        : selectorModels.map((model) => ({
            key: connectedModels[model.modelKey] ?? model.modelKey,
            label: (
              <div className="home-ai-engine-opt">
                <strong>{model.modelName}</strong>
                <span>{model.providerName ? `${model.providerName} · ` : ''}{model.modelKey}</span>
              </div>
            ),
          })),
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

  /** 選擇引擎模式 */
  const handleEngineModeSelect: MenuProps['onClick'] = ({ key }) => {
    if (key === 'no-models') {
      message.info(t('home.enginePendingMsg'))
      return
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
                className={`home-ai-engine${aiBlocked ? ' home-ai-engine--blocked' : engineMode !== 'auto' ? ' home-ai-engine--manual' : ''}`}
              >
                <i />
                {engineChipText}
                <DownOutlined className="home-ai-engine-caret" />
              </button>
            </Dropdown>
            {/* 上下文窗口 & 思考模式設定 */}
            {!aiBlocked && (
              <Popover
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                trigger="click"
                placement="bottomRight"
                title={null}
                content={
                  <div className="home-ai-settings-panel">
                    {/* 上下文窗口 */}
                    <div className="home-ai-settings-section">
                      <div className="home-ai-settings-label">{t('home.settingsContextWindow')}</div>
                      <div className="home-ai-settings-options">
                        {contextWindowOptions.map((cw) => (
                          <div
                            key={cw}
                            className={`home-ai-settings-option${contextWindow === cw ? ' active' : ''}`}
                            onClick={() => setContextWindow(cw)}
                          >
                            {formatContextWindow(cw)}
                            {contextWindow === cw && <CheckOutlined className="home-ai-settings-check" />}
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* 思考模式 */}
                    {thinkingAvailable && (
                      <div className="home-ai-settings-section">
                        <div className="home-ai-settings-label-row">
                          <span className="home-ai-settings-label">{t('home.settingsThinkingMode')}</span>
                          <button
                            type="button"
                            className={`home-ai-thinking-toggle${thinkingEnabled ? ' on' : ' off'}`}
                            onClick={() => setThinkingEnabled(!thinkingEnabled)}
                          >
                            <span className="home-ai-thinking-toggle-dot" />
                          </button>
                        </div>
                        {thinkingEnabled && (
                          <div className="home-ai-settings-options">
                            {(['low', 'medium', 'high', 'xhigh', 'max'] as ThinkingDepth[]).map((d) => (
                              <div
                                key={d}
                                className={`home-ai-settings-option${thinkingDepth === d ? ' active' : ''}`}
                                onClick={() => setThinkingDepth(d)}
                              >
                                {t(`home.thinkingDepth${d.charAt(0).toUpperCase() + d.slice(1)}`)}
                                {thinkingDepth === d && <CheckOutlined className="home-ai-settings-check" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                }
              >
                <button
                  type="button"
                  className="home-ai-settings-btn"
                  title={t('home.settingsTitle')}
                >
                  <SettingOutlined />
                </button>
              </Popover>
            )}
          </div>
        </div>

        {/* 額度管理資訊條（獨立行，與模型選擇分行展示） */}
        <div className={`home-ai-infobar${aiBlocked ? ' home-ai-infobar--blocked' : ''}`}>
          {aiBlocked ? (
            <div className="home-ai-infobar-warn">
              <LockOutlined style={{ fontSize: 13 }} />
              <span>{t('home.aiBlockedBadge')} — {t(BLOCKED_DESC_KEY[blockReason])}</span>
            </div>
          ) : (
            <>
              <div className="home-ai-infobar-left" onClick={handleOpenUsage} role="button" tabIndex={0}>
                <DatabaseOutlined style={{ fontSize: 13, color: '#8C8C8C' }} />
                <span className="home-ai-infobar-label">{t('home.aiMyUsage')}</span>
                {infoBarUsedPercent !== null && (
                  <>
                    <Progress
                      percent={infoBarUsedPercent}
                      size="small"
                      showInfo={false}
                      strokeColor={infoBarUsedPercent < 40 ? '#52C41A' : infoBarUsedPercent < 80 ? '#FAAD14' : '#FF4D4F'}
                      style={{ width: 60, margin: '0 2px' }}
                    />
                    <span style={{
                      fontSize: 11, fontWeight: 500,
                      color: infoBarUsedPercent < 40 ? '#52C41A' : infoBarUsedPercent < 80 ? '#FAAD14' : '#FF4D4F',
                      whiteSpace: 'nowrap',
                    }}>
                      ({infoBarUsedPercent === 0 ? `可用100%` : infoBarUsedPercent === 100 ? `已用100%` : `已使用${infoBarUsedPercent}%`})
                    </span>
                  </>
                )}
                {infoBarUsedPercent === null && (
                  <span style={{ fontSize: 11, color: '#BFBFBF' }}>—</span>
                )}
              </div>
              <button
                type="button"
                className="home-ai-infobar-apply"
                onClick={() => navigate('/ai-access-apply?reason=topup')}
              >
                <PlusOutlined style={{ fontSize: 10 }} />
                {t('home.aiApplyMore')}
              </button>
            </>
          )}
        </div>

        {/* 会话标签栏 */}
        <div className="home-ai-tabs">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`home-ai-tab${conv.id === activeConvId ? ' home-ai-tab--active' : ''}`}
              onClick={() => setActiveConvId(conv.id)}
            >
              <MessageOutlined className="home-ai-tab-icon" />
              <span className="home-ai-tab-title">{conv.title}</span>
              {conversations.length > 1 && (
                <button
                  type="button"
                  className="home-ai-tab-close"
                  onClick={(e) => handleDeleteConversation(conv.id, e)}
                >
                  <CloseCircleOutlined />
                </button>
              )}
            </div>
          ))}
          <button type="button" className="home-ai-tab-add" onClick={() => handleCreateConversation()} title={t('home.convNew')}>
            <PlusOutlined />
          </button>
          {conversations.length > 3 && (
            <Popover
              trigger="click"
              title={t('home.convHistory')}
              content={
                <div className="home-ai-history-list">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`home-ai-history-item${conv.id === activeConvId ? ' active' : ''}`}
                      onClick={() => { setActiveConvId(conv.id) }}
                    >
                      <MessageOutlined />
                      <span>{conv.title}</span>
                      <span className="home-ai-history-time">{new Date(conv.updatedAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              }
              placement="bottomRight"
            >
              <button type="button" className="home-ai-tab-history" title={t('home.convHistory')}>
                <HistoryOutlined />
              </button>
            </Popover>
          )}
          {/* 回收站 */}
          <Popover
            trigger="click"
            title={t('home.convTrash')}
            onOpenChange={(open) => { if (open) loadDeletedConversations() }}
            content={
              <div className="home-ai-trash-list">
                {deletedConversations.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('home.convTrashEmpty')} style={{ margin: '12px 0' }} />
                ) : (
                  deletedConversations.map((conv) => (
                    <div key={conv.id} className="home-ai-trash-item">
                      <div className="home-ai-trash-item-info" onClick={() => handleRestoreConversation(conv.id)}>
                        <MessageOutlined />
                        <div className="home-ai-trash-item-text">
                          <span className="home-ai-trash-item-title">{conv.title}</span>
                          <span className="home-ai-trash-item-time">{conv.deletedAt ? new Date(conv.deletedAt).toLocaleDateString() : ''}</span>
                        </div>
                      </div>
                      <div className="home-ai-trash-item-actions">
                        <Tooltip title={t('home.convRestore')}>
                          <button type="button" className="home-ai-trash-restore-btn" onClick={() => handleRestoreConversation(conv.id)}>
                            <UndoOutlined />
                          </button>
                        </Tooltip>
                        <Tooltip title={t('home.convPermanentDelete')}>
                          <button type="button" className="home-ai-trash-delete-btn" onClick={() => handlePermanentDelete(conv.id)}>
                            <DeleteOutlined />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  ))
                )}
              </div>
            }
            placement="bottomRight"
          >
            <button type="button" className="home-ai-tab-trash" title={t('home.convTrash')}>
              <DeleteOutlined />
              {deletedConversations.length > 0 && (
                <span className="home-ai-tab-trash-badge">{deletedConversations.length}</span>
              )}
            </button>
          </Popover>
        </div>

        <div className="home-ai-body">
          {/* 新對話 + 阻塞：顯示引導卡片 */}
          {isEmpty && blockReason ? (
            <div className="home-ai-hero">
              <div className="home-ai-hero-card">
                <div className="home-ai-hero-icon home-ai-hero-icon--blocked">
                  <LockOutlined />
                </div>
                <h4>{t(BLOCKED_TITLE_KEY[blockReason])}</h4>
                <p>{t(BLOCKED_DESC_KEY[blockReason])}</p>
                {blockReason === 'needs-approval' ? (
                  <button type="button" className="home-ai-blocked-action" onClick={() => navigate(`/ai-access-apply?reason=needs-approval`)}>
                    <SendOutlined />
                    {t('home.aiBlockedApplyBtn')}
                  </button>
                ) : (
                  <button type="button" className="home-ai-blocked-action" onClick={() => navigate(`/ai-access-apply?reason=${blockReason}`)}>
                    <WalletOutlined />
                    {t('home.aiBlockedViewUsage')}
                  </button>
                )}
              </div>
            </div>
          ) : isEmpty ? (
            /* 新對話 + 未阻塞：正常 Hero */
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
          ) : (
            /* 歷史對話：無論是否阻塞都顯示消息列表（不遮罩） */
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

        {/* 歷史對話有阻塞卡片時，底部不重複顯示橫幅；無阻塞時顯示快捷提問 */}
        {!isEmpty && !blockReason && (
          <div className="home-ai-quick">
            {quickQuestions.map((q) => (
              <button key={q.text} className="home-ai-quick-btn" onClick={() => handleSend(q.text)}>
                {q.text}
              </button>
            ))}
          </div>
        )}

        {/* 能力展示条 */}
        {!aiBlocked && (
          <div className="home-ai-capabilities">
            {currentCapabilities.text && (
              <Tag className="home-ai-cap-tag home-ai-cap-tag--active" bordered={false}>
                <FileTextOutlined /> {t('home.capText')}
              </Tag>
            )}
            {currentCapabilities.image && (
              <Tag className="home-ai-cap-tag home-ai-cap-tag--active" bordered={false}>
                <PictureOutlined /> {t('home.capImage')}
              </Tag>
            )}
            {currentCapabilities.audio && (
              <Tag className="home-ai-cap-tag home-ai-cap-tag--active" bordered={false}>
                🎤 {t('home.capAudio')}
              </Tag>
            )}
            {currentCapabilities.video && (
              <Tag className="home-ai-cap-tag home-ai-cap-tag--active" bordered={false}>
                🎤 {t('home.capVideo')}
              </Tag>
            )}
            {currentCapabilities.toolCalling && (
              <Tag className="home-ai-cap-tag home-ai-cap-tag--tool" bordered={false}>
                <ThunderboltOutlined /> {t('home.capToolCalling')}
              </Tag>
            )}
            {currentCapabilities.thinking && (
              <Tag className="home-ai-cap-tag home-ai-cap-tag--think" bordered={false}>
                💭 {t('home.capThinking')}
              </Tag>
            )}
          </div>
        )}

        {/* 附件预览区 */}
        {attachments.length > 0 && (
          <div className="home-ai-attachments">
            {attachments.map((att, idx) => (
              <div key={idx} className={`home-ai-attachment home-ai-attachment--${att.type}`}>
                {att.type === 'image' ? (
                  <img src={att.data} alt={att.name} className="home-ai-attachment-preview" />
                ) : (
                  <div className="home-ai-attachment-file">
                    <FileTextOutlined />
                    <span>{att.name}</span>
                  </div>
                )}
                <button type="button" className="home-ai-attachment-remove" onClick={() => removeAttachment(idx)}>
                  <CloseCircleOutlined />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 排队状态提示 */}
        {sending && !isEmpty && !blockReason && (
          <div className="home-ai-queue-status">
            <span className="home-ai-queue-status-dot" />
            <span>{t('home.aiThinking')}</span>
          </div>
        )}

        {/* 排队消息列表 */}
        {messageQueue.length > 0 && (
          <div className="home-ai-queue-list">
            <div className="home-ai-queue-header">
              <span className="home-ai-queue-header-text">{t('home.aiQueueWaiting', { count: messageQueue.length })}</span>
            </div>
            {messageQueue.map((item, idx) => (
              <div key={item.id} className="home-ai-queue-item">
                <span className="home-ai-queue-item-index">{idx + 1}</span>
                <span className="home-ai-queue-item-text">{item.text}</span>
                <button
                  type="button"
                  className="home-ai-queue-item-remove"
                  onClick={() => handleRemoveQueueItem(item.id)}
                  title={t('home.aiQueueRemove')}
                >
                  <CloseCircleOutlined />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 降级模式标识 */}
        {downgradeMode && (
          <div className="home-ai-downgrade-bar">
            <SwapOutlined />
            <span>{t('home.aiDowngradeModeLabel')}</span>
            {quotaCheck?.downgradeModelName && (
              <span className="home-ai-downgrade-bar-model">{quotaCheck.downgradeModelName}</span>
            )}
          </div>
        )}

        {/* 历史对话阻塞提醒条：输入框上方显示，含申请按钮或不可申请提示 */}
        {!isEmpty && blockReason && (
          <div className="home-ai-blocked-reminder">
            <LockOutlined />
            <span className="home-ai-blocked-reminder-text">
              {blockReason === 'quota-exhausted'
                ? t('home.aiQuotaExhaustedReminder')
                : blockReason === 'needs-approval'
                  ? t('home.aiNeedsApprovalReminder')
                  : t('home.aiBlockedReminder')}
            </span>
            {/* 仅 needs-approval 或前端兆底非 quota-exhausted 时显示申请按钮 */}
            {(blockReason === 'needs-approval' || (blockReason !== 'quota-exhausted' && !quotaCheckLoaded)) && (
              <button type="button" className="home-ai-blocked-reminder-btn" onClick={() => navigate(`/ai-access-apply?reason=${blockReason}`)}>
                <SendOutlined />
                {t('home.aiBlockedApplyBtn')}
              </button>
            )}
          </div>
        )}

        {/* 输入区（含拖拽、附件按钮） */}
        <div
          className={`home-ai-input${isDragging ? ' home-ai-input--dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && <div className="home-ai-drag-overlay">{t('home.dragHint')}</div>}
          {(currentCapabilities.file || currentCapabilities.image) && !aiBlocked && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                accept={currentCapabilities.image ? 'image/*,.pdf,.txt,.csv,.json,.md' : '.pdf,.txt,.csv,.json,.md'}
                multiple
                onChange={(e) => { handleFileSelect(e.target.files); e.target.value = '' }}
              />
              <button
                type="button"
                className="home-ai-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                title={t('home.attachFile')}
              >
                <PaperClipOutlined />
              </button>
            </>
          )}
          <Input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPressEnter={() => handleSend()}
            placeholder={aiBlocked ? t('home.aiInputBlocked') : downgradeMode ? t('home.aiInputDowngradePlaceholder') : sending ? t('home.aiInputQueuePlaceholder') : t('home.aiInputPlaceholder')}
            className="home-ai-field"
            disabled={aiBlocked}
          />
          <button
            className="home-ai-send"
            onClick={() => handleSend()}
            disabled={(!inputText.trim() && attachments.length === 0) || aiBlocked}
          >
            <SendOutlined />
          </button>
          {/* 上下文窗口使用率图标 */}
          {!isEmpty && !aiBlocked && (
            <ContextUsageIndicator
              usedTokens={activeConversation?.totalTokens ?? 0}
              contextWindow={contextWindow || undefined}
              onCompress={handleCompressConversation}
              onNewChat={handleCreateConversation}
              t={t}
            />
          )}
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
                        {dim.source !== 'employee' && (
                          <Tooltip title={t('home.usageDimSharedTeamTooltip')}>
                            <span style={{ fontSize: 11, color: '#1890FF', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                              <InfoCircleOutlined />{t('home.usageDimSharedTeamHint')}
                            </span>
                          </Tooltip>
                        )}
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
