/**
 * 预览（演示）数据的读取与提交辅助 Hook。
 *
 * 演示状态放在 returnPreview.ts 的模块级单例里，而不是 React state，
 * 目的是让退料、验收、异常处理等多个页面看到同一份数据。这里用
 * useSyncExternalStore 接进去，而不是自己写 useEffect + setState：前者能避开
 * “先读快照再订阅”之间的丢事件窗口，并发渲染下也不会拿到旧值。
 * 第三个参数（服务端快照）传同一个函数即可，本页面无 SSR。
 */
import { useRef, useState, useSyncExternalStore } from 'react'
import { Modal } from 'antd'
import type { FormInstance } from 'antd'
import { getPreviewState, subscribePreview } from './returnPreview'

/** 订阅预览单例的当前快照 */
export function useReturnPreview() { return useSyncExternalStore(subscribePreview, getPreviewState, getPreviewState) }

/**
 * 预览页的统一提交链路：表单校验 → 二次确认 → 交给 onSubmit。
 * 确认文案里明说“仅更新本页演示数据”，防止用户误以为已提交业务单据；
 * 真实接口接通后本 Hook 应整体废弃，而不是在其上加真实请求。
 *
 * active 用 ref 做入口守卫：validateFields 是异步的，期间按钮仍可被再点击，
 * 靠 state 回传锁会慢一帧而漏拦截。error 只接 Error 实例，表单校验失败（antd
 * 抛的是 errorInfo 对象）不在此处回显，交由字段本身标红。
 */
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
