import { useState, useEffect, useRef } from 'react'
import { Input, Button, Tag, Empty, Card, Tabs } from 'antd'
import { useNavigate } from 'react-router-dom'
import { Line, Column, Area } from '@ant-design/charts'
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
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  FontSizeOutlined,
  LineChartOutlined,
  ShoppingOutlined,
  UserAddOutlined,
  RiseOutlined,
  NotificationOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import './index.css'

const { TabPane } = Tabs

/** 励志语句库 */
const motivationalQuotes = [
  '每一天都是新的开始,加油!💪',
  '努力工作,快乐生活!✨',
  '保持热爱,奔赴山海!🌊',
  '你的努力,终将成就更好的自己!🌟',
  '不忘初心,方得始终!💫',
  '越努力,越幸运!🍀',
  '今天流下的汗水,是明天成功的基石!🏆',
  '脚踏实地,仰望星空!🌠',
  '坚持不懈,梦想终会实现!🎯',
  '用心做好每一件事,成功自然水到渠成!💎',
]

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
]

/** 默认常用菜单 */
const defaultFavorites = [
  'account-balance',
  'batch-query',
  'detail-query',
  'approval-center',
  'hint-config',
  'hot-search-config',
  'word-segmentation',
  'hint-report',
  'hot-search-report',
]

/** 待办事项 */
const todoItems = [
  { id: 1, title: '推廣金充值申請審批', count: 3, type: 'warning' as const },
  { id: 2, title: '推廣金扣款申請審批', count: 5, type: 'info' as const },
  { id: 3, title: '推廣金轉賬申請審批', count: 2, type: 'info' as const },
  { id: 4, title: '商戶合併申請審批', count: 1, type: 'error' as const },
]

/** 系统通知 */
const notifications = [
  { id: 1, title: '用戶管理菜單新增日志查看通知', desc: '用戶管理功能增強,支持操作日志查看', time: '1小時前', read: false },
  { id: 2, title: '權限管理支持授權多個國家數據權限通知', desc: '權限管理模塊升級,支持多國家數據權限配置', time: '3小時前', read: false },
  { id: 3, title: '運營培訓會議事項', desc: '本週五下午3點運營培訓會議,請準時參加', time: '1天前', read: true },
  { id: 4, title: '新增廣告無敵星星上線通知', desc: '新廣告形式無敵星星已上線,歡迎體驗', time: '2天前', read: true },
]

/** 系统公告 */
const announcements = [
  { id: 1, title: '12月績效數據公佈告知', desc: '12月績效考核數據已公佈,請查看', time: '2天前', read: false },
  { id: 2, title: '團購策略調整公佈', desc: '團購業務策略調整方案已發佈,請相關人員查收', time: '3天前', read: true },
  { id: 3, title: '電信新用戶推廣策略公佈', desc: '電信渠道新用戶推廣策略已更新', time: '5天前', read: true },
]

/** 订单趋势数据 */
const orderTrendData = [
  { date: '06-17', delivery: 120, groupBuy: 45, supermarket: 38 },
  { date: '06-18', delivery: 132, groupBuy: 52, supermarket: 42 },
  { date: '06-19', delivery: 101, groupBuy: 48, supermarket: 35 },
  { date: '06-20', delivery: 134, groupBuy: 58, supermarket: 45 },
  { date: '06-21', delivery: 90, groupBuy: 40, supermarket: 32 },
  { date: '06-22', delivery: 150, groupBuy: 62, supermarket: 50 },
  { date: '06-23', delivery: 165, groupBuy: 68, supermarket: 55 },
]

/** 充值趋势数据 */
const rechargeTrendData = [
  { date: '06-17', amount: 12000 },
  { date: '06-18', amount: 15000 },
  { date: '06-19', amount: 8000 },
  { date: '06-20', amount: 22000 },
  { date: '06-21', amount: 18000 },
  { date: '06-22', amount: 25000 },
  { date: '06-23', amount: 28000 },
]

