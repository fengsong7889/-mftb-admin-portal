import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Empty, Tooltip } from 'antd'
import { useTranslation } from 'react-i18next'
import {
  SearchOutlined,
  StarFilled,
  StarOutlined,
  AccountBookOutlined,
  SwapOutlined,
  ScissorOutlined,
  GiftOutlined,
  MergeCellsOutlined,
  RobotOutlined,
  DollarOutlined,
  BankOutlined,
  TeamOutlined,
  ScheduleOutlined,
  ThunderboltOutlined,
  ShoppingCartOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons'
import './index.css'

const FAVORITES_STORAGE_KEY = 'process_center_favorites'

/** 单个流程定义 */
interface ProcessItem {
  key: string
  name: string
  description: string
  icon: React.ReactNode
  route: string
  enabled: boolean
  categoryColor: string
}

/** 流程分类 */
interface ProcessCategory {
  key: string
  name: string
  icon: React.ReactNode
  color: string
  processes: Omit<ProcessItem, 'categoryColor'>[]
}

/** 全部流程目录（Phase 1 前端硬编码） */
const PROCESS_CATALOG: ProcessCategory[] = [
  {
    key: 'finance',
    name: 'processCenter.catFinance',
    icon: <DollarOutlined />,
    color: '#E8720C',
    processes: [
      {
        key: 'recharge',
        name: 'processCenter.procRecharge',
        description: 'processCenter.procRechargeDesc',
        icon: <AccountBookOutlined />,
        route: '/recharge-add?from=process-center',
        enabled: true,
      },
      {
        key: 'transfer',
        name: 'processCenter.procTransfer',
        description: 'processCenter.procTransferDesc',
        icon: <SwapOutlined />,
        route: '/transfer-add?from=process-center',
        enabled: true,
      },
      {
        key: 'deduct',
        name: 'processCenter.procDeduct',
        description: 'processCenter.procDeductDesc',
        icon: <ScissorOutlined />,
        route: '/deduct-add?from=process-center',
        enabled: true,
      },
      {
        key: 'gift',
        name: 'processCenter.procGift',
        description: 'processCenter.procGiftDesc',
        icon: <GiftOutlined />,
        route: '/gift-add?from=process-center',
        enabled: true,
      },
      {
        key: 'merge',
        name: 'processCenter.procMerge',
        description: 'processCenter.procMergeDesc',
        icon: <MergeCellsOutlined />,
        route: '/merge-add?from=process-center',
        enabled: true,
      },
    ],
  },
  {
    key: 'ai',
    name: 'processCenter.catAI',
    icon: <RobotOutlined />,
    color: '#1890FF',
    processes: [
      {
        key: 'ai_access',
        name: 'processCenter.procAiAccess',
        description: 'processCenter.procAiAccessDesc',
        icon: <RobotOutlined />,
        route: '/ai-access-apply',
        enabled: true,
      },
    ],
  },
  {
    key: 'admin',
    name: 'processCenter.catAdmin',
    icon: <BankOutlined />,
    color: '#722ED1',
    processes: [
      {
        key: 'procurement',
        name: 'processCenter.procProcurement',
        description: 'processCenter.procProcurementDesc',
        icon: <ShoppingCartOutlined />,
        route: '/oa-purchase-request',
        enabled: true,
      },
    ],
  },
  {
    key: 'hr',
    name: 'processCenter.catHR',
    icon: <TeamOutlined />,
    color: '#52C41A',
    processes: [
      {
        key: 'leave',
        name: 'processCenter.procLeave',
        description: 'processCenter.procLeaveDesc',
        icon: <ScheduleOutlined />,
        route: '',
        enabled: false,
      },
      {
        key: 'overtime',
        name: 'processCenter.procOvertime',
        description: 'processCenter.procOvertimeDesc',
        icon: <ScheduleOutlined />,
        route: '',
        enabled: false,
      },
    ],
  },
]

/** 将目录展平为带 categoryColor 的流程列表 */
function flattenProcesses(): ProcessItem[] {
  return PROCESS_CATALOG.flatMap((cat) =>
    cat.processes.map((p) => ({ ...p, categoryColor: cat.color })),
  )
}

/** 读取 localStorage 中的常用流程 key 列表 */
function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 写入常用流程 key 列表 */
function saveFavorites(keys: string[]) {
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(keys))
}

