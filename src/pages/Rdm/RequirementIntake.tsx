/**
 * 提交需求 —— 业务侧入口（提出人 + 审批人同一视角）
 *
 * 它把「需求池·分配」里原本混在一起的职责拆开：业务方进来只关心两件事——
 * 我提的单子走到哪了（我的提交），以及轮到我审的单子（待我審批）。
 * 分配产品经理不属于这里，那是「需求管理」（需求池）的职责。
 *
 * <p>为什么审批放在这个菜单而不是分配侧：审批人由准入策略与 OA 流程决定，
 * 通常是提出人的主管或公司高层，与决定谁接单的产品经理不是同一批人。
 *
 * <p>权限口径没有变松：
 * - `mine` 由服务端按提出人收敛，只能看到自己提的；
 * - `approving` 由服务端按「OA 当前审批人=我」收敛，看不到别人的审批任务；
 * - 本菜单不携带分配权，分配动作仍然只认 rdm-intake:edit，由列表内部按权限决定按钮显隐。
 *
 * 列表实现与需求清单共用，只是换一组视角 Tab，避免出现两份各自演化的列表。
 */
import RequirementList from './RequirementList'
import { RDM_SCOPE } from '../../constants/rdm'

/** 业务侧视角：先看到自己提的，再看到该自己审的 */
const INTAKE_SCOPES = [
  RDM_SCOPE.MINE,
  RDM_SCOPE.APPROVING,
] as const

export default function RequirementIntake() {
  return (
    <RequirementList
      defaultScope={RDM_SCOPE.MINE}
      scopeTabs={INTAKE_SCOPES}
    />
  )
}
