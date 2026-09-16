import { useRef, useState, useSyncExternalStore } from 'react'
import { Modal } from 'antd'
import type { FormInstance } from 'antd'
import { getPreviewState, subscribePreview } from './returnPreview'

export function useReturnPreview() { return useSyncExternalStore(subscribePreview, getPreviewState, getPreviewState) }

export function usePreviewSubmit<T>(form: FormInstance<T>, onSubmit: (values: T) => void, summary: (values: T) => string) {
  const [modal, contextHolder] = Modal.useModal()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const active = useRef(false)
  const handleSubmit = async () => {
    if (active.current) return
    active.current = true
    setBusy(true)
    setError(undefined)
    try {
      const values = await form.validateFields()
      const confirmed = await modal.confirm({
        title: '确认演示此操作？', className: 'custom-confirm-modal',
        content: `${summary(values)}。仅更新本页演示数据，不提交业务数据，也不执行支付。`,
        okText: '确认演示', cancelText: '继续检查',
      })
      if (confirmed) onSubmit(values)
    } catch (e) {
      if (e instanceof Error) setError(e.message)
    } finally {
      active.current = false
      setBusy(false)
    }
  }
  return { handleSubmit, busy, error, contextHolder }
}
