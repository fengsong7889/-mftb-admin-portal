import { useEffect, useState } from 'react'
import { Alert } from 'antd'
import { useTranslation } from 'react-i18next'
import { fetchMyOrgScope } from '../api/orgScope'
import type { OrgScopeInfo } from '../api/orgScope'
import { DATA_SCOPE, dataScopeLabelKey } from '../constants/dataScope'

/**
 * 数据范围提示横幅：告诉用户「现在按什么口径看数」。
 *
 * 为什么必须有：角色带上受限范围（仅本人/本部门/自定部门）后，列表行数会少于用户预期，
 * 不写清楚就会被当成「数据丢了」——反复刷新、提工单，甚至让管理员去改查询条件来"找回来"。
 * 它只描述当前登录人自己的范围档位，不含任何他人数据，因此不需要菜单权限。
 *
 * 位置：按 §E.8 属于「说明横幅」，渲染在 `.search-section` 上方，不是统计卡片。
 */
export default function OrgScopeNotice() {
  const { t } = useTranslation()
  const [scope, setScope] = useState<OrgScopeInfo | null>(null)

  useEffect(() => {
    let alive = true
    fetchMyOrgScope()
      .then(data => {
        if (alive) setScope(data)
      })
      // 静默：范围提示取不到时不显示即可，绝不能挡住列表本身，也不甩红色 toast
      .catch(() => {
        if (alive) setScope(null)
      })
    return () => {
      alive = false
    }
  }, [])

  // 不限制（超管 / 角色档位为「全部」）时不提示：加了反而让人以为数据被动过手脚
  if (!scope || scope.unlimited || scope.scope === DATA_SCOPE.ALL) {
    return null
  }

  return (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
      message={t('orgScope.notice', {
        label: t(dataScopeLabelKey(scope.scope)),
        users: scope.userCount ?? 0,
      })}
    />
  )
}
