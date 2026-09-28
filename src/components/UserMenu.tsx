/**
 * 右上角用户菜单（业务系统 HeaderBar 与企业门户 PortalTopBar 共用）
 *
 * 展示：头像 + 姓名（工号）-職級 + 職位 + 部門；点击展开：我的資產 / 更換頭像 / 修改密碼 / 退出登錄。
 * 门户与系统内必须同一份实现，避免头像持久化、上传压缩、密码校验等逻辑两处漂移。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar, Button, Dropdown, Input, Modal, Spin, Tabs, message } from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  CameraOutlined,
  CheckOutlined,
  InboxOutlined,
  KeyOutlined,
  LogoutOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pinyin } from 'pinyin-pro'
import PikachuFace from './PikachuFace'
import PasswordChangeForm from './PasswordChangeForm'
import { useAuth } from '../contexts/AuthContext'
import { updateAvatarApi, uploadAvatarApi } from '../api/auth'
import { PRESET_AVATARS, getPresetAvatarUrl } from '../constants/avatars'
import { fetchIconFontAvatars, saveUserAvatarUrl, type IconFontAvatar } from '../api/iconfont'

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

interface Props {
  /** 「我的資產」入口路径；门户顶栏传入带 from=portal 的地址，返回时可回到门户 */
  myAssetsPath?: string
}

export default function UserMenu({ myAssetsPath = '/my-assets' }: Props) {
  const { user, logout, updateAvatar } = useAuth()
  const { t, i18n: i18nInstance } = useTranslation()
  const navigate = useNavigate()
  const isNonZh = !i18nInstance.language?.startsWith('zh')
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  /** 头像弹窗 Tab */
  const [avatarTab, setAvatarTab] = useState('system')
  /** 上传头像预览 base64 */
  const [uploadPreview, setUploadPreview] = useState<string | null>(null)
  /** 上传中 */
  const [uploading, setUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  /** 待确认的头像选择（在线头像 Tab 先选中再确认） */
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null)

  /** 退出登录 */
  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

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

  /** 关闭头像弹窗并复位选择状态 */
  const closeAvatarModal = () => {
    setAvatarModalOpen(false)
    setPendingAvatar(null)
    setUploadPreview(null)
    setAvatarTab('system')
  }

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
    closeAvatarModal()
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
    closeAvatarModal()
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
    } catch (err) {
      // 優先展示後端具體校驗消息（如文件大小/類型/魔數不合法），否則回退通用文案
      message.error(err instanceof Error && err.message ? err.message : t('header.avatarUploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  /** 用户下拉菜单（所有入口通用：不依赖菜单权限，员工均可查看本人领用资产） */
  const userMenuItems: MenuProps['items'] = [
    {
      key: 'my-assets',
      icon: <AppstoreOutlined />,
      label: t('header.myAssets', '我的資產'),
      onClick: () => navigate(myAssetsPath),
    },
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

  /** 头像展示：支持 pikachu / DiceBear URL / base64 三种 */
  const avatarKey = user?.avatar ?? ''
  const isPikachu = !avatarKey || avatarKey.startsWith('pikachu-')
  const avatarExpression = isPikachu ? (avatarKey.replace('pikachu-', '') || 'default') : ''
  const isCustomOrPreset = avatarKey.startsWith('https://') || avatarKey.startsWith('data:')

  return (
    <>
      {/* 用户头像+下拉 */}
      <Dropdown menu={{ items: userMenuItems }} trigger={['click']} placement="bottomRight">
        <div className="header-user-info">
          {isPikachu ? (
            <div className="header-avatar" style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              overflow: 'hidden',
              background: '#FDD835',
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

      {/* 修改密码弹窗（表单与首次登录强制改密门禁共用同一组件） */}
      <Modal
        title={t('header.changePasswordTitle')}
        open={pwdModalOpen}
        onCancel={() => setPwdModalOpen(false)}
        footer={null}
        width={520}
      >
        <PasswordChangeForm onCancel={() => setPwdModalOpen(false)} onSubmitted={() => setPwdModalOpen(false)} />
      </Modal>

      {/* 更换头像弹窗（Tab 式：系统默认 / 在线头像 / 上传头像） */}
      <Modal
        title={t('header.changeAvatarTitle')}
        open={avatarModalOpen}
        onCancel={closeAvatarModal}
        footer={
          avatarTab === 'upload' && uploadPreview ? null : (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 24px', borderTop: '1px solid #f0f0f0' }}>
              <Button
                onClick={() => {
                  if (avatarTab === 'upload') {
                    setUploadPreview(null)
                  } else {
                    closeAvatarModal()
                  }
                }}
                style={{ borderRadius: 8, minWidth: 88, height: 36 }}
              >
                {t('common.cancel')}
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
