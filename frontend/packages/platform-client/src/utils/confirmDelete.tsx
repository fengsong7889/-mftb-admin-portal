import { Modal } from 'antd'
import type { ReactNode } from 'react'

export interface ConfirmDeleteOptions {
  title: string
  /** 影响说明：删除是不可逆操作，必须写清“删了什么、会怎样” */
  content?: ReactNode
  okText?: string
  onOk: () => Promise<void> | void
}

/**
 * 统一删除确认：Modal.confirm + custom-confirm-modal + 规范图标。
 *
 * <p>背景：列表页删除此前用 Popconfirm（只有标题、无正文），与“發布”使用的
 * Modal.confirm 不一致，也说不清删除范围。这里收敛为一个入口，避免每页各写一份。
 */
export function confirmDelete({ title, content, okText = '刪除', onOk }: ConfirmDeleteOptions) {
  Modal.confirm({
    title,
    className: 'custom-confirm-modal',
    icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
    content,
    okText,
    okButtonProps: { danger: true },
    cancelText: '取消',
    onOk,
  })
}
