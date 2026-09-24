/**
 * 门户顶栏（Round 2）。
 *
 * 场景：/portal 路径下不注入 Sidebar/MenuTabs，但仍需要品牌区 + 基础用户操作。
 * 本组件保持极小：Logo + 平台名 + "門戶"标签 + 退出登录按钮。
 *
 * 与 HeaderBar 分离的原因：门户页无侧边栏折叠按钮、也无系统内切换需求；
 * 强行复用 HeaderBar 会引入 Sidebar 状态依赖，让 App.tsx 的分支渲染复杂化。
 * 用户头像/通知/语言等在进入系统后使用 HeaderBar 完整版即可。
 */
import { Layout, Button, Space, Tag } from 'antd'
import { LogoutOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import BrandLogo from './BrandLogo'
import { useAuth } from '../contexts/AuthContext'
import './PortalTopBar.css'

const { Header } = Layout

export default function PortalTopBar() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()

  return (
    <Header className="portal-top-bar">
      <div className="portal-top-bar-left">
        <Space size={12} align="center">
          <BrandLogo size={32} />
          <span className="portal-top-bar-title">{t('app.logoMain', '企業管理平台')}</span>
          <Tag color="orange" className="portal-top-bar-badge">
            {t('portal.headerBadge', '門戶')}
          </Tag>
        </Space>
      </div>
      <div className="portal-top-bar-right">
        <Space size={12} align="center">
          {user?.name ? (
            <span className="portal-top-bar-user">{user.name}</span>
          ) : null}
          <Button
            type="text"
            icon={<LogoutOutlined />}
            onClick={() => void logout()}
            className="portal-top-bar-logout"
          >
            {t('header.logout', '退出登錄')}
          </Button>
        </Space>
      </div>
    </Header>
  )
}
