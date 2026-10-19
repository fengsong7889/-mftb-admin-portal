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
 * 视角：本页只有 SCOPE.INTAKE 一个合并切片 ——「本人提交的 ∪ 待本人審批的」，
 * 由后端 RdmConstants.SCOPE_INTAKE 一条 OR 条件接住（见 RdmRequirementServiceImpl
 * 的 applySubmitterUnion），分页/统计/计数都跟同一个口径。
 * <p>历史上这里是左侧视图栏 + mine/approving 两个切片，但拆页后只剩 approving 一个，
 * 视图栏就退化成一个点不动的「我的需求」分组标题，且提出人看不到自己提的单，
 * 只能再跑去「需求清单」另一个菜单 —— 已按用户要求合并成一张列表，视图栏不再出现
 * （RequirementList 在切片数 <= 1 时不渲染视图栏）。
 * <p>草稿仍可推进：合并视图保留草稿的「編輯/提交」（只靠服务端 SELF_SUBMITTABLE 拦），
 * 「提需求」按钮也仍在本侧（治理侧不给）。
 *
 * 权限锚点：本菜单只带 view，分配权认 rdm-intake:edit（过渡期与 rdm-requirement:dispatch 并行）；
 * 提交/重提/撤回
 * 走独立入口（服务端只要求 create），不给员工开产品处理权 edit。
 */
import RequirementList from './RequirementList'
import { RDM_SCOPE } from '../../constants/rdm'

/**
 * 提交侧唯一视角：合并切片。
 * <p>仍传 scopeTabs（而不是空数组）：这样旧书签 `?scope=mine` / `?scope=approving`
 * 会被 resolveActiveScope 判为「本页没有的视角」并回落到合并视图，
 * 不会让页面停在一个只剩半个切片的口径上。
 */
const INTAKE_SCOPES = [
  RDM_SCOPE.INTAKE,
] as const

export default function RequirementIntake() {
  return (
    <RequirementList
      pageRole="intake"
      defaultScope={RDM_SCOPE.INTAKE}
      scopeTabs={INTAKE_SCOPES}
    />
  )
}
