import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input, Button, Tooltip, message } from 'antd'
import {
  UserOutlined,
  LockOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FormOutlined,
  SafetyOutlined,
  CheckOutlined,
} from '@ant-design/icons'
import { useAuth } from '../../contexts/AuthContext'
import '../../styles/components.css'

/* ---- 动物验证码题库 ---- */
const animalQuestions = [
  { name: '貓', emoji: '🐱', options: ['貓', '狗', '兔子'], answer: '貓' },
  { name: '狗', emoji: '🐶', options: ['貓', '狗', '魚'], answer: '狗' },
  { name: '熊貓', emoji: '🐼', options: ['熊貓', '北極熊', '企鵝'], answer: '熊貓' },
  { name: '兔子', emoji: '🐰', options: ['倉鼠', '兔子', '貓'], answer: '兔子' },
  { name: '狐狸', emoji: '🦊', options: ['狗', '狐狸', '狼'], answer: '狐狸' },
  { name: '猴子', emoji: '🐵', options: ['猩猩', '猴子', '熊'], answer: '猴子' },
  { name: '企鵝', emoji: '🐧', options: ['企鵝', '鴿子', '鴨子'], answer: '企鵝' },
  { name: '獅子', emoji: '🦁', options: ['老虎', '獅子', '熊'], answer: '獅子' },
]

const teasingMessages = [
  '你的眼睛是裝飾用的嗎？👀',
  '我家貓都比你認得準 🐈',
  '認錯動物這件事，你是認真的嗎？',
  '建議先從認識自己的寵物開始 🐶',
  '這個難度...是小學等級的吧？',
  '我懷疑你在閉著眼睛點 🙈',
  '再錯一次我就懷疑你是機器人了 🤖',
  '動物們都表示很失望 🥲',
  '你的辨識系統需要重新校準一下',
  '這題答對的話可以獲得空氣一份 🌬️',
]

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ---- 左侧视频背景组件 ---- */
function VideoBackground() {
  const handleVideoLoaded = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    // 视频加载成功后,添加类名隐藏渐变背景
    const container = e.currentTarget.parentElement
    if (container) {
      container.classList.add('video-loaded')
    }
  }

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    console.error('视频加载失败:', e)
  }

  return (
    <div className="video-bg-container">
      {/* 视频背景 - 使用阿里云OSS存储,确保局域网和公网都能流畅访问 */}
      <video 
        className="login-video" 
        autoPlay 
        loop 
        muted 
        playsInline
        preload="auto"
        onLoadedData={handleVideoLoaded}
        onError={handleVideoError}
      >
        {/* 阿里云OSS视频源 - 使用URL编码 */}
        <source src="https://mftb-video-song.oss-cn-shenzhen.aliyuncs.com/%E9%80%81%E5%A4%96%E5%8D%96%E8%A7%86%E9%A2%91.mp4" type="video/mp4" />
        您的浏览器不支持视频背景
      </video>
      
      {/* 视频上方的渐变遮罩层 */}
      <div className="video-overlay" />
      
      {/* 品牌标识 */}
      <div className="video-brand">
        <span className="video-brand-text">MFTB // 通用管理平台</span>
      </div>
    </div>
  )
}

/* ---- 二维码组件 ---- */
function QRCodeView({ type, label }: { type: 'wechat' | 'alipay'; label: string }) {
  const isWechat = type === 'wechat'
  const cells = useMemo(() => {
    const arr: boolean[] = []
    for (let i = 0; i < 121; i++) {
      const row = Math.floor(i / 11)
      const col = i % 11
      const isCorner = (row < 3 && col < 3) || (row < 3 && col > 7) || (row > 7 && col < 3)
      arr.push(isCorner || Math.random() > 0.48)
    }
    return arr
  }, [])

  return (
    <div className="qr-view">
      <div className={`qr-view-icon ${isWechat ? 'qr-icon-wechat' : 'qr-icon-alipay'}`}>
        {isWechat ? (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z" />
          </svg>
        ) : (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
            <path d="M21.422 15.358c-1.152-.378-4.32-1.578-6.024-2.196a14.2 14.2 0 0 0 1.776-4.362h-3.84v-1.44h4.8V6.24h-4.8V3.6h-2.16c-.24 0-.24.24-.24.24v2.4h-4.8v1.12h4.8v1.44h-3.84v1.12h7.056a11.27 11.27 0 0 1-1.344 3.162c-1.824-.6-3.456-.9-4.896-.672-3.312.528-4.752 3.12-3.888 5.472.768 2.112 3.648 3.12 6.048 1.392z" />
          </svg>
        )}
      </div>
      <h3 className="qr-view-title">{label}掃碼登錄</h3>
      <div className={`qr-code-box ${isWechat ? 'qr-border-wechat' : 'qr-border-alipay'}`}>
        <div className="qr-code-grid">
          {cells.map((dark, i) => (
            <div key={i} className={`qr-cell ${dark ? 'qr-cell-dark' : ''}`} />
          ))}
        </div>
      </div>
      <p className="qr-view-hint">請使用{label}掃描上方二維碼</p>
      <p className="qr-view-sub">掃碼後請在手機端確認登錄</p>
    </div>
  )
}

