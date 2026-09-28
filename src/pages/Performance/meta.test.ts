import { describe, expect, it } from 'vitest'
import {
  ASSESS_STATUS, INDICATOR_SCORE_MAX, matchGrade, parseGradeScheme, previewWeighted, sortGrades,
} from '../../api/hrPerformance'
import { ASSESS_STATUS_LABEL_KEY, GRADE_LABEL_KEY, PERF_MENU, PLAN_STAGES } from './meta'

/**
 * 前端只做展示与即时预览，真值口径在服务端；这里守住两件事：
 * 1) 预览算法与服务端加权/等级映射口径一致（不一致会让 HR 以为分数被篡改）；
 * 2) 枚举与菜单 key 不缺失（缺 key 会让状态列直接显示英文 code）。
 */
describe('hrPerformance 预览口径', () => {
  it('总分按权重加权，而不是简单平均', () => {
    // 权重 70/30，得分 80/100：平均 90，加权应为 86
    const total = previewWeighted([
      { weight: 70, score: 80 },
      { weight: 30, score: 100 },
    ])
    expect(total).toBe(86)
  })

  it('未评分的指标不参与加权；权重合计为 0 时不给假分数', () => {
    expect(previewWeighted([{ weight: 70, score: 80 }, { weight: 30, score: null }])).toBe(80)
    expect(previewWeighted([{ weight: 0, score: 50 }])).toBeNull()
    expect(previewWeighted([])).toBeNull()
  })

  it('等级映射取"不超过得分的最高下限"，越界返回空', () => {
    const grades = parseGradeScheme('[{"code":"S","minScore":90},{"code":"A","minScore":80},{"code":"B","minScore":60}]')
    expect(grades).toHaveLength(3)
    expect(matchGrade(grades, 90)).toBe('S')
    expect(matchGrade(grades, 89.99)).toBe('A')
    expect(matchGrade(grades, 60)).toBe('B')
    expect(matchGrade(grades, 59.9)).toBeUndefined()
    expect(matchGrade(grades, null)).toBeUndefined()
    expect(matchGrade([], 88)).toBeUndefined()
  })

  it('脏 JSON 解析为空方案而不是抛错炸页面', () => {
    expect(parseGradeScheme(undefined)).toEqual([])
    expect(parseGradeScheme('')).toEqual([])
    expect(parseGradeScheme('not-json')).toEqual([])
    expect(parseGradeScheme('{"code":"S"}')).toEqual([])
  })

  it('等级按分值下限降序排列（S→D），与后端存储顺序一致', () => {
    const sorted = sortGrades([
      { code: 'B', minScore: 60 }, { code: 'S', minScore: 90 }, { code: 'A', minScore: 80 },
    ])
    expect(sorted.map(g => g.code)).toEqual(['S', 'A', 'B'])
  })

  it('指标满分与后端常量一致', () => {
    expect(INDICATOR_SCORE_MAX).toBe(100)
  })
})

describe('绩效域展示元数据', () => {
  it('六个考核单状态都有文案 key', () => {
    Object.values(ASSESS_STATUS).forEach(code => {
      expect(ASSESS_STATUS_LABEL_KEY[code], `状态 ${code} 缺文案`).toBeTruthy()
    })
  })

  it('五个默认等级都有文案 key', () => {
    ;['S', 'A', 'B', 'C', 'D'].forEach(code => {
      expect(GRADE_LABEL_KEY[code], `等级 ${code} 缺文案`).toBeTruthy()
    })
  })

  it('进度看板的阶段字段与后端计划视图同名', () => {
    expect(PLAN_STAGES.map(s => s.field)).toEqual([
      'selfPending', 'supervisorPending', 'calibrationPending', 'confirmPending', 'confirmed',
    ])
  })

  it('菜单 key 与后端 HrPerfConstants 保持一致', () => {
    expect(PERF_MENU).toMatchObject({
      DOMAIN: 'perf-center',
      ADMIN: 'hr-perf-admin',
      REVIEW: 'hr-perf-review',
      CALIBRATION: 'hr-perf-calibration',
      SELF: 'ess-performance',
    })
  })
})
