/**
 * 列表页状态开关（AGENTS.md §B.8 的唯一实现）
 *
 * 为什么抽成组件：§B.8 有三条硬约束（文案固定「啟用/停用」、列表页不得用小尺寸、
 * 切换必须二次确认且不得直接调 API）。RDM 原先 5 个配置页各写一遍，
 * 结果 5 处全违规 —— 而且有一处注释写着「必须二次确认」，代码却是 message.warning 后照样执行。
 * 收敛到一个组件后，这三条约束由组件保证，调用方只提供「确认后要做什么」。
 *
 * 关键行为：开关是**受控**的，点击后先弹确认，用户确认并成功执行回调才由父组件刷新数据；
 * 中途失败不乐观翻转状态（否则界面显示已启用而库里仍是停用，比报错更糟）。
 */
import type { ReactNode } from 'react'
import { Modal, Switch, message } from 'antd'

interface StatusSwitchProps {
  /** 当前状态（来自数据，不做本地乐观更新） */
  checked: boolean
  /** 目标名称，写进确认文案，让用户知道在动哪一条 */
  target?: ReactNode
  /** 确认后执行；抛错视为失败，组件不改状态 */
  onConfirm: (next: boolean) => Promise<void> | void
  /**
   * 覆盖默认的「影响」说明行。
   * <p>用于影响因数据而异的场景（如启用一条积分规则会顶掉当前生效规则），
   * 让风险在确认前就说清，而不是先 warn 一句照样提交。
   */
  impact?: ReactNode
  disabled?: boolean
}

export default function StatusSwitch({ checked, target, onConfirm, impact, disabled }: StatusSwitchProps) {
  const nextEnabled = !checked
  const actionText = nextEnabled ? '啟用' : '停用'

  const requestToggle = () => {
    Modal.confirm({
      title: `確定要${actionText}該配置嗎？`,
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: (
        <div className="confirm-info-card">
          {target && <div className="confirm-info-row"><span>對象：</span><b>{target}</b></div>}
          <div className="confirm-info-row">
            <span>影響：</span>
            <b>{impact ?? (nextEnabled ? '啟用後立即參與運行規則' : '停用後新的業務數據將不再套用此配置')}</b>
          </div>
        </div>
      ),
      okText: '確認',
      cancelText: '取消',
      onOk: async () => {
        try {
          await onConfirm(nextEnabled)
          message.success(`${actionText}成功`)
        } catch (err) {
          // 失败必须显式回到界面：静默失败会让用户以为已切换
          message.error(err instanceof Error && err.message ? err.message : `${actionText}失敗，請重試`)
          throw err
        }
      },
    })
  }

  return (
    <Switch
      checked={checked}
      disabled={disabled}
      checkedChildren="啟用"
      unCheckedChildren="停用"
      onChange={requestToggle}
    />
  )
}
