/**
 * 需求管理（需求池）—— 分配侧的治理页（技术负责人 / 产品总监 / 项目经理）
 *
 * 菜单拆分后这里只留分配相关的两个视角：「需求池·待分配」是主战场，
 * 「全部需求」用于回看已分配与在途负载。原本的「待我審批」已拆给业务侧菜单
 * 「提交需求」（RequirementIntake），因为审批人与分配人不是同一批角色，
 * 留在同一页会让高层误入分配区，也让 PM 每天看到与自己无关的审批列。
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

/** 分配侧视角：待分配是主战场，全部需求用于回看与收敛负载 */
const DISPATCH_SCOPES = [
  RDM_SCOPE.POOL,
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
