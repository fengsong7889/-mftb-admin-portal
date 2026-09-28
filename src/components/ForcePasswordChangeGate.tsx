/**
 * 首次登录强制改密门禁
 *
 * 触发条件（任一即拦）：
 *  1. 登录态里 mustChangePassword=true（新建员工的初始密码 / 管理员重置后的密码）
 *  2. 业务接口被后端以 reason=PASSWORD_CHANGE_REQUIRED 拒绝（刷新恢复、后端补标记等场景）
 * <p>不可点遮罩关闭、不可 ESC、无关闭按钮——唯一出路是改密成功或主动退出登录，
 * 与后端「未改密只放行 /api/auth/*」的 fail-closed 拦截一一对应。
 */
import { useEffect, useState } from 'react'
import { Alert, Modal } from 'antd'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { PASSWORD_CHANGE_REQUIRED_EVENT } from '../api'
import PasswordChangeForm from './PasswordChangeForm'

export default function ForcePasswordChangeGate() {
  const { t } = useTranslation()
  const { isAuthenticated, user } = useAuth()
  const [blocked, setBlocked] = useState(false)

  /** 后端拦截业务接口时反馈到这里（覆盖「登录后才被识别」的时序） */
  useEffect(() => {
    const onRequired = () => setBlocked(true)
    window.addEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onRequired)
    return () => window.removeEventListener(PASSWORD_CHANGE_REQUIRED_EVENT, onRequired)
  }, [])

  /** 换账号登录时重新判定，避免沿用上一个账号的拦截状态 */
  useEffect(() => { setBlocked(false) }, [user?.username])

  if (!isAuthenticated) return null
  if (!blocked && user?.mustChangePassword !== true) return null

  return (
    <Modal
      open
      className="pwd-force-modal"
      title={t('header.forceChangeTitle')}
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      width={520}
      zIndex={2000}
    >
      <Alert className="pwd-force-alert" type="warning" showIcon message={t('header.forceChangeDesc')} />
      <PasswordChangeForm forced />
    </Modal>
  )
}