/** 用户增长数据 */
const userGrowthData = [
  { date: '06-17', users: 85 },
  { date: '06-18', users: 92 },
  { date: '06-19', users: 78 },
  { date: '06-20', users: 105 },
  { date: '06-21', users: 95 },
  { date: '06-22', users: 118 },
  { date: '06-23', users: 135 },
]

export default function Home() {
  const navigate = useNavigate()
  const [searchText, setSearchText] = useState('')
  const [favorites, setFavorites] = useState<string[]>(defaultFavorites)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [quote, setQuote] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const randomIndex = Math.floor(Math.random() * motivationalQuotes.length)
    setQuote(motivationalQuotes[randomIndex])

    timerRef.current = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const formatDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${year}年${month}月${day}日 ${hours}:${minutes}:${seconds}`
  }

  const getWeekday = (date: Date) => {
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
    return weekdays[date.getDay()]
  }

  const filteredMenus = searchText
    ? allMenus.filter((m) => m.label.includes(searchText) || m.group.includes(searchText))
    : []

  const addFavorite = (key: string) => {
    if (!favorites.includes(key)) {
      setFavorites([...favorites, key])
    }
    setShowAddMenu(false)
    setSearchText('')
  }

  const removeFavorite = (key: string) => {
    setFavorites(favorites.filter((k) => k !== key))
  }

  const getMenuInfo = (key: string) => allMenus.find((m) => m.key === key)

  const getLineData = () => {
    const result: any[] = []
    orderTrendData.forEach(item => {
      result.push({ date: item.date, value: item.delivery, type: '外賣訂單' })
      result.push({ date: item.date, value: item.groupBuy, type: '團購訂單' })
      result.push({ date: item.date, value: item.supermarket, type: '超市訂單' })
    })
    return result
  }

  const lineConfig = {
    data: getLineData(),
    xField: 'date',
    yField: 'value',
    seriesField: 'type',
    smooth: true,
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
    legend: {
      position: 'top' as const,
    },
  }

  const columnConfig = {
    data: rechargeTrendData,
    xField: 'date',
    yField: 'amount',
    label: {
      position: 'middle' as const,
      style: {
        fill: '#FFFFFF',
        opacity: 0.6,
      },
    },
    xAxis: {
      label: {
        autoHide: true,
        autoRotate: false,
      },
    },
  }

  const areaConfig = {
    data: userGrowthData,
    xField: 'date',
    yField: 'users',
    smooth: true,
    areaStyle: {
      fill: 'l(270) 0:#001529 0.5:#1890ff 1:#1890ff',
    },
    line: {
      style: {
        stroke: '#1890ff',
        lineWidth: 2,
      },
    },
  }

  return (
    <div className="home-page">
      {/* 欢迎横幅 */}
      <div className="home-welcome home-welcome--orange">
        <div className="home-welcome-left">
          <h2>歡迎回來,小蜜蜂</h2>
          <p className="home-welcome-quote">{quote}</p>
        </div>
        <div className="home-welcome-right">
          <div className="home-welcome-datetime">{formatDate(currentTime)}</div>
          <div className="home-welcome-weekday">{getWeekday(currentTime)}</div>
        </div>
      </div>

      {/* 个人工作台和待办事项 */}
      <div className="home-workspace-todo-grid">
        {/* 个人工作台 */}
        <div className="home-section">
          <div className="home-section-header">
            <h3>📋 個人工作台</h3>
          </div>
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
              <Empty description="暫無常用菜單,請通過搜索添加" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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

        {/* 待办事项 */}
        <div className="home-section">
          <div className="home-section-header">
            <h3>📌 待辦事項</h3>
            <Tag color="red">{todoItems.reduce((s, t) => s + t.count, 0)}</Tag>
          </div>
          <div className="home-todo-list">
            {todoItems.map((item) => (
              <div 
                key={item.id} 
                className="home-todo-item"
                onClick={() => navigate('/approval-center')}
                style={{ cursor: 'pointer' }}
              >
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
      </div>

      {/* 数据统计卡片和通知区域 */}
      <div className="home-stats-grid">
        {/* 左侧：三个统计卡片 */}
        <div className="home-stats-cards">
          {/* 订单数据卡片 - 横向布局 */}
          <Card className="home-stat-card" hoverable>
            <div className="home-stat-header">
              <ShoppingOutlined className="home-stat-icon" style={{ color: '#1890ff' }} />
              <span className="home-stat-title">今日訂單</span>
            </div>
            <div className="home-stat-content home-stat-content--horizontal">
              <div className="home-stat-item">
                <div className="home-stat-label">外賣訂單</div>
                <div className="home-stat-value" style={{ color: '#1890ff' }}>165</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +12%
                </div>
              </div>
              <div className="home-stat-divider" />
              <div className="home-stat-item">
                <div className="home-stat-label">團購訂單</div>
                <div className="home-stat-value" style={{ color: '#722ed1' }}>68</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +8%
                </div>
              </div>
              <div className="home-stat-divider" />
              <div className="home-stat-item">
                <div className="home-stat-label">超市訂單</div>
                <div className="home-stat-value" style={{ color: '#fa8c16' }}>55</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +15%
                </div>
              </div>
            </div>
          </Card>

          {/* 新用户统计卡片 */}
          <Card className="home-stat-card" hoverable>
            <div className="home-stat-header">
              <UserAddOutlined className="home-stat-icon" style={{ color: '#52c41a' }} />
              <span className="home-stat-title">今日新用戶</span>
            </div>
            <div className="home-stat-content home-stat-content--single">
              <div className="home-stat-item">
                <div className="home-stat-label">新增用戶</div>
                <div className="home-stat-value" style={{ color: '#52c41a', fontSize: 26 }}>135</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +18% 較昨日
                </div>
              </div>
            </div>
          </Card>

          {/* 推广金统计卡片 */}
          <Card className="home-stat-card" hoverable>
            <div className="home-stat-header">
              <WalletOutlined className="home-stat-icon" style={{ color: '#faad14' }} />
              <span className="home-stat-title">推廣金充值</span>
            </div>
            <div className="home-stat-content home-stat-content--single">
              <div className="home-stat-item">
                <div className="home-stat-label">今日充值</div>
                <div className="home-stat-value" style={{ color: '#faad14', fontSize: 24 }}>MOP 28,000</div>
                <div className="home-stat-trend">
                  <RiseOutlined style={{ color: '#52c41a' }} /> +22% 較昨日
                </div>
                <div className="home-stat-extra">充值筆數:12 筆</div>
              </div>
            </div>
          </Card>
        </div>

        {/* 右侧：系统通知和公告 */}
        <Card className="home-notification-card-compact">
          <Tabs defaultActiveKey="1" size="small">
            <TabPane tab={<span><NotificationOutlined />通知</span>} key="1">
              <div className="home-notification-list-compact">
                {notifications.slice(0, 3).map((n) => (
                  <div key={n.id} className={`home-notification-item-compact ${n.read ? '' : 'unread'}`}>
                    <div className="home-notification-title-compact">
                      {!n.read && <span className="home-notification-dot" />}
                      {n.title}
                    </div>
                    <div className="home-notification-time-compact">{n.time}</div>
                  </div>
                ))}
              </div>
            </TabPane>
            <TabPane tab={<span><BulbOutlined />公告</span>} key="2">
              <div className="home-notification-list-compact">
                {announcements.slice(0, 3).map((n) => (
                  <div key={n.id} className={`home-notification-item-compact ${n.read ? '' : 'unread'}`}>
                    <div className="home-notification-title-compact">
                      {!n.read && <span className="home-notification-dot" />}
                      {n.title}
                    </div>
                    <div className="home-notification-time-compact">{n.time}</div>
                  </div>
                ))}
              </div>
            </TabPane>
          </Tabs>
        </Card>
      </div>

      {/* 数据图表区域 - 并排展示 */}
      <div className="home-charts-grid">
        <Card title="訂單趨勢(近7天)" className="home-chart-card">
          <Line {...lineConfig} height={300} />
        </Card>
        <Card title="充值趨勢(近7天)" className="home-chart-card">
          <Column {...columnConfig} height={300} />
        </Card>
      </div>
    </div>
  )
}
