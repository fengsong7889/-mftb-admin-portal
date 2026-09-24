import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Tooltip, message, Modal, Select } from 'antd'
import {
  UserOutlined,
  LockOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  WechatOutlined,
  AlipayCircleOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../contexts/AuthContext'
import { fetchCaptchaToken } from '../../api/auth'
import BrandLogo from '../../components/BrandLogo'
import SliderCaptcha from '../../components/SliderCaptcha'
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

/* ---- 登录安全验证配置 ---- */
/** 连续登录失败多少次后触发滑块验证 */
const FAIL_THRESHOLD = 3
/** 失败计数 localStorage 键 */
const FAIL_COUNT_KEY = 'login_fail_count'

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

  /* ---- 登录安全验证（防暴力破解） ----
     前端 localStorage 计数用于即时弹滑块（体验优化）；
     后端按账号统计失败次数：≥3 次强制 captchaToken（一次性），≥5 次锁定 15 分钟 */
  const [failCount, setFailCount] = useState(() => Number(localStorage.getItem(FAIL_COUNT_KEY) || 0))
  const [captchaOpen, setCaptchaOpen] = useState(false)

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

  /** 执行登录请求（captchaToken：滑块验证通过后由后端签发的一次性凭证） */
  const doLogin = (captchaToken?: string) => {
    // 将登录页选择的国家/语言同步到首页键，进入系统后直接使用
    localStorage.setItem('selected_country', loginCountry)
    localStorage.setItem('app_language', loginLanguage)

    setLoading(true)
    setTimeout(async () => {
      const result = await login(username, password, captchaToken)
      setLoading(false)
      if (result.success) {
        // 登录成功 → 清零失败计数
        setFailCount(0)
        localStorage.removeItem(FAIL_COUNT_KEY)
        message.success(t('login.success'))
        // 统一门户阶段 B：AuthContext 基于 accessibleSystems 计算了 redirectPath，
        // 默认跳 `/portal`；无系统时回退旧菜单首页，避免黑屏。
        navigate(result.redirectPath || '/', { replace: true })
      } else if (result.accountDisabled) {
        // 账号被停用: 弹窗提醒（不显示 toast、不计入失败次数）
        setAccountDisabledVisible(true)
      } else if (result.captchaRequired) {
        // 后端要求安全验证（本地计数与后端不一致时兜底）→ 直接弹滑块
        setCaptchaOpen(true)
      } else {
        // 登录失败 → 累计失败次数，达到阈值提示需安全验证
        const next = failCount + 1
        setFailCount(next)
        localStorage.setItem(FAIL_COUNT_KEY, String(next))
        message.error(result.message || t('login.failed'))
        if (next >= FAIL_THRESHOLD) {
          message.warning('為保護賬號安全，下次登錄需先完成滑塊安全驗證')
        }
      }
    }, 600)
  }

  /** 登录 */
  const handleLogin = () => {
    let hasError = false
    if (!username.trim()) { setUsernameError(t('login.empIdRequired')); hasError = true }
    else { setUsernameError('') }

    if (!password.trim()) { setPasswordError(t('login.pwdRequired')); hasError = true }
    else { setPasswordError('') }

    if (hasError) return

    // 连续失败达到阈值 → 先弹出滑块安全验证
    if (failCount >= FAIL_THRESHOLD) {
      setCaptchaOpen(true)
      return
    }

    doLogin()
  }

  /** 滑块验证通过 → 获取后端一次性 captchaToken 并继续登录 */
  const handleCaptchaSuccess = async () => {
    try {
      const { token } = await fetchCaptchaToken()
      setCaptchaOpen(false)
      doLogin(token)
    } catch {
      setCaptchaOpen(false)
      message.error('驗證服務暫時不可用，請稍後重試')
    }
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

          {/* 账号密码登录表单 — 自定义原生 input，完全掌控样式 */}
          <div className="login-form-v2">
            {/* 账号输入 */}
            <div className="login-field-v2">
              <label>{t('login.empIdLabel')}</label>
              <div className={`login-input-wrap${usernameError ? ' has-error' : ''}`}>
                <UserOutlined className="login-input-icon" />
                <input
                  className="login-input"
                  type="text"
                  autoComplete="username"
                  placeholder={t('login.empIdPlaceholder')}
                  value={username}
                  onChange={e => { setUsername(e.target.value); setUsernameError('') }}
                  onKeyDown={handleKeyDown}
                />
              </div>
              {usernameError && <div className="field-error-tip">{usernameError}</div>}
            </div>

            {/* 密码输入 */}
            <div className="login-field-v2">
              <label>{t('login.pwdLabel')}</label>
              <div className={`login-input-wrap${passwordError ? ' has-error' : ''}`}>
                <LockOutlined className="login-input-icon" />
                <input
                  className="login-input"
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t('login.pwdPlaceholder')}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setPasswordError('') }}
                  onKeyDown={handleKeyDown}
                />
                <span className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}>
                  {showPwd ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                </span>
              </div>
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

      {/* 滑块安全验证弹窗（连续失败 3 次后触发） */}
      <Modal
        open={captchaOpen}
        centered
        closable={false}
        maskClosable={false}
        footer={null}
        width={360}
        className="slider-captcha-modal"
        destroyOnClose
      >
        <SliderCaptcha onSuccess={handleCaptchaSuccess} onClose={() => setCaptchaOpen(false)} />
      </Modal>
    </div>
  )
}
