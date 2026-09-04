import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Button, Tooltip, message, Modal, Select } from 'antd'
import {
  UserOutlined,
  LockOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  GlobalOutlined,
  WechatOutlined,
  AlipayCircleOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../contexts/AuthContext'
import BrandLogo from '../../components/BrandLogo'
import { useTranslation } from 'react-i18next'
import { changeAppLanguage, SUPPORTED_LANGUAGES } from '../../i18n'
import type { AppLanguage } from '../../i18n'
import {
  COUNTRY_INFO,
  countrySysName,
  getCountryOfLanguage,
  LANG_INFO,
  langSysName,
} from '../../utils/translationConfig'
import '../../styles/components.css'

/* ---- 视频源配置 ---- */
// 本地视频(随项目构建部署到 GitHub Pages / 本地开发)
const LOCAL_VIDEO = `${import.meta.env.BASE_URL}MFTB.mp4`
// 备用远程视频(阿里云OSS)
const REMOTE_VIDEO = 'https://mftb-video-song.oss-cn-shenzhen.aliyuncs.com/%E9%80%81%E5%A4%96%E5%8D%96%E8%A7%86%E9%A2%91.mp4'

/* ---- 左侧视频背景组件 ---- */
function VideoBackground() {
  const { t } = useTranslation()
  // 统一使用本地视频(本地开发走 Vite dev server, 部署走 GitHub Pages)
  const [videoSrc, setVideoSrc] = useState(LOCAL_VIDEO)
  const [loadFailed, setLoadFailed] = useState(false)
  const videoRef = React.useRef<HTMLVideoElement>(null)

  const handleVideoLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const container = e.currentTarget.parentElement
    if (container) {
      container.classList.add('video-loaded')
    }
  }

  const handleVideoError = () => {
    if (videoSrc === LOCAL_VIDEO) {
      // 本地视频加载失败 → 回退到阿里云OSS
      console.warn('本地视频加载失败,尝试回退到远程视频')
      setVideoSrc(REMOTE_VIDEO)
    } else if (videoSrc === REMOTE_VIDEO) {
      // 远程视频也失败 → 放弃视频,仅显示渐变背景
      console.error('远程视频也加载失败,将仅显示渐变背景')
      setLoadFailed(true)
    }
  }

  // 切换视频源后重新加载
  React.useEffect(() => {
    if (videoRef.current && !loadFailed) {
      videoRef.current.load()
      videoRef.current.play().catch(() => {})
    }
  }, [videoSrc, loadFailed])

  return (
    <div className="video-bg-container">
      {!loadFailed && (
        <video
          ref={videoRef}
          className="login-video"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          onLoadedData={handleVideoLoaded}
          onError={handleVideoError}
          src={videoSrc}
        />
      )}

      <div className="video-overlay" />

      <div className="video-brand">
        <BrandLogo size={36} style={{ margin: '0 auto 8px' }} />
        <span className="video-brand-text">{t('login.videoBrand')}</span>
      </div>
    </div>
  )
}


