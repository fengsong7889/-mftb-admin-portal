/** 演示动作的二次确认，不包含 API 或持久化逻辑。 */
import type { ReactNode } from 'react'
import { Modal } from 'antd'

export function confirmPreview(title: string, content: ReactNode, onOk: () => void, dangerous = false) {
  Modal.confirm({
    title,
    content: <div className="confirm-info-card">{content}<p>僅演示介面變化，不寫入伺服器。</p></div>,
    className: 'custom-confirm-modal',
    icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
    okText: '確認演示', cancelText: '取消', okButtonProps: { danger: dangerous }, onOk,
  })
}
