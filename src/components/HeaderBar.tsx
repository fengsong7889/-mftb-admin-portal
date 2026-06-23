import { useState, useEffect } from 'react'
import { Layout, Dropdown, Badge, Popover, List, Avatar, Modal, Input, message, Select } from 'antd'
import type { MenuProps } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  CameraOutlined,
  GlobalOutlined,
} from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import PikachuFace from './PikachuFace'

const { Header } = Layout

interface HeaderBarProps {
  collapsed: boolean
  onToggle: () => void
}

/** 模拟通知数据 */
const notifications = [
  { id: 1, title: '審批流程待處理', desc: '您有 3 個審批流程待處理', time: '10分鐘前' },
  { id: 2, title: '充值申請提醒', desc: '新充值申請需要審批', time: '30分鐘前' },
  { id: 3, title: '系統維護通知', desc: '今晚2:00-4:00系統升級', time: '1小時前' },
]

/** 皮卡丘表情头像列表 */
const pikachuAvatars = [
  { key: 'pikachu-default', label: '默认' },
  { key: 'pikachu-happy', label: '开心' },
  { key: 'pikachu-thinking', label: '思考' },
  { key: 'pikachu-excited', label: '兴奋' },
  { key: 'pikachu-sleepy', label: '困倦' },
  { key: 'pikachu-surprised', label: '惊讶' },
  { key: 'pikachu-wink', label: '眨眼' },
  { key: 'pikachu-cheeky', label: '调皮' },
  { key: 'pikachu-cool', label: '酷炫' },
  { key: 'pikachu-love', label: '爱心' },
]

