/**
 * 提交需求（业务侧）—— 只处理「提出与审批跟踪」，不进入执行环节
 *
 * 用户确认的业务规则：
 * - 提交侧只负责提交需求 + 展示审批流程；审批全部通过或服务端明确免审批后，
 *   需求才进入「需求管理」，本页不再出现草稿之外的需求；
 * - 需要审批的提交生成本轮 XQSP 审批流程编号；审批通过前不生成正式需求编号
 *   （服务端延迟发号已上线，所以「需求編號」列在准入前就是「尚未生成」，
 *   不得用 XQSP 流程号或内部 id 填充）；
 * - 免审批的提交记录标记「免审批」并展示策略依据，需求编号立即生成。
 *
 * 视角 Tab：
 * - approving：待我审批（服务端按「OA 当前审批人=我」收敛，只覆盖本轮待办）。
 * <p>本页不再重复提供「我的提交」：它与「需求跟进清单」的我提的需求是同一后端口径
 * （SCOPE_MINE 按提出人收敛），两页各放一次就是用户看到的冗余。保留在清单页而不是本页，
 * 因为提出人普遍只有清单页授权（rdm-intake-approval 目前仅 admin 被授过），
 * 从清单页摘掉会直接断掉他们对自己需求进展的唯一自查入口。
 * <p>草稿仍可推进：清单页 mine 保留草稿的「編輯/提交」（只靠服务端 SELF_SUBMITTABLE 拦），
 * 且本页仍保留「提需求」按钮（拆页时故意只在提交侧与清单侧给，治理侧不给）。
 *
 * 权限锚点：本菜单只带 view，分配权认 rdm-intake:edit（过渡期与 rdm-requirement:dispatch 并行）；
 * 提交/重提/撤回
 * 走独立入口（服务端只要求 create），不给员工开产品处理权 edit。
 */
import RequirementList from './RequirementList'
import { RDM_SCOPE } from '../../constants/rdm'

/** 审批侧视角：只留「该我审的」；「我提的」统一去需求跟进清单看 */
const INTAKE_SCOPES = [
  RDM_SCOPE.APPROVING,
] as const

export default function RequirementIntake() {
  return (
    <RequirementList
      pageRole="intake"
      defaultScope={RDM_SCOPE.APPROVING}
      scopeTabs={INTAKE_SCOPES}
    />
  )
}
