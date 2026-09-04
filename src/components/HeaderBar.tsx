import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Layout, Dropdown, Badge, Popover, Avatar, Modal, Input, message, Select, Tag, Button, Empty, Spin, Tabs } from 'antd'
import type { MenuProps } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  KeyOutlined,
  CameraOutlined,
  GiftOutlined,
  CheckOutlined,
  InboxOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import PikachuFace from './PikachuFace'
import { useTranslation } from 'react-i18next'
import { changeAppLanguage, SUPPORTED_LANGUAGES, injectTranslationBundle } from '../i18n'
import type { AppLanguage } from '../i18n'
import {
  COUNTRY_INFO,
  countrySysName,
  getCountryOfLanguage,
  LANG_INFO,
  langSysName,
  validateLanguageConfigured,
} from '../utils/translationConfig'
import type { LangValidationResult } from '../utils/translationConfig'
import { fetchCoverage, fetchTranslationBundle } from '../api/translation'
import { pinyin } from 'pinyin-pro'
import { fetchNotifications, markAllNotificationsRead, type NotificationItem } from '../api/notification'
import { updateAvatarApi, uploadAvatarApi } from '../api/auth'
import { PRESET_AVATARS, getPresetAvatarUrl } from '../constants/avatars'
import { fetchIconFontAvatars, saveUserAvatarUrl, getUserSavedAvatarUrl, type IconFontAvatar } from '../api/iconfont'

const { Header } = Layout

/** 中文姓名转英文拼音格式：名在前、姓在后，首字母大写 */
function chineseNameToPinyinEnglish(name: string): string {
  if (!name) return ''
  // 检查是否为纯中文
  if (!/[\u4e00-\u9fa5]/.test(name)) return name
  const py = pinyin(name, { toneType: 'none', type: 'array' })
  if (py.length <= 1) return name
  // 第一个为姓，其余为名
  const surname = py[0]
  const givenName = py.slice(1).join('')
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
  return `${capitalize(givenName)} ${capitalize(surname)}`
}

