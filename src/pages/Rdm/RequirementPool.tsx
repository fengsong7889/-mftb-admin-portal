/**
 * 认领/分配（原需求管理）—— 只管「待分配」需求的中转页
 *
 * 业务口径：
 * - 只展示待分配（pool）的需求，认领/分配出去后就不在本菜单展示；
 * - 不展示视角 Tab、不展示看板视图、不展示导出；
 * - 动作只有：分配（项目经理）/ 认领（产品经理）。
 *
 * 权限口径：全量可见 = rdm-intake:view（过渡期与 rdm-requirement:view_all 并行）；
 * 分配权 = rdm-intake:edit（过渡期与 rdm-requirement:dispatch 并行）；
 * 认领 = 受理权（由列表内部按 rdm-requirement:edit 判定）。
 */
import RequirementList from './RequirementList'
import { RDM_SCOPE } from '../../constants/rdm'

export default function RequirementPool() {
  return (
    <RequirementList
      pageRole="management"
      defaultScope={RDM_SCOPE.POOL}
      scopeTabs={[]}
      advancedFilters
      minimal
    />
  )
}
