/**
 * 需求池 —— 分配与审批环节的总台（技术负责人 / 产品总监）
 *
 * 它不是"只看未分配的单子"，而是分配侧的全景页：视角 Tab 给
 * 「需求池·待分配 / 待我審批 / 全部需求」，默认落在待分配，并可按提出部门、
 * 产品经理、是否逾期收敛 —— 要在全公司范围里决定谁接，就得能这样筛。
 *
 * 为什么不与「需求清单」合并成一个菜单：两者权限性质不同。
 * 需求清单是人人可看的宽权限，数据范围到自己相关的切片为止；
 * 而全量可见（canSeeAll 认 rdm-intake:view）与分配权（MENU_DISPATCHER 认 rdm-intake:edit）
 * 天然同侧 —— 看不到单子就分不出去，所以两者都锁在需求池这一个窄权限菜单上，
 * 而不是摊到宽权限的台账菜单里，避免"给个查看权就顺带能看全公司需求"。
 *
 * 列表实现仍与需求清单共用，只是换一组 Tab 与筛选条件，不会出现两份代码各自演化。
 */
import RequirementList from './RequirementList'
import { RDM_SCOPE } from '../../constants/rdm'

/** 分配侧视角：待分配是主战场，审批与全量是它的上下游 */
const DISPATCH_SCOPES = [
  RDM_SCOPE.POOL,
  RDM_SCOPE.APPROVING,
  RDM_SCOPE.ALL,
] as const

export default function RequirementPool() {
  return (
    <RequirementList
      defaultScope={RDM_SCOPE.POOL}
      scopeTabs={DISPATCH_SCOPES}
      advancedFilters
    />
  )
}