/* ========= 主登录组件 ========= */
export default function Login() {
  const { t, i18n: i18nInstance } = useTranslation()
  const sysLang = i18nInstance.language || 'en'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  // 登录页独立的国家/语言选择（与首页互不干扰，数据与多语言配置一致）
  const [loginCountry, setLoginCountry] = useState('usa')
  const [loginLanguage, setLoginLanguage] = useState<string>('en')

  // 国家选项：与顶部/多语言配置的国家数据一致，名称跟随全局语言
  const countryOptions = useMemo(() =>
    Object.keys(COUNTRY_INFO).map(code => ({
      value: code,
      flag: COUNTRY_INFO[code].flag,
      label: countrySysName(code, sysLang),
    })), [sysLang])

  // 语言选项：全部语言可选（与国家独立），语言种类与多语言配置一致
  const languageOptions = useMemo(() =>
    Object.keys(LANG_INFO).map(code => ({
      value: code,
      label: `${LANG_INFO[code]?.flag ?? '🌐'} ${langSysName(code, sysLang)}`,
    })), [sysLang])

  // 字段错误提示
  const [usernameError, setUsernameError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  /** 账号被停用弹窗状态 */
  const [accountDisabledVisible, setAccountDisabledVisible] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  /** 应用语言切换：持久化并在系统支持时生效 */
  const applyLoginLanguage = (lang: string) => {
    setLoginLanguage(lang)
    localStorage.setItem('login_language', lang)
    if ((SUPPORTED_LANGUAGES as readonly string[]).includes(lang)) {
      changeAppLanguage(lang as AppLanguage)
    }
  }

  /** 初始化：从登录页独立存储读取国家/语言（兼容旧版语言编码存储） */
  useEffect(() => {
    const savedCountry = localStorage.getItem('login_country')
    let country = 'usa'
    if (savedCountry) {
      if (COUNTRY_INFO[savedCountry]) {
        country = savedCountry
      } else if (LANG_INFO[savedCountry]) {
        country = getCountryOfLanguage(savedCountry)
      }
    }
    const savedLang = localStorage.getItem('login_language')
    const lang = savedLang && LANG_INFO[savedLang] ? savedLang : 'en'
    setLoginCountry(country)
    applyLoginLanguage(lang)
  }, [])

  /** 登录页国家切换 → 仅保存国家，不联动语言（语言可独立选择任意语言） */
  const handleLoginCountryChange = (country: string) => {
    setLoginCountry(country)
    localStorage.setItem('login_country', country)
  }

  /** 登录页语言手动切换 */
  const handleLoginLanguageChange = (lang: string) => {
    applyLoginLanguage(lang)
  }

  /** 登录 */
  const handleLogin = () => {
    let hasError = false
    if (!username.trim()) { setUsernameError(t('login.empIdRequired')); hasError = true }
    else { setUsernameError('') }

    if (!password.trim()) { setPasswordError(t('login.pwdRequired')); hasError = true }
    else { setPasswordError('') }

    if (hasError) return

    // 将登录页选择的国家/语言同步到首页键，进入系统后直接使用
    localStorage.setItem('selected_country', loginCountry)
    localStorage.setItem('app_language', loginLanguage)

    setLoading(true)
    setTimeout(async () => {
      const result = await login(username, password)
      setLoading(false)
      if (result.success) {
        message.success(t('login.success'))
        navigate(result.redirectPath || '/', { replace: true })
      } else if (result.accountDisabled) {
        // 账号被停用: 弹窗提醒（不显示 toast）
        setAccountDisabledVisible(true)
      } else {
        message.error(result.message || t('login.failed'))
      }
    }, 600)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  const canLogin = username.trim() && password.trim()

  // 按钮 tooltip 提示
  const getBtnTooltip = () => {
    if (canLogin) return ''
    if (!username.trim()) return t('login.empIdRequired')
    if (!password.trim()) return t('login.pwdRequired')
    return ''
  }

  return (
    <div className="login-page-video">
      {/* 全屏视频背景 */}
      <VideoBackground />

      {/* 登录框 - 居中浮动 */}
      <div className="login-right">
        <div className="login-card-v2">
          {/* 右上角国家 & 语言选择器 */}
          <div className="login-locale-corner">
            <Select
              value={loginCountry}
              onChange={handleLoginCountryChange}
              size="small"
              variant="borderless"
              className="login-locale-select"
              popupMatchSelectWidth={false}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={countryOptions.map(opt => ({
                value: opt.value,
                label: `${opt.flag} ${opt.label}`,
              }))}
              suffixIcon={<GlobalOutlined style={{ color: 'rgba(255,255,255,0.6)' }} />}
            />
            <Select
              value={loginLanguage}
              onChange={handleLoginLanguageChange}
              size="small"
              variant="borderless"
              className="login-locale-select"
              popupMatchSelectWidth={false}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={languageOptions}
            />
          </div>

          <div className="login-title-v2">
            {/* 品牌 Logo 徽章 */}
            <div className="login-brand-badge">
              <BrandLogo size={44} />
            </div>
            <h2>{t('login.welcomeTitle')}</h2>
          </div>

          {/* 账号密码登录表单 */}
          <div className="login-form-v2">
            {/* 账号输入 */}
            <div className="login-field-v2">
              <label>{t('login.empIdLabel')}</label>
              <Input
                size="large"
                placeholder={t('login.empIdPlaceholder')}
                prefix={<UserOutlined style={{ color: '#5a5080' }} />}
                value={username}
                onChange={e => { setUsername(e.target.value); setUsernameError('') }}
                onKeyDown={handleKeyDown}
                status={usernameError ? 'error' : undefined}
              />
              {usernameError && <div className="field-error-tip">{usernameError}</div>}
            </div>

            {/* 密码输入 */}
            <div className="login-field-v2">
              <label>{t('login.pwdLabel')}</label>
              <Input
                size="large"
                placeholder={t('login.pwdPlaceholder')}
                prefix={<LockOutlined style={{ color: '#5a5080' }} />}
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setPasswordError('') }}
                onKeyDown={handleKeyDown}
                status={passwordError ? 'error' : undefined}
                suffix={
                  <span className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}>
                    {showPwd ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                  </span>
                }
              />
              {passwordError && <div className="field-error-tip">{passwordError}</div>}
            </div>

            {/* 登录按钮 */}
            <Tooltip title={getBtnTooltip() || undefined} placement="top">
              <Button
                type="primary"
                size="large"
                block
                loading={loading}
                disabled={!canLogin}
                onClick={handleLogin}
                className="login-btn-v2"
              >
                {t('login.submit')}
              </Button>
            </Tooltip>
          </div>

          {/* 快捷登录 */}
          <div className="quick-login">
            <div className="quick-login-btns">
              <button className="social-login-btn social-login-btn--wechat" title={t('login.wechat')}>
                <div className="social-login-btn__icon social-login-btn__icon--wechat">
                  <WechatOutlined style={{ fontSize: 28, color: '#fff' }} />
                </div>
              </button>
              <button className="social-login-btn social-login-btn--alipay" title={t('login.alipay')}>
                <div className="social-login-btn__icon social-login-btn__icon--alipay">
                  <AlipayCircleOutlined style={{ fontSize: 28, color: '#fff' }} />
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* 账号被停用提醒弹窗 */}
      <Modal
        title={null}
        open={accountDisabledVisible}
        centered
        closable={false}
        maskClosable={false}
        cancelButtonProps={{ style: { display: 'none' } }}
        okText={t('login.accountDisabledOk')}
        onOk={() => setAccountDisabledVisible(false)}
        styles={{
          header: { display: 'none' },
          body: { padding: '28px 24px 20px' },
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🚫</div>
          <h3 style={{ fontSize: 17, fontWeight: 600, color: '#262626', marginBottom: 12 }}>
            {t('login.accountDisabledTitle')}
          </h3>
          <p style={{ fontSize: 14, color: '#595959', marginBottom: 0 }}>
            {t('login.accountDisabledDesc')}
          </p>
        </div>
      </Modal>
    </div>
  )
}
