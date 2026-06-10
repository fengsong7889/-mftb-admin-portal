import { useState, useEffect, useRef } from 'react'
import { Input, Button, Tag, Empty } from 'antd'
import { useNavigate } from 'react-router-dom'
import {
  SearchOutlined,
  PlusOutlined,
  DeleteOutlined,
  AccountBookOutlined,
  SearchOutlined as SearchIcon,
  FileSearchOutlined,
  SwapOutlined,
  AuditOutlined,
  FundOutlined,
  WalletOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  FireOutlined,
  ClockCircleOutlined,
  BellOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FontSizeOutlined,
  LineChartOutlined,
  AimOutlined,
  ReadOutlined,
} from '@ant-design/icons'

/** 励志语句库 */
const motivationalQuotes = [
  '每一天都是新的开始，加油！💪',
  '努力工作，快乐生活！✨',
  '保持热爱，奔赴山海！🌊',
  '你的努力，终将成就更好的自己！🌟',
  '不忘初心，方得始终！💫',
  '越努力，越幸运！🍀',
  '今天流下的汗水，是明天成功的基石！🏆',
  '脚踏实地，仰望星空！🌠',
  '坚持不懈，梦想终会实现！🎯',
  '用心做好每一件事，成功自然水到渠成！💎',
]

/** 所有可用菜单 */
const allMenus = [
  // 财务管理 - 推广金管理
  { key: 'account-balance', label: '賬戶餘額', icon: <AccountBookOutlined />, path: '/account-balance', group: '推廣金管理' },
  { key: 'batch-query', label: '批次查詢', icon: <SearchOutlined />, path: '/batch-query', group: '推廣金管理' },
  { key: 'detail-query', label: '明細查詢', icon: <FileSearchOutlined />, path: '/detail-query', group: '推廣金管理' },
  // 财务管理 - 商户通对账
  { key: 'writeoff-reconcile', label: '充消對賬', icon: <AuditOutlined />, path: '/writeoff-reconcile', group: '商戶通對賬' },
  { key: 'debt-reconcile', label: '欠款對賬', icon: <CheckCircleOutlined />, path: '/debt-reconcile', group: '商戶通對賬' },
  // 财务管理 - 审批管理
  { key: 'approval-center', label: '審批中心', icon: <AuditOutlined />, path: '/approval-center', group: '審批管理' },
  // 搜索管理 - 搜索配置
  { key: 'search-config', label: '搜索配置', icon: <SearchOutlined />, path: '/search-config', group: '搜索配置' },
  // 搜索管理 - 搜索引导
  { key: 'hint-config', label: '底紋配置', icon: <FontSizeOutlined />, path: '/hint-config', group: '搜索引导' },
  { key: 'hot-search-config', label: '熱搜配置', icon: <FireOutlined />, path: '/hot-search-config', group: '搜索引导' },
  // 搜索管理 - 搜索词库
  { key: 'word-segmentation', label: '分詞管理', icon: <DatabaseOutlined />, path: '/word-segmentation', group: '搜索词库' },
  { key: 'synonym-config', label: '同義詞配置', icon: <SwapOutlined />, path: '/synonym-config', group: '搜索词库' },
  { key: 'hot-search-library', label: '熱搜詞庫', icon: <FireOutlined />, path: '/hot-search-library', group: '搜索词库' },
  // 搜索管理 - 报表统计
  { key: 'hint-report', label: '底紋報表', icon: <LineChartOutlined />, path: '/hint-report', group: '報表統計' },
  { key: 'hot-search-report', label: '熱搜報表', icon: <LineChartOutlined />, path: '/hot-search-report', group: '報表統計' },
]

/** 默认常用菜单（2排，每排5个，第二排最后一个是添加按钮） */
const defaultFavorites = [
  // 第一排：推广金管理
  'account-balance',    // 账户余额
  'batch-query',        // 批次查询
  'detail-query',       // 明细查询
  'approval-center',    // 审批中心
  'hint-config',        // 底纹配置
  // 第二排：其他常用功能
  'hot-search-config',  // 热搜配置
  'word-segmentation',  // 分词管理
  'hint-report',        // 底纹报表
  'hot-search-report',  // 热搜报表
]

/** 待办事项 */
const todoItems = [
  { id: 1, title: '審批流程待處理', count: 3, type: 'warning' as const },
  { id: 2, title: '充值申請待審批', count: 5, type: 'info' as const },
  { id: 3, title: '欠款賬單待結清', count: 12, type: 'error' as const },
]

/** 系统通知 */
const notifications = [
  { id: 1, title: '系統維護通知', desc: '2026-06-10 凌晨 2:00-4:00 進行系統升級', time: '1小時前', read: false },
  { id: 2, title: '新功能上線', desc: '推廣金充值功能已支持批量操作', time: '3小時前', read: false },
  { id: 3, title: '數據導出優化', desc: '大數據量導出性能提升50%', time: '1天前', read: true },
]

