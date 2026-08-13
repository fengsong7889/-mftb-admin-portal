/**
 * 審批流程配置 — 共享選項常量
 *
 * 供審批人配置彈窗 / 詳情頁等處複用（Mock 數據，後續接入後端 API）。
 */

/** 角色選項（與後端 sys_role 對應） */
export const ROLE_OPTIONS = [
  { label: '業務主管', value: 'FIN_BIZ_APPROVER' },
  { label: '運營主管', value: 'FIN_OPS_APPROVER' },
  { label: '財務主管', value: 'FIN_FIN_APPROVER' },
]

/** 部門選項 */
export const DEPT_OPTIONS = [
  { label: '業務部', value: 'dept_biz' },
  { label: '運營部', value: 'dept_ops' },
  { label: '財務部', value: 'dept_fin' },
  { label: '技術部', value: 'dept_tech' },
]

/** 人員選項（Mock） */
export const PERSON_OPTIONS = [
  { label: '朱元璋(001)', value: '001' },
  { label: '朱棣(002)', value: '002' },
  { label: '劉邦(000)', value: '000' },
  { label: '李世民(003)', value: '003' },
  { label: '趙匡胤(004)', value: '004' },
]

/** 按審批人類型取對應選項 */
export function getApproverOptions(type: string) {
  if (type === 'person') return PERSON_OPTIONS
  if (type === 'role') return ROLE_OPTIONS
  if (type === 'department_leader') return DEPT_OPTIONS
  return []
}

/** 按審批人類型取選項單元名稱（用於展示「N 個角色/人員/部門」） */
export function getApproverUnitName(type: string) {
  if (type === 'person') return '人員'
  if (type === 'role') return '角色'
  if (type === 'department_leader') return '部門'
  return ''
}
