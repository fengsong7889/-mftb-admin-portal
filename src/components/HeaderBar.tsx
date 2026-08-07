import { useState, useEffect, useMemo } from 'react'
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
} from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import PikachuFace from './PikachuFace'
import { useTranslation } from 'react-i18next'
import { changeAppLanguage, getCountryLanguage, SUPPORTED_LANGUAGES, injectTranslationBundle } from '../i18n'
import type { AppLanguage } from '../i18n'
import { LANG_INFO, langSysName, validateLanguageConfigured } from '../utils/translationConfig'
import type { LangValidationResult } from '../utils/translationConfig'
import { fetchCoverage, fetchTranslationBundle } from '../api/translation'

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
  const { t, i18n: i18nInstance } = useTranslation()
  const navigate = useNavigate()
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<string>('en') // 默认英文

  // 国家/语言选项：默认展示语言代码库的所有语言和国旗，名称跟随全局语言
  const countryOptions = useMemo(() =>
    Object.keys(LANG_INFO).map(code => ({
      value: code,
      flag: LANG_INFO[code].flag,
      label: langSysName(code, i18nInstance.language || 'en'),
    })), [i18nInstance.language])

  // 从 localStorage 读取国家选择（兼容旧版国家编码，如 usa/china → 对应语言代码）
  useEffect(() => {
    const savedCountry = localStorage.getItem('selected_country')
    if (savedCountry) {
      if (LANG_INFO[savedCountry]) {
        setSelectedCountry(savedCountry)
      } else {
        setSelectedCountry(getCountryLanguage(savedCountry))
      }
    }
  }, [])

  /** 执行国家/语言切换（含后端语言包注入） */
  const doSwitchCountry = async (code: string) => {
    const selected = countryOptions.find(c => c.value === code)
    // 拉取后端数据库语言包注入 i18next（业务字段/菜单名等动态翻译）
    const bundle = await fetchTranslationBundle(code)
    if (bundle) {
      injectTranslationBundle(code, bundle)
    }
    setSelectedCountry(code)
    localStorage.setItem('selected_country', code)
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(code)) {
      changeAppLanguage(code as AppLanguage)
      message.success(t('header.switchedCountry', { flag: selected?.flag ?? '', name: selected?.label ?? code }))
    } else {
      message.info(`已切换至 ${selected?.flag ?? ''} ${selected?.label ?? code}，该语言的界面文案将在翻译资源导入后生效`)
    }
    // 触发全局事件，其他组件可以监听
    window.dispatchEvent(new CustomEvent('countryChange', { detail: code }))
  }

  // 处理国家选择：先校验该语言是否已在「多语言配置」完成配置（优先后端真实完成率）
  const handleCountryChange = async (code: string) => {
    const remote = await fetchCoverage(code)
    const validation: LangValidationResult = remote ?? validateLanguageConfigured(code)
    const selected = countryOptions.find(c => c.value === code)
    const displayName = `${selected?.flag ?? ''} ${selected?.label ?? code}`

    if (validation.status === 'not_configured') {
      Modal.warning({
        title: '该国家语言未配置',
        content: `${displayName} 对应的语言尚未在多语言配置中完成配置，请先到「系统配置 → 多语言配置」添加该语言并补充翻译后再进行选择。`,
        okText: '知道了',
      })
      return
    }
    if (validation.status === 'partial') {
      Modal.confirm({
        title: '该语言翻译未完整',
        content: `${displayName} 的翻译完成率仅 ${Math.round(validation.rate * 100)}%（未达 60% 标准，已翻译 ${validation.translated}/${validation.total} 个字段），切换后未翻译的内容将以英文显示。是否仍要切换？`,
        okText: '仍要切换',
        cancelText: '取消',
        onOk: () => doSwitchCountry(code),
      })
      return
    }
    doSwitchCountry(code)
    // 达标但未 100%：提示未配置字段将回退英文展示
    if (validation.rate < 1) {
      message.info(`${displayName} 翻译完成率 ${Math.round(validation.rate * 100)}%，未配置的字段将以英文显示`)
    }
  }

  /** 退出登录 */
  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  /** 修改密码（TODO: 后端密码修改接口落地后替换当前演示逻辑） */
  const handleChangePwd = () => {
    if (!oldPwd) { message.warning(t('header.pwdRequiredOld')); return }
    if (!newPwd) { message.warning(t('header.pwdRequiredNew')); return }
    if (newPwd !== confirmPwd) { message.error(t('header.pwdMismatch')); return }
    if (newPwd.length < 6) { message.error(t('header.pwdTooShort')); return }
    message.success(t('header.pwdChanged'))
    setPwdModalOpen(false)
    setOldPwd(''); setNewPwd(''); setConfirmPwd('')
  }

  /** 更换头像 */
  const handleChangeAvatar = (url: string) => {
    updateAvatar(url)
    message.success(t('header.avatarChanged'))
    setAvatarModalOpen(false)
  }

  /** 用户下拉菜单 */
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'avatar',
      icon: <CameraOutlined />,
      label: t('header.changeAvatar'),
      onClick: () => setAvatarModalOpen(true),
    },
    {
      key: 'password',
      icon: <KeyOutlined />,
      label: t('header.changePassword'),
      onClick: () => setPwdModalOpen(true),
    },
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('header.logout'),
      danger: true,
      onClick: handleLogout,
    },
  ]

  /** 通知面板 */
  const notificationContent = (
    <div className="header-notification-panel">
      <div className="header-notification-title">{t('header.notifications')}</div>
      <List
        dataSource={notifications}
        renderItem={(item) => (
          <List.Item className="header-notification-item">
            <List.Item.Meta
              title={<span className="header-notification-item-title">{t(`header.notif${item.id}.title`)}</span>}
              description={
                <div>
                  <div className="header-notification-item-desc">{t(`header.notif${item.id}.desc`)}</div>
                  <div className="header-notification-item-time">{t(`header.notif${item.id}.time`)}</div>
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
            showSearch
            value={selectedCountry}
            onChange={handleCountryChange}
            style={{ width: 160, marginRight: 12 }}
            options={countryOptions.map(option => ({
              value: option.value,
              label: `${option.flag} ${option.label}`,
            }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
          {/* 语言切换（选国家联动默认语言，可手动覆盖） */}
          <Select
            value={i18nInstance.language}
            onChange={(lang) => changeAppLanguage(lang as AppLanguage)}
            style={{ width: 120, marginRight: 16 }}
            options={SUPPORTED_LANGUAGES.map((lang) => ({
              value: lang,
              label: t(`language.${lang}`),
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
                {/* 第一行: 姓名（工號）-職級 */}
                <span className="header-user-name">
                  {user?.name}（{user?.empId}）{user?.jobLevel ? `-${user.jobLevel}` : ''}
                </span>
                {/* 第二行: 職位名稱中文（職位名稱英文） */}
                {user?.position && (
                  <span className="header-user-department">
                    {user.position}{user.positionEn ? `（${user.positionEn}）` : ''}
                  </span>
                )}
                {/* 第三行: 部門名稱 */}
                {user?.department && (
                  <span className="header-user-id">{user.department}</span>
                )}
              </div>
            </div>
          </Dropdown>
        </div>
      </Header>

      {/* 修改密码弹窗 */}
      <Modal
        title={t('header.changePasswordTitle')}
        open={pwdModalOpen}
        onCancel={() => setPwdModalOpen(false)}
        onOk={handleChangePwd}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
          <Input.Password placeholder={t('header.enterOldPwd')} value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
          <Input.Password placeholder={t('header.enterNewPwd')} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
          <Input.Password placeholder={t('header.confirmNewPwd')} value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
        </div>
      </Modal>

      {/* 更换头像弹窗 */}
      <Modal
        title={t('header.changeAvatarTitle')}
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
              title={t(`header.avatarNames.${avatar.key.replace('pikachu-', '')}`)}
            >
              <div style={{ width: 64, height: 64 }}>
                <PikachuFace expression={avatar.key.replace('pikachu-', '') || 'happy'} size={64} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, color: '#666', marginTop: 4 }}>
                {t(`header.avatarNames.${avatar.key.replace('pikachu-', '')}`)}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  )
}