export default function Home() {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [favorites, setFavorites] = useState<string[]>(defaultFavorites)
  const [showAddMenu, setShowAddMenu] = useState(false)
  
  /** 励志语句 */
  const [quote, setQuote] = useState('')
  
  /** 动态时间 */
  const [currentTime, setCurrentTime] = useState(new Date())
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  /** 初始化励志语句和定时器 */
  useEffect(() => {
    // 随机选择一条励志语句
    const randomIndex = Math.floor(Math.random() * motivationalQuotes.length)
    setQuote(motivationalQuotes[randomIndex])

    // 每秒更新时间
    timerRef.current = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  /** 格式化时间 */
  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`
  }

  /** 获取星期 */
  const getWeekday = (date: Date) => {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    return weekdays[date.getDay()]
  }

  /** 搜索过滤菜单 */
  const filteredMenus = searchText
    ? allMenus.filter((m) => m.label.includes(searchText) || m.group.includes(searchText))
    : []

  /** 添加常用菜单 */
  const addFavorite = (key: string) => {
    if (!favorites.includes(key)) {
      setFavorites([...favorites, key])
    }
    setShowAddMenu(false)
    setSearchText('')
  }

  /** 移除常用菜单 */
  const removeFavorite = (key: string) => {
    setFavorites(favorites.filter((k) => k !== key))
  }

  /** 获取菜单信息 */
  const getMenuInfo = (key: string) => allMenus.find((m) => m.key === key)

  return (
    <div className="home-page">
      {/* 欢迎横幅 */}
      <div className="home-welcome home-welcome--orange">
        <div className="home-welcome-left">
          <h2>歡迎回來，小蜜蜂</h2>
          <p className="home-welcome-quote">{quote}</p>
        </div>
        <div className="home-welcome-right">
          <div className="home-welcome-datetime">{formatDate(currentTime)}</div>
          <div className="home-welcome-weekday">{getWeekday(currentTime)}</div>
        </div>
      </div>

      {/* 个人工作台 - 独占一行 + 搜索框 */}
      <div className="home-section home-section--fullwidth">
        <div className="home-section-header">
          <h3>📋 個人工作台</h3>
        </div>
        {/* 搜索框并入个人工作台 */}
        <div className="home-workspace-search">
          <Input
            prefix={<SearchOutlined style={{ color: '#999', fontSize: 14 }} />}
            placeholder="搜索系統菜單..."
            size="middle"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onFocus={() => setShowAddMenu(true)}
            allowClear
            className="home-search-input home-search-input--compact"
          />
          {showAddMenu && searchText && filteredMenus.length > 0 && (
            <div className="home-search-dropdown">
              {filteredMenus.map((menu) => (
                <div
                  key={menu.key}
                  className={`home-search-item ${favorites.includes(menu.key) ? 'is-added' : ''}`}
                  onClick={() => !favorites.includes(menu.key) && addFavorite(menu.key)}
                >
                  <span className="home-search-item-icon">{menu.icon}</span>
                  <span className="home-search-item-label">{menu.label}</span>
                  <Tag>{menu.group}</Tag>
                  {favorites.includes(menu.key) ? (
                    <span className="home-search-item-added">已添加</span>
                  ) : (
                    <PlusOutlined className="home-search-item-add" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="home-favorites home-favorites--compact">
          {favorites.length === 0 ? (
            <Empty description="暫無常用菜單，請通過搜索添加" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            favorites.map((key) => {
              const menu = getMenuInfo(key)
              if (!menu) return null
              return (
                <div
                  key={key}
                  className="home-fav-card home-fav-card--compact"
                  onClick={() => navigate(menu.path)}
                >
                  <div className="home-fav-icon">{menu.icon}</div>
                  <span className="home-fav-label">{menu.label}</span>
                  <button
                    className="home-fav-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFavorite(key)
                    }}
                  >
                    <DeleteOutlined />
                  </button>
                </div>
              )
            })
          )}
          <div className="home-fav-add home-fav-add--compact" onClick={() => setShowAddMenu(true)}>
            <PlusOutlined style={{ fontSize: 20, color: '#B0B0B0' }} />
            <span>添加菜單</span>
          </div>
        </div>
      </div>

      <div className="home-grid">
        {/* 待办事项 - 移到今日概览位置 */}
        <div className="home-section">
          <div className="home-section-header">
            <h3>📌 待辦事項</h3>
            <Tag color="red">{todoItems.reduce((s, t) => s + t.count, 0)}</Tag>
          </div>
          <div className="home-todo-list">
            {todoItems.map((item) => (
              <div key={item.id} className="home-todo-item">
                <div className="home-todo-left">
                  {item.type === 'error' && <ExclamationCircleOutlined style={{ color: '#E53935' }} />}
                  {item.type === 'warning' && <ClockCircleOutlined style={{ color: '#E8720C' }} />}
                  {item.type === 'info' && <CheckCircleOutlined style={{ color: '#1976D2' }} />}
                  <span>{item.title}</span>
                </div>
                <Tag color={item.type === 'error' ? 'red' : item.type === 'warning' ? 'orange' : 'blue'}>
                  {item.count}
                </Tag>
              </div>
            ))}
          </div>
        </div>

        {/* 系统通知 */}
        <div className="home-section">
          <div className="home-section-header">
            <h3>🔔 系統通知</h3>
            <Tag>{notifications.filter((n) => !n.read).length} 條未讀</Tag>
          </div>
          <div className="home-notification-list">
            {notifications.map((n) => (
              <div key={n.id} className={`home-notification-item ${n.read ? '' : 'unread'}`}>
                <div className="home-notification-title">
                  {!n.read && <span className="home-notification-dot" />}
                  {n.title}
                </div>
                <div className="home-notification-desc">{n.desc}</div>
                <div className="home-notification-time">{n.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