export default function ProcessCenter() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites())
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('process_center_collapsed')
      return raw ? new Set(JSON.parse(raw)) : new Set<string>()
    } catch { return new Set<string>() }
  })

  const allProcesses = useMemo(() => flattenProcesses(), [])

  /** 根据搜索关键词过滤流程目录 */
  const filteredCatalog = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    if (!kw) return PROCESS_CATALOG

    return PROCESS_CATALOG.map((cat) => ({
      ...cat,
      processes: cat.processes.filter(
        (p) =>
          t(p.name).toLowerCase().includes(kw) ||
          t(p.description).toLowerCase().includes(kw),
      ),
    })).filter((cat) => cat.processes.length > 0)
  }, [keyword, t])

  /** 常用流程列表（按收藏顺序） */
  const favoriteProcesses = useMemo(() => {
    return favorites
      .map((key) => allProcesses.find((p) => p.key === key))
      .filter((p): p is ProcessItem => !!p && p.enabled)
  }, [favorites, allProcesses])

  /** 切换收藏状态 */
  const toggleFavorite = useCallback(
    (procKey: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setFavorites((prev) => {
        const next = prev.includes(procKey)
          ? prev.filter((k) => k !== procKey)
          : [...prev, procKey]
        saveFavorites(next)
        return next
      })
    },
    [],
  )

  const handleProcessClick = (proc: ProcessItem) => {
    if (!proc.enabled || !proc.route) return
    navigate(proc.route)
  }

  const isFavorite = (key: string) => favorites.includes(key)

  /** 切換分類折疊 */
  const toggleCollapse = (catKey: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(catKey)) {
        next.delete(catKey)
      } else {
        next.add(catKey)
      }
      localStorage.setItem('process_center_collapsed', JSON.stringify([...next]))
      return next
    })
  }

  return (
    <div className="content-area process-center">
      {/* 顶部搜索 */}
      <div className="process-center-header">
        <div className="process-center-title">{t('processCenter.pageTitle')}</div>
        <div className="process-center-subtitle">{t('processCenter.pageSubtitle')}</div>
        <div className="process-center-search">
          <Input
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder={t('processCenter.searchPlaceholder')}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            style={{ maxWidth: 400 }}
          />
        </div>
      </div>

      {/* 常用审批流程 */}
      {favoriteProcesses.length > 0 && !keyword.trim() && (
        <div className="process-favorites">
          <div className="process-favorites-header">
            <span className="process-favorites-icon"><ThunderboltOutlined /></span>
            <span className="process-favorites-name">{t('processCenter.favoritesTitle')}</span>
          </div>
          <div className="process-favorites-grid">
            {favoriteProcesses.map((proc) => (
              <div
                key={proc.key}
                className="process-card process-card-favorite"
                onClick={() => handleProcessClick(proc)}
              >
                <div
                  className="process-card-icon"
                  style={{
                    background: `${proc.categoryColor}10`,
                    color: proc.categoryColor,
                  }}
                >
                  {proc.icon}
                </div>
                <div className="process-card-info">
                  <div className="process-card-name">{t(proc.name)}</div>
                  <div className="process-card-desc">{t(proc.description)}</div>
                </div>
                <Tooltip title={t('processCenter.unpin')}>
                  <span
                    className="process-card-star"
                    onClick={(e) => toggleFavorite(proc.key, e)}
                  >
                    <StarFilled style={{ color: '#faad14' }} />
                  </span>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 流程目录 */}
      {filteredCatalog.length === 0 ? (
        <Empty description={t('processCenter.noResult')} style={{ marginTop: 80 }} />
      ) : (
        <div className="process-center-body">
          {filteredCatalog.map((cat) => (
            <div className="process-category" key={cat.key}>
              <div
                className="process-category-header"
                onClick={() => toggleCollapse(cat.key)}
                style={{ cursor: 'pointer' }}
              >
                <span
                  className="process-category-icon"
                  style={{ background: cat.color }}
                >
                  {cat.icon}
                </span>
                <span className="process-category-name">{t(cat.name)}</span>
                <span className="process-category-count">{cat.processes.length}</span>
                <span className="process-category-toggle">
                  {collapsedKeys.has(cat.key)
                    ? <RightOutlined style={{ fontSize: 11 }} />
                    : <DownOutlined style={{ fontSize: 11 }} />
                  }
                </span>
              </div>
              {!collapsedKeys.has(cat.key) && (
              <div className="process-category-grid">
                {cat.processes.map((proc) => {
                  const fullProc: ProcessItem = { ...proc, categoryColor: cat.color }
                  const fav = isFavorite(proc.key)
                  return (
                    <div
                      key={proc.key}
                      className={`process-card${!proc.enabled ? ' process-card-disabled' : ''}`}
                      onClick={() => handleProcessClick(fullProc)}
                    >
                      <div
                        className="process-card-icon"
                        style={{
                          background: proc.enabled
                            ? `${cat.color}10`
                            : '#f5f5f5',
                          color: proc.enabled ? cat.color : '#bfbfbf',
                        }}
                      >
                        {proc.icon}
                      </div>
                      <div className="process-card-info">
                        <div className="process-card-name">{t(proc.name)}</div>
                        <div className="process-card-desc">{t(proc.description)}</div>
                      </div>
                      {proc.enabled ? (
                        <Tooltip title={fav ? t('processCenter.unpin') : t('processCenter.pin')}>
                          <span
                            className="process-card-star"
                            onClick={(e) => toggleFavorite(proc.key, e)}
                          >
                            {fav
                              ? <StarFilled style={{ color: '#faad14' }} />
                              : <StarOutlined style={{ color: '#d9d9d9' }} />
                            }
                          </span>
                        </Tooltip>
                      ) : (
                        <span className="process-card-badge">{t('processCenter.comingSoon')}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
