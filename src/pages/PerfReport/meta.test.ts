import { describe, expect, it } from 'vitest'
import { APPEAL_OPEN, APPEAL_STATUS, PERF_LOG_ACTION } from '../../api/hrPerfReport'
import {
  APPEAL_STATUS_LABEL_KEY, APPEAL_STATUS_TABS, LOG_ACTION_LABEL_KEY, LOG_ACTION_ORDER,
  PERF_REPORT_MENU, appealPathOfPlan, auditPathOfPlan,
} from './meta'

/**
 * 台账域（M2）展示元数据自检。
 * 重点是"前端 key 与后端常量必须同名"——菜单 key、状态码、动作码任何一处漂移，
 * 表现都是页面显示英文 code 或权限判定静默失效。
 */
describe('績效台账展示口径', () => {
  it('四个留痕动作都有文案 key', () => {
    Object.values(PERF_LOG_ACTION).forEach(code => {
      expect(LOG_ACTION_LABEL_KEY[code], `动作 ${code} 缺文案`).toBeTruthy()
    })
    expect(LOG_ACTION_ORDER).toEqual([PERF_LOG_ACTION.CALIBRATE,
      PERF_LOG_ACTION.APPEAL_REVISE, PERF_LOG_ACTION.DIST_WAIVER, PERF_LOG_ACTION.REASSIGN])
  })

  it('四个申诉状态都有文案，且页签覆盖全部状态', () => {
    Object.values(APPEAL_STATUS).forEach(code => {
      expect(APPEAL_STATUS_LABEL_KEY[code], `状态 ${code} 缺文案`).toBeTruthy()
    })
    const tabbed = APPEAL_STATUS_TABS.filter(k => k !== 'all')
    expect(tabbed.sort()).toEqual(Object.values(APPEAL_STATUS).sort())
  })

  it('终态（已办结/已驳回）不在可受理集合内', () => {
    expect(APPEAL_OPEN).toEqual([APPEAL_STATUS.PENDING, APPEAL_STATUS.PROCESSING])
    expect(APPEAL_OPEN).not.toContain(APPEAL_STATUS.RESOLVED)
    expect(APPEAL_OPEN).not.toContain(APPEAL_STATUS.REJECTED)
  })

  it('菜单 key 与后端 HrPerfConstants 一致', () => {
    expect(PERF_REPORT_MENU).toMatchObject({
      DOMAIN: 'perf-report-center',
      LEDGER: 'hr-perf-ledger',
      AUDIT: 'hr-perf-audit',
      APPEAL: 'hr-perf-appeal',
    })
  })

  it('台账页签默认全部在首，且不重复', () => {
    expect(APPEAL_STATUS_TABS[0]).toBe('all')
    expect(new Set(APPEAL_STATUS_TABS).size).toBe(APPEAL_STATUS_TABS.length)
  })

  it('跨页跳转带上的筛选参数格式正确', () => {
    expect(auditPathOfPlan(7)).toBe('/hr-perf-audit?planId=7')
    expect(appealPathOfPlan(7)).toBe('/hr-perf-appeal?planId=7')
  })
})
