/**
 * 修改密码表单
 *
 * 供两处共用：右上角「修改密碼」自助入口，以及首次登录/被重置后的强制改密门禁。
 * 规则清单与强度条取自 utils/passwordPolicy（与后端 PasswordPolicy 同口径）；
 * 提交成功后服务端已撤销会话，因此「本地登出 + 跳登录页」统一在这里完成，避免两个入口各写一遍。
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { Button, Input, message } from 'antd'
import { CheckCircleFilled, LogoutOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { changePassword as changePasswordApi } from '../api/auth'
import {
  PASSWORD_MAX_LENGTH,
  STRENGTH_COLOR,
  STRENGTH_LEVEL,
  assessPassword,
} from '../utils/passwordPolicy'

interface Props {
  /** 强制模式：不提供「取消」，只给「退出登錄」出口（首次登录/密码被重置时不可跳过） */
  forced?: boolean
  /** 取消/关闭（非强制模式使用） */
  onCancel?: () => void
  /** 提交成功后回调，宿主用于关闭自身容器 */
  onSubmitted?: () => void
}

export default function PasswordChangeForm({ forced = false, onCancel, onSubmitted }: Props) {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [oldPwd, setOldPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const lock = useRef(false)

  /** 新密码策略逐项评估：未达标直接禁用提交，不发无效请求 */
  const assessment = useMemo(() => assessPassword(newPwd, {
    account: user?.username,
    empId: user?.empId,
    name: user?.name,
  }), [newPwd, user?.username, user?.empId, user?.name])
  /** 确认一致性：确认框有内容才提示，避免弹窗一打开就报错 */
  const matched = !!confirmPwd && newPwd === confirmPwd
  const canSubmit = !!oldPwd && assessment.passed && matched && oldPwd !== newPwd

  const reset = useCallback(() => {
    setOldPwd('')
    setNewPwd('')
    setConfirmPwd('')
  }, [])

  const handleSubmit = async () => {
    if (!oldPwd) { message.warning(t('header.pwdRequiredOld')); return }
    if (!newPwd) { message.warning(t('header.pwdRequiredNew')); return }
    if (newPwd !== confirmPwd) { message.error(t('header.pwdMismatch')); return }
    if (!assessment.passed) { message.error(t('header.pwdRuleInvalid')); return }
    if (newPwd === oldPwd) { message.error(t('header.pwdSameAsOld')); return }
    if (lock.current) return
    lock.current = true
    setSubmitting(true)
    try {
      await changePasswordApi({ oldPassword: oldPwd, newPassword: newPwd, confirmPassword: confirmPwd })
      message.success(t('header.pwdChangedRelogin'))
      reset()
      onSubmitted?.()
      // 会话已在服务端撤销：本地直接清理，不再调登出接口（旧 Token 会命中 401 弹「登录失效」）
      await logout({ skipApi: true })
      navigate('/login', { replace: true })
    } catch (e: unknown) {
      // 静默请求：后端具体原因（当前密码不正确/连续输错锁定）在此展示
      message.error(e instanceof Error && e.message ? e.message : t('header.pwdChangeFailed'))
    } finally {
      lock.current = false
      setSubmitting(false)
    }
  }

  /** 强制模式的唯一退路：放弃使用系统 */
  const handleLogout = async () => {
    if (submitting) return
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="pwd-form">
      <div className="pwd-field">
        <label className="pwd-label" htmlFor="pwd-old">{t('header.pwdLabelOld')}</label>
        <Input.Password id="pwd-old" autoFocus autoComplete="current-password" disabled={submitting}
          placeholder={t('header.enterOldPwd')} value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} />
      </div>

      <div className="pwd-field">
        <label className="pwd-label" htmlFor="pwd-new">{t('header.pwdLabelNew')}</label>
        <Input.Password id="pwd-new" autoComplete="new-password" disabled={submitting}
          status={assessment.empty || assessment.passed ? undefined : 'error'}
          placeholder={t('header.enterNewPwd')} value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)} maxLength={PASSWORD_MAX_LENGTH} />
        <div className="pwd-strength">
          <div className="pwd-strength-bars" aria-hidden="true">
            {[1, 2, 3, 4].map((level) => (
              <span key={level} className="pwd-strength-bar" style={{
                background: !assessment.empty && level <= STRENGTH_LEVEL[assessment.strength]
                  ? STRENGTH_COLOR[assessment.strength]
                  : '#F0F0F0',
              }} />
            ))}
          </div>
          <span className="pwd-strength-label" style={{ color: assessment.empty ? '#BFBFBF' : STRENGTH_COLOR[assessment.strength] }}>
            {assessment.empty ? t('header.pwdStrengthPlaceholder') : t(`header.pwdStrength.${assessment.strength}`)}
          </span>
        </div>
        <ul className="pwd-rules" aria-label={t('header.pwdRulesAria')}>
          {assessment.rules.map((rule) => (
            <li key={rule.key} className={rule.passed ? 'pwd-rule is-passed' : 'pwd-rule'}>
              {rule.passed ? <CheckCircleFilled /> : <MinusCircleOutlined />}
              <span>{t(`header.pwdRule.${rule.key}`)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pwd-field">
        <label className="pwd-label" htmlFor="pwd-confirm">{t('header.pwdLabelConfirm')}</label>
        <Input.Password id="pwd-confirm" autoComplete="new-password" disabled={submitting}
          status={confirmPwd && !matched ? 'error' : undefined}
          placeholder={t('header.confirmNewPwd')} value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)} maxLength={PASSWORD_MAX_LENGTH} />
        {confirmPwd && (
          <div className={matched ? 'pwd-match is-passed' : 'pwd-match is-failed'}>
            {matched ? <CheckCircleFilled /> : <MinusCircleOutlined />}
            <span>{matched ? t('header.pwdMatchOk') : t('header.pwdMismatch')}</span>
          </div>
        )}
      </div>

      <div className="pwd-note">{forced ? t('header.pwdChangeTipForced') : t('header.pwdChangeTip')}</div>

      <div className="pwd-actions">
        {forced ? (
          <Button icon={<LogoutOutlined />} disabled={submitting} onClick={() => { void handleLogout() }}>
            {t('header.forceChangeLogout')}
          </Button>
        ) : (
          <Button disabled={submitting} onClick={onCancel}>{t('common.cancel')}</Button>
        )}
        <Button type="primary" disabled={!canSubmit || submitting} loading={submitting}
          onClick={() => { void handleSubmit() }}>
          {t('header.pwdSubmit')}
        </Button>
      </div>
    </div>
  )
}
