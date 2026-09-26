import { CERT_STATUS, CERT_TYPE } from '../../api/hrCertificate'

/** 证明类型 → i18n key（与后端 HR 字典 CERT_TYPE code 一致） */
export const CERT_TYPE_LABEL_KEY: Record<string, string> = {
  [CERT_TYPE.EMPLOYMENT]: 'hrCert.typeEmployment',
  [CERT_TYPE.INCOME]: 'hrCert.typeIncome',
  [CERT_TYPE.RESIGNATION]: 'hrCert.typeResignation',
  [CERT_TYPE.OTHER]: 'hrCert.typeOther',
}

/** 下拉展示顺序 */
export const CERT_TYPE_ORDER: string[] = [
  CERT_TYPE.EMPLOYMENT, CERT_TYPE.INCOME, CERT_TYPE.RESIGNATION, CERT_TYPE.OTHER,
]

/** 语种 → i18n key */
export const CERT_LANG_LABEL_KEY: Record<string, string> = {
  ZH: 'hrCert.langZh', EN: 'hrCert.langEn', BOTH: 'hrCert.langBoth',
}

/** 状态 → i18n key / Tag 颜色 */
export const CERT_STATUS_LABEL_KEY: Record<string, string> = {
  [CERT_STATUS.DRAFT]: 'hrCert.statusDraft',
  [CERT_STATUS.PENDING]: 'hrCert.statusPending',
  [CERT_STATUS.APPROVED]: 'hrCert.statusApproved',
  [CERT_STATUS.REJECTED]: 'hrCert.statusRejected',
  [CERT_STATUS.CANCELLED]: 'hrCert.statusCancelled',
  [CERT_STATUS.COMPLETED]: 'hrCert.statusCompleted',
}

export const CERT_STATUS_TAG_COLOR: Record<string, string> = {
  [CERT_STATUS.DRAFT]: 'default', [CERT_STATUS.PENDING]: 'processing',
  [CERT_STATUS.APPROVED]: 'warning', [CERT_STATUS.REJECTED]: 'error',
  [CERT_STATUS.CANCELLED]: 'default', [CERT_STATUS.COMPLETED]: 'success',
}

/** 列表状态页签（all=全部） */
export const CERT_STATUS_TABS: string[] = ['all', CERT_STATUS.DRAFT, CERT_STATUS.PENDING,
  CERT_STATUS.REJECTED, CERT_STATUS.APPROVED, CERT_STATUS.COMPLETED]

/** 证明类型 → 是否涉及薪酬敏感信息（收入证明仅登记申请，金额不由本系统输出） */
export const SENSITIVE_CERT_TYPES: string[] = [CERT_TYPE.INCOME]