interface HeaderBarProps {
  collapsed: boolean
  onToggle: () => void
}

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
  const isNonZh = !i18nInstance.language?.startsWith('zh')
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [selectedCountry, setSelectedCountry] = useState<string>('usa')
  const [selectedLang, setSelectedLang] = useState<string>('en')

  // 国家选项：与多语言配置的国家数据一致，名称跟随全局语言
  const countryOptions = useMemo(() =>
    Object.keys(COUNTRY_INFO).map(code => ({
      value: code,
      flag: COUNTRY_INFO[code].flag,
      label: countrySysName(code, i18nInstance.language || 'en'),
    })), [i18nInstance.language])

  // 语言选项：展示全部语言（与国家不联动），语言种类与多语言配置一致
  const languageOptions = useMemo(() =>
    Object.keys(LANG_INFO).map(code => ({
      value: code,
      flag: LANG_INFO[code]?.flag ?? '🌐',
      label: langSysName(code, i18nInstance.language || 'en'),
    })), [i18nInstance.language])

  // 从 localStorage 读取国家/语言选择（兼容旧版数据：旧国家编码直接有效，旧语言编码反查所属国家）
  useEffect(() => {
    const saved = localStorage.getItem('selected_country')
    let country = 'usa'
    if (saved) {
      if (COUNTRY_INFO[saved]) {
        country = saved
      } else if (LANG_INFO[saved]) {
        country = getCountryOfLanguage(saved)
      }
    }
    setSelectedCountry(country)
    const savedLang = localStorage.getItem('app_language')
    setSelectedLang(savedLang && LANG_INFO[savedLang] ? savedLang : 'en')
  }, [])

  /** 执行语言切换（含后端语言包注入） */
  const doSwitchLanguage = async (lang: string) => {
    const selected = languageOptions.find(o => o.value === lang)
    // 拉取后端数据库语言包注入 i18next（业务字段/菜单名等动态翻译）
    const bundle = await fetchTranslationBundle(lang)
    if (bundle) {
      injectTranslationBundle(lang, bundle)
    }
    setSelectedLang(lang)
    localStorage.setItem('app_language', lang)
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
      changeAppLanguage(lang as AppLanguage)
      message.success(t('header.switchedCountry', { flag: selected?.flag ?? '', name: selected?.label ?? lang }))
    } else {
      message.info(`已切换至 ${selected?.flag ?? ''} ${selected?.label ?? lang}，该语言的界面文案将在翻译资源导入后生效`)
    }
    // 触发全局事件，其他组件可以监听
    window.dispatchEvent(new CustomEvent('countryChange', { detail: selectedCountry }))
  }

  // 处理语言选择：先校验该语言是否已在「多语言配置」完成配置（优先后端真实完成率）
  const handleLanguageChange = async (lang: string) => {
    const remote = await fetchCoverage(lang)
    const validation: LangValidationResult = remote ?? validateLanguageConfigured(lang)
    const selected = languageOptions.find(o => o.value === lang)
    const displayName = `${selected?.flag ?? ''} ${selected?.label ?? lang}`

    if (validation.status === 'not_configured') {
      Modal.warning({
        title: '该语言未配置',
        content: `${displayName} 尚未在多语言配置中完成配置，请先到「系统配置 → 多语言配置」添加该语言并补充翻译后再进行选择。`,
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
        onOk: () => doSwitchLanguage(lang),
      })
      return
    }
    doSwitchLanguage(lang)
    // 达标但未 100%：提示未配置字段将回退英文展示
    if (validation.rate < 1) {
      message.info(`${displayName} 翻译完成率 ${Math.round(validation.rate * 100)}%，未配置的字段将以英文显示`)
    }
  }

  /** 处理国家选择：仅持久化国家，不联动语言（语言可独立选择任意语言） */
  const handleCountryChange = (country: string) => {
    setSelectedCountry(country)
    localStorage.setItem('selected_country', country)
    window.dispatchEvent(new CustomEvent('countryChange', { detail: country }))
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

    /** 头像弹窗 Tab */
  const [avatarTab, setAvatarTab] = useState('system')
  /** 上传头像预览 base64 */
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  /** 上传中 */
  const [uploading, setUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  /** 待确认的头像选择（在线头像 Tab 先选中再确认） */
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null)

  /** 预加载在线头像到浏览器缓存，打开弹窗时秒显示 */
  useEffect(() => {
    PRESET_AVATARS.forEach((preset) => {
      const img = new Image()
      img.src = getPresetAvatarUrl(preset.style, preset.seed)
    })
  }, [])

  /** IconFont 头像列表 */
  const [iconFontAvatars, setIconFontAvatars] = useState<IconFontAvatar[]>([])
  const [iconFontLoading, setIconFontLoading] = useState(false)
  const [iconFontPage, setIconFontPage] = useState(1)
  const [iconFontTotal, setIconFontTotal] = useState(0)
  const [iconFontKeyword, setIconFontKeyword] = useState('卡通头像')

  /** 更换头像（持久化到后端） */
  const handleChangeAvatar = async (avatarValue: string) => {
    updateAvatar(avatarValue)
    try {
      await updateAvatarApi(avatarValue)
      // 如果是在线头像 URL，额外保存到 avatar-url 字段
      if (avatarValue.startsWith('https://')) {
        try {
          await saveUserAvatarUrl(avatarValue)
        } catch (e) {
          console.warn('保存头像 URL 失败:', e)
        }
      }
    } catch {
      // 后端持久化失败不回滚本地状态，仅提示
      message.warning(t('header.avatarSaveFailed'))
    }
    message.success(t('header.avatarChanged'))
    setAvatarModalOpen(false)
    setUploadPreview(null)
    setAvatarTab('system')
  }

  /** 确认应用待选头像 */
  const handleConfirmPendingAvatar = async () => {
    if (!pendingAvatar) return
    updateAvatar(pendingAvatar)
    try {
      await updateAvatarApi(pendingAvatar)
      // 如果是在线头像 URL，额外保存到 avatar-url 字段
      if (pendingAvatar.startsWith('https://')) {
        try {
          saveUserAvatarUrl(pendingAvatar)
        } catch (e) {
          console.warn('保存头像 URL 失败:', e)
        }
      }
    } catch {
      message.warning(t('header.avatarSaveFailed'))
    }
    message.success(t('header.avatarChanged'))
    setAvatarModalOpen(false)
    setPendingAvatar(null)
    setUploadPreview(null)
    setAvatarTab('system')
  }

  /** 加载 IconFont 头像列表 */
  const loadIconFontAvatars = useCallback(async (page = 1, keyword = iconFontKeyword) => {
    if (page === 1) {
      setIconFontLoading(true)
    }
    try {
      // 调用模拟数据接口（目前后端返回 placeholder 图片）
      const result = await fetchIconFontAvatars(keyword, page, 40)
      if (page === 1) {
        setIconFontAvatars(result.data)
        setIconFontTotal(result.total)
        setIconFontPage(1)
      } else {
        setIconFontAvatars(prev => [...prev, ...result.data])
        setIconFontPage(page)
      }
    } catch (e) {
      console.error('加载 IconFont 头像失败:', e)
      message.warning('暂时无法加载在线头像库，请使用系统默认或上传头像')
      setIconFontLoading(false)
      return false // 通知 caller 停止操作
    } finally {
      setIconFontLoading(false)
    }
  }, [iconFontKeyword])

  /** 重新搜索 IconFont 头像 */
  const handleSearchIconFont = () => {
    setIconFontAvatars([])
    setIconFontTotal(0)
    loadIconFontAvatars(1, iconFontKeyword)
  }

  /** 加载更多 IconFont 头像 */
  const loadMoreAvatars = () => {
    if (!iconFontLoading && iconFontPage * 40 < iconFontTotal) {
      loadIconFontAvatars(iconFontPage + 1, iconFontKeyword)
    }
  }

  /** 压缩图片为 200x200 JPEG 并返回 base64 Data URL */
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 200
          canvas.height = 200
          const ctx = canvas.getContext('2d')!
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, 200, 200)
          // 居中裁剪
          const size = Math.min(img.width, img.height)
          const sx = (img.width - size) / 2
          const sy = (img.height - size) / 2
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200)
          resolve(canvas.toDataURL('image/jpeg', 0.8))
        }
        img.onerror = reject
        img.src = e.target?.result as string
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  /** 处理头像上传 */
  const handleUploadAvatar = async (file: File) => {
    // 校验文件类型
    if (!file.type.startsWith('image/')) {
      message.error(t('header.avatarTypeInvalid'))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      message.error(t('header.avatarSizeExceed'))
      return
    }
    setUploading(true)
    try {
      // 前端压缩
      const compressed = await compressImage(file)
      setUploadPreview(compressed)
      // 上传到后端获取 base64
      const result = await uploadAvatarApi(file)
      // 使用后端返回的 base64（更可靠）
      if (result?.base64) {
        setUploadPreview(result.base64)
      }
    } catch {
      message.error(t('header.avatarUploadFailed'))
    } finally {
      setUploading(false)
    }
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

  /** 头像展示：支持 pikachu / DiceBear URL / base64 三种 */
  const avatarKey = user?.avatar ?? ''
  const isPikachu = !avatarKey || avatarKey.startsWith('pikachu-')
  const avatarExpression = isPikachu ? (avatarKey.replace('pikachu-', '') || 'default') : ''
  const isCustomOrPreset = avatarKey.startsWith('https://') || avatarKey.startsWith('data:')

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
            style={{ width: 150, marginRight: 12 }}
            options={countryOptions.map(option => ({
              value: option.value,
              label: `${option.flag} ${option.label}`,
            }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
          {/* 语言选择器（全部语言可选，与国家独立） */}
          <Select
            showSearch
            value={selectedLang}
            onChange={handleLanguageChange}
            style={{ width: 130, marginRight: 16 }}
            options={languageOptions.map(option => ({
              value: option.value,
              label: `${option.flag} ${option.label}`,
            }))}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />

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
              ) : isCustomOrPreset ? (
                <img src={avatarKey} alt="avatar" className="header-avatar" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
              ) : (
                <Avatar size={32} icon={<UserOutlined />} className="header-avatar" />
              )}
              <div className="header-user-text">
                {/* 第一行: 姓名（工號）-職級 — 英文模式显示拼音名 */}
                <span className="header-user-name">
                  {isNonZh ? chineseNameToPinyinEnglish(user?.name || '') : user?.name}（{user?.empId}）{user?.jobLevel ? `-${user.jobLevel}` : ''}
                </span>
                {/* 第二行: 職位名稱 — 英文模式只显示英文名 */}
                {user?.position && (
                  <span className="header-user-department">
                    {isNonZh ? (user.positionEn || user.position) : user.position}{!isNonZh && user.positionEn ? `（${user.positionEn}）` : ''}
                  </span>
                )}
                {/* 第三行: 部門名稱 — 英文模式显示英文名 */}
                {user?.department && (
                  <span className="header-user-id">
                    {isNonZh ? (user.departmentEn || user.department) : user.department}
                  </span>
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

      {/* 更换头像弹窗（Tab 式：系统默认 / 在线头像 / 上传头像） */}
      <Modal
        title={t('header.changeAvatarTitle')}
        open={avatarModalOpen}
        onCancel={() => { setAvatarModalOpen(false); setPendingAvatar(null); setUploadPreview(null); setAvatarTab('system') }}
        footer={
          avatarTab === 'upload' && uploadPreview ? null : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 24px', borderTop: '1px solid #f0f0f0' }}>
              <Button
                onClick={() => {
                  if (avatarTab === 'upload') {
                    setUploadPreview(null)
                  } else {
                    setAvatarModalOpen(false)
                    setPendingAvatar(null)
                    setAvatarTab('system')
                  }
                }}
                style={{ borderRadius: 8, minWidth: 88, height: 36 }}
              >
                {avatarTab === 'upload' ? t('common.cancel') : t('common.cancel')}
              </Button>
              <Button
                type="primary"
                disabled={!pendingAvatar && avatarTab !== 'upload'}
                onClick={handleConfirmPendingAvatar}
                style={{ borderRadius: 8, minWidth: 88, height: 36 }}
              >
                {t('common.confirm')}
              </Button>
            </div>
          )
        }
        width={560}
      >
        <Tabs
          activeKey={avatarTab}
          onChange={(key) => { setAvatarTab(key); setUploadPreview(null) }}
          centered
          items={[
            {
              key: 'system',
              label: t('header.avatarTabSystem'),
              children: (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center', padding: '16px 0' }}>
                  {pikachuAvatars.map((avatar) => {
                    const isSelected = pendingAvatar === avatar.key
                    return (
                      <div
                        key={avatar.key}
                        style={{
                          cursor: 'pointer',
                          border: isSelected ? '3px solid #E8720C' : '3px solid transparent',
                          borderRadius: '50%',
                          padding: 8,
                          background: isSelected ? '#FFF8E1' : 'transparent',
                          transition: 'all 0.2s',
                        }}
                        onClick={() => setPendingAvatar(avatar.key)}
                        title={t(`header.avatarNames.${avatar.key.replace('pikachu-', '')}`)}
                      >
                        <div style={{ width: 64, height: 64 }}>
                          <PikachuFace expression={avatar.key.replace('pikachu-', '') || 'happy'} size={64} />
                        </div>
                        <div style={{ textAlign: 'center', fontSize: 12, color: '#666', marginTop: 4 }}>
                          {t(`header.avatarNames.${avatar.key.replace('pikachu-', '')}`)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ),
            },
            {
              key: 'online',
              label: t('header.avatarTabOnline'),
              children: (
                <div style={{ padding: '16px 0' }}>
                  {/* 搜索栏 */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                    <Input
                      value={iconFontKeyword}
                      onChange={(e) => setIconFontKeyword(e.target.value)}
                      placeholder="搜索头像关键词（如：卡通、商务、可爱）"
                      onPressEnter={handleSearchIconFont}
                      style={{ flex: 1 }}
                    />
                    <Button type="primary" icon={<SearchOutlined />} onClick={handleSearchIconFont}>
                      搜索
                    </Button>
                  </div>

                  {/* 头像网格 */}
                  {iconFontLoading && iconFontAvatars.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <Spin size="large" />
                      <div style={{ marginTop: 8, color: '#8C8C8C' }}>加载中...</div>
                    </div>
                  ) : iconFontAvatars.length > 0 ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
                        {iconFontAvatars.map((avatar) => {
                          const isSelected = pendingAvatar === avatar.icon_url
                          return (
                            <div
                              key={avatar.id}
                              style={{
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: 8,
                                borderRadius: 12,
                                border: isSelected ? '3px solid #E8720C' : '3px solid transparent',
                                background: isSelected ? '#FFF8E1' : 'transparent',
                                transition: 'all 0.2s',
                              }}
                              onClick={() => setPendingAvatar(avatar.icon_url)}
                              title={avatar.title}
                            >
                              <img
                                src={avatar.icon_url}
                                alt={avatar.title}
                                style={{ width: 64, height: 64, borderRadius: '50%' }}
                                onError={(e) => {
                                  ;(e.target as HTMLImageElement).src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="%23E8720C"/><text x="32" y="40" text-anchor="middle" fill="white" font-size="24" font-family="sans-serif">?</text></svg>')}`
                                }}
                              />
                              <span style={{ fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                {avatar.title}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      {/* 加载更多按钮 */}
                      {iconFontPage * 40 < iconFontTotal && (
                        <div style={{ textAlign: 'center', marginTop: 24 }}>
                          <Button
                            onClick={loadMoreAvatars}
                            disabled={iconFontLoading}
                            style={{ borderRadius: 6 }}
                          >
                            {iconFontLoading ? '加载中...' : '加载更多'} ({iconFontTotal} 个)
                          </Button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                      <InboxOutlined style={{ fontSize: 48, color: '#BFBFBF' }} />
                      <div style={{ marginTop: 8, color: '#8C8C8C' }}>点击「搜索」按钮查找喜欢的头像</div>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'upload',
              label: t('header.avatarTabUpload'),
              children: (
                <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  {uploadPreview ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>{t('header.avatarPreview')}</div>
                      <img
                        src={uploadPreview}
                        alt="preview"
                        style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', border: '3px solid #E8720C' }}
                      />
                      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
                        <Button
                          onClick={() => setUploadPreview(null)}
                          style={{ borderRadius: 6 }}
                        >
                          {t('common.cancel')}
                        </Button>
                        <Button
                          type="primary"
                          icon={<CheckOutlined />}
                          onClick={() => handleChangeAvatar(uploadPreview)}
                          style={{ borderRadius: 6 }}
                        >
                          {t('common.confirm')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => uploadInputRef.current?.click()}
                      style={{
                        width: 200,
                        height: 200,
                        border: '2px dashed #D9D9D9',
                        borderRadius: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: uploading ? 'wait' : 'pointer',
                        background: '#FAFAFA',
                        transition: 'all 0.25s',
                      }}
                      onMouseEnter={(e) => { if (!uploading) { e.currentTarget.style.borderColor = '#E8720C'; e.currentTarget.style.background = '#FFF7E6' } }}
                      onMouseLeave={(e) => { if (!uploading) { e.currentTarget.style.borderColor = '#D9D9D9'; e.currentTarget.style.background = '#FAFAFA' } }}
                    >
                      {uploading ? (
                        <Spin tip={t('header.avatarCompressing')} />
                      ) : (
                        <>
                          <InboxOutlined style={{ fontSize: 32, color: '#8C8C8C' }} />
                          <div style={{ fontSize: 13, color: '#595959', marginTop: 8 }}>{t('header.avatarUploadHint')}</div>
                        </>
                      )}
                    </div>
                  )}
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleUploadAvatar(file)
                      e.target.value = ''
                    }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Modal>
    </>
  )
}