/* ========= 主登录组件 ========= */
export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loginMode, setLoginMode] = useState<'password' | 'wechat' | 'alipay'>('password')

  // 验证码状态
  const [captchaStage, setCaptchaStage] = useState<'checkbox' | 'quiz' | 'success'>('checkbox')
  const [currentQuestion, setCurrentQuestion] = useState(() => animalQuestions[Math.floor(Math.random() * animalQuestions.length)])
  const [shuffledOptions, setShuffledOptions] = useState(() => shuffleArray(currentQuestion.options))
  const [selectedAnimal, setSelectedAnimal] = useState<string | null>(null)
  const [captchaResult, setCaptchaResult] = useState<'success' | 'error' | null>(null)
  const [optionStates, setOptionStates] = useState<Record<string, 'correct' | 'wrong' | ''>>({})
  const [errorMsg, setErrorMsg] = useState('')

  // 字段错误提示
  const [usernameError, setUsernameError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const { login } = useAuth()
  const navigate = useNavigate()

  /** 点击验证码复选框 → 展示动物识别题目 */
  const handleCaptchaClick = useCallback(() => {
    if (captchaStage !== 'checkbox') return
    if (!username.trim()) {
      setUsernameError('請先輸入賬號')
      return
    }
    setUsernameError('')
    setCaptchaStage('quiz')
    setSelectedAnimal(null)
    setCaptchaResult(null)
    setOptionStates({})
  }, [captchaStage, username])

  /** 选择动物选项 → 立即判断 */
  const handleSelectAnimal = (option: string) => {
    if (captchaResult === 'success') return
    setSelectedAnimal(option)

    if (option === currentQuestion.answer) {
      setOptionStates({ [option]: 'correct' })
      setCaptchaResult('success')
      setTimeout(() => {
        setCaptchaStage('success')
      }, 800)
    } else {
      setOptionStates({
        [option]: 'wrong',
        [currentQuestion.answer]: 'correct',
      })
      setCaptchaResult('error')
      // 随机调侃提示语
      const randomMsg = teasingMessages[Math.floor(Math.random() * teasingMessages.length)]
      setErrorMsg(randomMsg)
      // 2秒后重置题目
      setTimeout(() => {
        const newQ = animalQuestions[Math.floor(Math.random() * animalQuestions.length)]
        setCurrentQuestion(newQ)
        setShuffledOptions(shuffleArray(newQ.options))
        setSelectedAnimal(null)
        setCaptchaResult(null)
        setOptionStates({})
        setErrorMsg('')
      }, 2000)
    }
  }

  /** 登录 */
  const handleLogin = () => {
    let hasError = false
    if (!username.trim()) { setUsernameError('請輸入賬號'); hasError = true }
    else { setUsernameError('') }

    if (captchaStage !== 'success') return
    if (!password.trim()) { setPasswordError('請輸入密碼'); hasError = true }
    else { setPasswordError('') }

    if (hasError) return

    setLoading(true)
    setTimeout(() => {
      const result = login(username, password)
      setLoading(false)
      if (result.success) {
        message.success('登錄成功')
        navigate('/', { replace: true })
      } else {
        message.error(result.message || '登錄失敗')
      }
    }, 600)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  const isQrMode = loginMode === 'wechat' || loginMode === 'alipay'

  // 按钮是否禁用
  const canLogin = username.trim() && captchaStage === 'success' && password.trim()

  // 按钮 tooltip 提示
  const getBtnTooltip = () => {
    if (canLogin) return ''
    if (!username.trim()) return '請輸入賬號'
    if (captchaStage !== 'success') return '請先完成驗證'
    if (!password.trim()) return '請輸入密碼'
    return ''
  }

  return (
    <div className="login-page-video">
      {/* 全屏视频背景 */}
      <VideoBackground />

      {/* 登录框 - 居中浮动 */}
      <div className="login-right">
        <div className="login-card-v2">
          {/* 右上角三角形角标 */}
          <div
            className={`login-corner-triangle ${isQrMode ? 'is-qr-mode' : ''}`}
            onClick={() => setLoginMode(isQrMode ? 'password' : 'wechat')}
            title={isQrMode ? '切換賬號密碼登錄' : '切換掃碼登錄'}
          >
            <div className="corner-triangle-bg" />
            <div className="corner-triangle-icon">
              {isQrMode ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="3" height="3" />
                  <line x1="21" y1="14" x2="21" y2="14.01" />
                  <line x1="21" y1="21" x2="21" y2="21.01" />
                  <line x1="17" y1="17" x2="17" y2="17.01" />
                  <line x1="21" y1="17" x2="21" y2="17.01" />
                </svg>
              )}
            </div>
          </div>

          <div className="login-title-v2">
            <h2>您好！歡迎登錄MFTB通用管理平台</h2>
          </div>

          {/* 账号密码登录面板 */}
          {!isQrMode && (
            <>
              <div className="login-form-v2">
                {/* 账号输入 */}
                <div className="login-field-v2">
                  <label>登錄賬號</label>
                  <Input
                    size="large"
                    placeholder="請輸入賬號或工號"
                    prefix={<UserOutlined style={{ color: '#5a5080' }} />}
                    value={username}
                    onChange={e => { setUsername(e.target.value); setUsernameError('') }}
                    onKeyDown={handleKeyDown}
                    status={usernameError ? 'error' : undefined}
                  />
                  {usernameError && <div className="field-error-tip">{usernameError}</div>}
                </div>

                {/* 验证码区域 */}
                <div className="login-field-v2">
                  <label>安全驗證</label>
                  {/* 验证复选框 */}
                  <div
                    className={`captcha-checkbox ${captchaStage === 'success' ? 'verified' : ''}`}
                    onClick={handleCaptchaClick}
                  >
                    <div className="check-box">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="captcha-label">
                      {captchaStage === 'success' ? '很好，你不是機器人 ✓' : '點擊驗證，確認你不是機器人'}
                    </span>
                    <div className="captcha-brand">
                      <div className="captcha-brand-icon">
                        <SafetyOutlined />
                      </div>
                      <span>MFTB</span>
                    </div>
                  </div>

                  {/* 动物识别验证码面板 */}
                  {captchaStage === 'quiz' && (
                    <div className="captcha-animal-panel">
                      <div className="captcha-animal-title">請識別下方的動物</div>
                      <div className="captcha-animal-display">
                        <div className="captcha-animal-emoji">{currentQuestion.emoji}</div>
                      </div>
                      <div className="captcha-animal-options">
                        {shuffledOptions.map(option => (
                          <div
                            key={option}
                            className={`captcha-animal-option ${
                              selectedAnimal === option ? 'selected' : ''
                            } ${optionStates[option] || ''}`}
                            onClick={() => handleSelectAnimal(option)}
                          >
                            {option}
                          </div>
                        ))}
                      </div>
                      {captchaResult === 'error' && (
                        <div className="captcha-message error">
                          {errorMsg || '請你稍微認真點，好嗎？'}
                        </div>
                      )}
                      {captchaResult === 'success' && (
                        <div className="captcha-message success">
                          很好，你不是機器人 🎉
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 密码输入 - 仅在验证通过后显示 */}
                {captchaStage === 'success' && (
                  <div className="login-field-v2" style={{ animation: 'captchaSlideIn 0.3s ease' }}>
                    <label>登錄密碼</label>
                    <Input
                      size="large"
                      placeholder="請輸入密碼"
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
                )}

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
                    登 錄
                  </Button>
                </Tooltip>
              </div>

              {/* 快捷登录 */}
              <div className="quick-login">
                <div className="quick-login-btns">
                  <button className="social-login-btn social-login-btn--wechat" onClick={() => setLoginMode('wechat')}>
                    <div className="social-login-btn__icon social-login-btn__icon--wechat">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                        <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.062-6.122z" />
                      </svg>
                    </div>
                  </button>
                  <button className="social-login-btn social-login-btn--alipay" onClick={() => setLoginMode('alipay')}>
                    <div className="social-login-btn__icon social-login-btn__icon--alipay">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                        <path d="M21.422 15.358c-1.152-.378-4.32-1.578-6.024-2.196a14.2 14.2 0 0 0 1.776-4.362h-3.84v-1.44h4.8V6.24h-4.8V3.6h-2.16c-.24 0-.24.24-.24.24v2.4h-4.8v1.12h4.8v1.44h-3.84v1.12h7.056a11.27 11.27 0 0 1-1.344 3.162c-1.824-.6-3.456-.9-4.896-.672-3.312.528-4.752 3.12-3.888 5.472.768 2.112 3.648 3.12 6.048 1.392 1.488-1.08 2.64-2.88 3.456-4.896 2.064.864 5.928 2.544 5.928 2.544l1.968-3.564zM8.694 18.678c-1.944.9-3.864.36-4.272-.72-.528-1.392.528-2.88 2.448-3.168 1.224-.192 2.592.096 4.08.672a8.62 8.62 0 0 1-2.256 3.216z" />
                      </svg>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* 二维码登录面板 */}
          {isQrMode && (
            <div className="login-qr-panel">
              <QRCodeView type={loginMode} label={loginMode === 'wechat' ? '微信' : '支付宝'} />
              <button className="back-to-pwd" onClick={() => setLoginMode('password')}>
                <FormOutlined /> 返回賬號密碼登錄
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
