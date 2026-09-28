import { useState, useEffect, useCallback } from 'react'
import { Layout, Badge, Popover, message, Tag, Button, Empty, Spin } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  CheckOutlined,
  GiftOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import UserMenu from './UserMenu'
import SystemSwitcher from './SystemSwitcher'
import { useTranslation } from 'react-i18next'
import { PortalLocaleControls } from './PortalTopBar'
import { fetchNotifications, markAllNotificationsRead, type NotificationItem } from '../api/notification'

const { Header } = Layout

interface HeaderBarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function HeaderBar({ collapsed, onToggle }: HeaderBarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /* ==================== 通知系統（真實 API） ==================== */

  /** 通知列表（從 API 獲取） */
  const [notifItems, setNotifItems] = useState<NotificationItem[]>([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  /** 全部已讀狀態 */
  const [allRead, setAllRead] = useState(false)

  /** 加载通知 */
  const loadNotifications = useCallback(async () => {
    setNotifLoading(true)
    try {
      const result = await fetchNotifications()
      setNotifItems(result.items)
      setUnreadCount(allRead ? 0 : result.unreadCount)
    } catch {
      // 靜默失敗：通知加載不應影響主流程
    } finally {
      setNotifLoading(false)
    }
  }, [allRead])

  /** 組件掛載時獲取通知 */
  useEffect(() => { loadNotifications() }, [loadNotifications])

  /** 全部已讀 */
  const handleMarkAllRead = async () => {
    setAllRead(true)
    setUnreadCount(0)
    try {
      await markAllNotificationsRead()
    } catch { /* 靜默 */ }
    message.success(t('header.markAllReadSuccess'))
  }

  /** 通知類型圖標映射（可擴展更多類型） */
  const notifIconMap: Record<string, { icon: React.ReactNode; color: string; tag: string; tagColor: string; borderColor: string; bgColor: string }> = {
    gift_expire: {
      icon: <GiftOutlined />,
      color: '#E8720C',
      tag: '贈送到期',
      tagColor: 'warning',
      borderColor: '#FFA000',
      bgColor: '#FFF8E1',
    },
    // 後續可擴展更多通知類型:
    // approval_pending: { icon: <FileTextOutlined />, color: '#1890FF', tag: '審批待辦', ... },
    // recharge_alert: { icon: <DollarOutlined />, color: '#52C41A', tag: '充值提醒', ... },
  }

  /** 通知面板 */
  const notificationContent = (
    <div className="header-notification-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 8px' }}>
        <div className="header-notification-title" style={{ marginBottom: 0 }}>{t('header.notifications')}</div>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={handleMarkAllRead}
            style={{ fontSize: 12, color: '#E8720C', padding: '0 4px', height: 24 }}
          >
            {t('header.markAllRead')}
          </Button>
        )}
      </div>
      {notifLoading ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin size="small" />
        </div>
      ) : notifItems.length === 0 ? (
        <Empty description={t('header.noNotifications')} image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: '16px 0' }} />
      ) : (
        notifItems.map(item => {
          const typeStyle = notifIconMap[item.type] || notifIconMap.gift_expire
          return (
            <div
              key={item.id}
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid #f5f5f5',
                cursor: 'pointer',
                borderLeft: `3px solid ${allRead ? '#D9D9D9' : typeStyle.borderColor}`,
                background: allRead ? '#FAFAFA' : typeStyle.bgColor,
                transition: 'background 0.15s',
                opacity: allRead ? 0.6 : 1,
              }}
              onMouseEnter={e => { if (!allRead) e.currentTarget.style.background = '#FFF3CD' }}
              onMouseLeave={e => { if (!allRead) e.currentTarget.style.background = typeStyle.bgColor }}
              onClick={() => {
                // 点击赠送到期通知跳转到推广赠送菜单
                if (item.type === 'gift_expire' && item.storeId) {
                  navigate(`/gift-detail-view?storeId=${item.storeId}&adType=${item.adType}`)
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ color: allRead ? '#BFBFBF' : typeStyle.color, fontSize: 13 }}>{typeStyle.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: allRead ? '#8C8C8C' : '#E65100' }}>{item.title}</span>
              </div>
              <div style={{ fontSize: 12, color: allRead ? '#BFBFBF' : '#595959', lineHeight: 1.6, marginBottom: 4 }}>{item.content}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {item.createdAt && (
                  <span style={{ fontSize: 11, color: '#BFBFBF' }}>
                    {item.createdAt.replace('T', ' ').slice(0, 16)}
                  </span>
                )}
                <Tag color={allRead ? 'default' : typeStyle.tagColor} style={{ fontSize: 10, margin: 0, lineHeight: '16px', padding: '0 4px' }}>{typeStyle.tag}</Tag>
              </div>
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <Header className="header-bar">
      <div className="header-left">
        <span className="trigger-icon" onClick={onToggle}>
          {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </span>
        <SystemSwitcher />
      </div>
      <div className="header-right">
        <PortalLocaleControls />

        {/* 通知铃铛 */}
        <Popover
          content={notificationContent}
          trigger="click"
          placement="bottomRight"
          overlayClassName="header-notification-popover"
        >
          <Badge count={unreadCount} size="small" offset={[-2, 4]}>
            <span className="header-bell">
              <BellOutlined />
            </span>
          </Badge>
        </Popover>

        {/* 用户头像+下拉（与企业门户顶栏同一份实现） */}
        <UserMenu />
      </div>
    </Header>
  )
}
