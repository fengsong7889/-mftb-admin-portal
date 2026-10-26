/**
 * 任務進度口徑單測（純函數，不渲染頁面）
 *
 * 釘死兩條線上踩過的口徑：
 *  1. 「開始」只推狀態，載荷裡不得出現進度——帶上就會寫出「進行中 + 100%」的矛盾任務；
 *  2. 100% 只屬於完成態，未完成任務列表顯示按 99% 封頂，避免「100% 卻還標逾期」。
 */
import { describe, expect, it } from 'vitest'
import { RDM_TASK_ACTION, RDM_TASK_STATUS } from '../../constants/rdm'
import { buildTaskReportPayload, displayTaskProgress } from './rdmTaskProgress'

describe('buildTaskReportPayload', () => {
  it('「開始」只帶動作，不帶進度（哪怕面板裡還留著 100）', () => {
    const payload = buildTaskReportPayload(RDM_TASK_ACTION.START, { progress: 100 })
    expect(payload).toEqual({ action: 'start' })
    expect(payload).not.toHaveProperty('progress')
  })

  it('「上報進度」按填寫值上報，不擅自改成 100', () => {
    const payload = buildTaskReportPayload(RDM_TASK_ACTION.PROGRESS, { progress: 30, actualHours: 2.5, remark: '联调' })
    expect(payload.action).toBe('progress')
    expect(payload.progress).toBe(30)
    expect(payload.actualHours).toBe(2.5)
    expect(payload.remark).toBe('联调')
  })

  it('「完成」固定 100，空說明不塞空字串', () => {
    const payload = buildTaskReportPayload(RDM_TASK_ACTION.DONE, { progress: 40, remark: '  ' })
    expect(payload.progress).toBe(100)
    expect(payload.remark).toBeUndefined()
  })

  it('阻塞/解除阻塞保留原動作，不改寫進度', () => {
    expect(buildTaskReportPayload(RDM_TASK_ACTION.BLOCK, { progress: 60, remark: '等接口' }).progress).toBe(60)
    expect(buildTaskReportPayload(RDM_TASK_ACTION.UNBLOCK, { progress: 60 })).toEqual({
      action: 'unblock',
      progress: 60,
      actualHours: undefined,
      remark: undefined,
    })
  })
})

describe('displayTaskProgress', () => {
  it('未完成的任務按 99% 封頂：歷史 100% 臟數據不再顯示成已滿', () => {
    expect(displayTaskProgress(RDM_TASK_STATUS.DOING, 100)).toBe(99)
    expect(displayTaskProgress(RDM_TASK_STATUS.TODO, 0)).toBe(0)
    expect(displayTaskProgress(RDM_TASK_STATUS.BLOCKED, 45)).toBe(45)
  })

  it('已完成的任務顯示 100%，缺值也不倒退', () => {
    expect(displayTaskProgress(RDM_TASK_STATUS.DONE, 100)).toBe(100)
    expect(displayTaskProgress(RDM_TASK_STATUS.DONE, null)).toBe(100)
  })
})