export default function HeaderBar({ collapsed, onToggle }: HeaderBarProps) {
  const { user, logout, updateAvatar } = useAuth()
  const navigate = useNavigate()
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<string>('china') // 默认中国

  // 国家选项（带国旗图标）
  const countryOptions = [
    { value: 'china', label: '中国', flag: '🇨🇳' },
    { value: 'hongkong', label: '香港', flag: '🇭🇰' },
    { value: 'macau', label: '澳门', flag: '🇲🇴' },
    { value: 'taiwan', label: '台湾', flag: '🇹🇼' },
    { value: 'japan', label: '日本', flag: '🇯🇵' },
    { value: 'south_korea', label: '韩国', flag: '🇰🇷' },
    { value: 'singapore', label: '新加坡', flag: '🇸🇬' },
    { value: 'malaysia', label: '马来西亚', flag: '🇲🇾' },
    { value: 'thailand', label: '泰国', flag: '🇹🇭' },
    { value: 'vietnam', label: '越南', flag: '🇻🇳' },
    { value: 'philippines', label: '菲律宾', flag: '🇵🇭' },
    { value: 'indonesia', label: '印度尼西亚', flag: '🇮🇩' },
    { value: 'usa', label: '美国', flag: '🇺🇸' },
    { value: 'uk', label: '英国', flag: '🇬🇧' },
    { value: 'australia', label: '澳大利亚', flag: '🇦🇺' },
  ]

  // 从 localStorage 读取国家选择
  useEffect(() => {
    const savedCountry = localStorage.getItem('selected_country')
    if (savedCountry) {
      setSelectedCountry(savedCountry)
    }
  }, [])

  // 处理国家选择变化
  const handleCountryChange = (country: string) => {
    setSelectedCountry(country)
    localStorage.setItem('selected_country', country)
    const selected = countryOptions.find(c => c.value === country)
    message.success(`已切换到${selected?.flag} ${selected?.label}`)
    // 触发全局事件，其他组件可以监听
    window.dispatchEvent(new CustomEvent('countryChange', { detail: country }))
  }

  /** 退出登录 */
  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  /** 修改密码 */
  const handleChangePwd = () => {
    if (!oldPwd) { message.warning('請輸入原密碼'); return }
    if (!newPwd) { message.warning('請輸入新密碼'); return }
    if (newPwd !== confirmPwd) { message.error('兩次輸入的密碼不一致'); return }
    if (oldPwd !== '123456') { message.error('原密碼錯誤'); return }
    message.success('密碼修改成功')
    setPwdModalOpen(false)
    setOldPwd(''); setNewPwd(''); setConfirmPwd('')
  }

  /** 更换头像 */
  const handleChangeAvatar = (url: string) => {
    updateAvatar(url)
    message.success('頭像已更換')
    setAvatarModalOpen(false)
  }

  /** 用户下拉菜单 */
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'avatar',
      icon: <CameraOutlined />,
      label: '更換頭像',
      onClick: () => setAvatarModalOpen(true),
    },
    {
      key: 'password',
      icon: <KeyOutlined />,
      label: '修改密碼',
      onClick: () => setPwdModalOpen(true),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登錄',
      danger: true,
      onClick: handleLogout,
    },
  ]

  /** 通知面板 */
  const notificationContent = (
    <div className="header-notification-panel">
      <div className="header-notification-title">系統消息</div>
      <List
        dataSource={notifications}
        renderItem={(item) => (
          <List.Item className="header-notification-item">
            <List.Item.Meta
              title={<span className="header-notification-item-title">{item.title}</span>}
              description={
                <div>
                  <div className="header-notification-item-desc">{item.desc}</div>
                  <div className="header-notification-item-time">{item.time}</div>
                </div>
              }
            />
          </List.Item>
        )}
      />
    </div>
  )

  /** 头像展示 */
  const isPikachu = user?.avatar?.startsWith('pikachu-')
  const avatarExpression = isPikachu ? (user?.avatar?.replace('pikachu-', '') || 'default') : ''

  return (
    <>
      <Header className="header-bar">
        <div className="header-left">
          <span className="trigger-icon" onClick={onToggle}>
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </span>
        </div>
        <div className="header-right">
          {/* 国家选择器 */}
          <Select
            value={selectedCountry}
            onChange={handleCountryChange}
            style={{ width: 140, marginRight: 16 }}
            options={countryOptions.map(option => ({
              value: option.value,
              label: `${option.flag} ${option.label}`,
            }))}
          />

          {/* 通知铃铛 */}
          <Popover
            content={notificationContent}
            trigger="click"
            placement="bottomRight"
            overlayClassName="header-notification-popover"
          >
            <Badge count={3} size="small" offset={[-2, 4]}>
              <span className="header-bell">
                <BellOutlined />
              </span>
            </Badge>
          </Popover>

          {/* 用户头像+下拉 */}
          <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
            <div className="header-user-info">
              {isPikachu ? (
                <div className="header-avatar" style={{ 
                  width: 32, 
                  height: 32,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: '#FDD835'
                }}>
                  <PikachuFace expression={avatarExpression} size={32} />
                </div>
              ) : (
                <Avatar size={32} icon={<UserOutlined />} className="header-avatar" />
              )}
              <div className="header-user-text">
                <span className="header-user-name">{user?.name}</span>
                {user?.department && user?.position && (
                  <span className="header-user-department">
                    {user.department} - {user.position}
                  </span>
                )}
                <span className="header-user-id">ID: {user?.empId}</span>
              </div>
            </div>
          </Dropdown>
        </div>
      </Header>

      {/* 修改密码弹窗 */}
      <Modal
        title="修改密碼"
        open={pwdModalOpen}
        onCancel={() => setPwdModalOpen(false)}
        onOk={handleChangePwd}
        okText="確認"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          <Input.Password placeholder="請輸入原密碼" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
          <Input.Password placeholder="請輸入新密碼" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          <Input.Password placeholder="請確認新密碼" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
        </div>
      </Modal>

      {/* 更换头像弹窗 */}
      <Modal
        title="更換頭像"
        open={avatarModalOpen}
        onCancel={() => setAvatarModalOpen(false)}
        footer={null}
        width={520}
      >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', padding: '16px 0' }}>
          {pikachuAvatars.map((avatar) => (
            <div
              key={avatar.key}
              style={{
                cursor: 'pointer',
                border: user?.avatar === avatar.key ? '3px solid #E8720C' : '3px solid transparent',
                borderRadius: '50%',
                padding: '8px',
                background: user?.avatar === avatar.key ? '#FFF8E1' : 'transparent',
                transition: 'all 0.2s',
              }}
              onClick={() => handleChangeAvatar(avatar.key)}
              title={avatar.label}
            >
              <div style={{ width: 64, height: 64 }}>
                <PikachuFace expression={avatar.key.replace('pikachu-', '') || 'happy'} size={64} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, color: '#666', marginTop: 4 }}>
                {avatar.label}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
