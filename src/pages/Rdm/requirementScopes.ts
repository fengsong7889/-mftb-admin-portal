/**
 * 需求列表的视角（Tab）定义与参数解析。
 *
 * 单独成文件的原因：这些是常量与纯函数，不是组件。放在 RequirementList.tsx 里
 * 会让该文件同时导出组件与常量，破坏 React Fast Refresh（eslint react-refresh/only-export-components），
 * 开发时改一行页面就整页重载丢状态；抽出来后测试也能直接引纯函数，不必拖起整个组件。
 */
import { RDM_SCOPE, type RdmScope } from '../../constants/rdm'

/**
 * 全部合法视角（用于校验 URL 上的 ?scope=）。
 * <p>不等于页面展示的视角：需求管理/提交需求各自锁一组 Tab，
 * 但作为数据切片仍会被菜单入口与深链使用（如 /rdm-intake 预选 pool）。
 */
export const VALID_SCOPES: RdmScope[] = [
  RDM_SCOPE.MINE,
  RDM_SCOPE.TODO,
  RDM_SCOPE.APPROVING,
  RDM_SCOPE.POOL,
  RDM_SCOPE.PRODUCT,
  RDM_SCOPE.DELIVERY,
  RDM_SCOPE.ACCEPTANCE,
  RDM_SCOPE.ALL,
]

/**
 * 需求清单（执行侧）默认展示的视角。
 * <p>只放“已落到我手上要执行”的切片：
 * - 需求池·待分配 / 待我審批 / 全部需求 → 属于上游审批与分配环节，在「需求池」菜单；
 * - 待我驗收 → 「需求驗收」菜单。
 * <p>动线是：提出 → 准入審批 → 进需求池 → 分配 → 才进入本清单执行。
 * <p>「我提的需求」同时保留在清单页：提需求页已去掉该 Tab（避免两页同一份后端口径重复展示），
 * 而提出人普遍只有清单页授权，摘掉等于断掉他们对自己需求进展的自查入口。
 */
export const EXECUTION_SCOPES: RdmScope[] = [
  RDM_SCOPE.MINE,
  RDM_SCOPE.TODO,
  RDM_SCOPE.PRODUCT,
  RDM_SCOPE.DELIVERY,
]

/**
 * 视图分组：把切片按「我自己的事」和「治理别人的事」分开。
 * <p>审批人/提出人与分配人不是同一批角色，混在一排 Tab 里时高层会误入分配区、
 * PM 会看到与自己无关的审批列（这也是菜单拆分的同一动因）。
 */
export const PERSONAL_SCOPES: RdmScope[] = [
  RDM_SCOPE.MINE,
  RDM_SCOPE.TODO,
  RDM_SCOPE.APPROVING,
  RDM_SCOPE.ACCEPTANCE,
]

/**
 * 决定本页实际生效的视角。
 * <p>URL 是单一数据源，但「合法 scope」不等于「本页有的视角」：菜单拆分后三页各锁一组 Tab，
 * 照单采纳 URL 参数时，`/rdm-intake-approval?scope=mine` 会让页面停在一个没有 Tab 的视角上 ——
 * 列表有数据但用户看不出自己在哪个视图、也点不回来。
 * <p>所以超出本页 Tab 集的参数一律回到默认视角；scopeTabs 为空的 minimal 页（认领/分配）
 * 保持原有语义（按合法集采纳），不在本批次改它的行为。
 */
export function resolveActiveScope(
  rawScope: string | null,
  scopeTabs: readonly RdmScope[],
  defaultScope?: RdmScope,
): RdmScope {
  const fallback = defaultScope ?? RDM_SCOPE.MINE
  if (!rawScope || !(VALID_SCOPES as string[]).includes(rawScope)) {
    return fallback
  }
  if (scopeTabs.length > 0 && !(scopeTabs as readonly string[]).includes(rawScope)) {
    return fallback
  }
  return rawScope as RdmScope
}
