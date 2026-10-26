/**
 * 考勤假勤枚举映射与 i18n 键完整性测试。
 *
 * 为什么单独测这个：枚举标签走 `t(map[code])` 间接取词，缺一个键不会报错，
 * 界面上表现为「有的语言显示译文、有的显示 attendance.exTypeAbsent 这串键名」，
 * 而这种缺陷在 typecheck 与 lint 下完全静默（本仓 AlgorithmAdd 就踩过同类坑）。
 * 这里把「码值 → 键 → 五语言译文」整条链锁住。
 */
import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en.json'
import ja from '@/i18n/locales/ja.json'
import ko from '@/i18n/locales/ko.json'
import ru from '@/i18n/locales/ru.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import {
  EXCEPTION_STATUS, EXCEPTION_TYPE, GROUP_TYPE, HOLIDAY_TYPE, MONTHLY_STATUS,
  PUNCH_RESULT, PUNCH_SOURCE, PUNCH_TYPE, SCOPE_TYPE,
} from '@/api/attendance'
import {
  ENABLE_STATUS_TAG_COLOR, EXCEPTION_STATUS_LABEL_KEY, EXCEPTION_STATUS_TAG_COLOR,
  EXCEPTION_TYPE_LABEL_KEY, EXCEPTION_TYPE_TAG_COLOR, GROUP_TYPE_LABEL_KEY,
  HOLIDAY_TYPE_LABEL_KEY, HOLIDAY_TYPE_TAG_COLOR, MONTHLY_STATUS_LABEL_KEY,
  MONTHLY_STATUS_TAG_COLOR, PUNCH_RESULT_LABEL_KEY, PUNCH_RESULT_TAG_COLOR,
  PUNCH_SOURCE_LABEL_KEY, PUNCH_TYPE_LABEL_KEY, SCOPE_TYPE_LABEL_KEY,
  WORKBENCH_ALERT_KEY, keyOf,
} from './meta'

/** 五个语言包：新增语言时这里会因键集不一致而失败，避免只翻一种语言 */
const LOCALES: Array<[string, Record<string, string>]> = [
  ['zh-TW', zhTW.attendance as Record<string, string>],
  ['en', en.attendance as Record<string, string>],
  ['ja', ja.attendance as Record<string, string>],
  ['ko', ko.attendance as Record<string, string>],
  ['ru', ru.attendance as Record<string, string>],
]

/** 取 `attendance.xxx` 的 xxx 部分 */
const leaf = (key: string) => key.replace(/^attendance\./, '')

describe('考勤枚举映射', () => {
  it('每个后端码值都有标签键，缺一个界面就会显示裸数字', () => {
    expect(Object.keys(GROUP_TYPE_LABEL_KEY).map(Number).sort())
      .toEqual([GROUP_TYPE.FIXED, GROUP_TYPE.ROTATION, GROUP_TYPE.FLEX].sort())
    expect(Object.keys(SCOPE_TYPE_LABEL_KEY).map(Number).sort())
      .toEqual([SCOPE_TYPE.DEPT, SCOPE_TYPE.STORE, SCOPE_TYPE.LIST].sort())
    expect(Object.keys(PUNCH_SOURCE_LABEL_KEY).map(Number).sort())
      .toEqual([PUNCH_SOURCE.DINGTALK, PUNCH_SOURCE.IMPORT, PUNCH_SOURCE.REISSUE].sort())
    expect(Object.keys(PUNCH_TYPE_LABEL_KEY).map(Number).sort())
      .toEqual([PUNCH_TYPE.ON, PUNCH_TYPE.OFF].sort())
    expect(Object.keys(PUNCH_RESULT_LABEL_KEY).map(Number).sort())
      .toEqual([PUNCH_RESULT.NORMAL, PUNCH_RESULT.LATE, PUNCH_RESULT.EARLY,
        PUNCH_RESULT.OUTSIDE, PUNCH_RESULT.INVALID].sort())
    expect(Object.keys(EXCEPTION_TYPE_LABEL_KEY).map(Number).sort())
      .toEqual([EXCEPTION_TYPE.LATE, EXCEPTION_TYPE.EARLY, EXCEPTION_TYPE.MISSING_CARD,
        EXCEPTION_TYPE.ABSENT, EXCEPTION_TYPE.UNSCHEDULED].sort())
    expect(Object.keys(EXCEPTION_STATUS_LABEL_KEY).map(Number).sort())
      .toEqual([EXCEPTION_STATUS.PENDING, EXCEPTION_STATUS.HANDLED, EXCEPTION_STATUS.LEAVE,
        EXCEPTION_STATUS.OVERTIME, EXCEPTION_STATUS.CONFIRMED].sort())
    expect(Object.keys(HOLIDAY_TYPE_LABEL_KEY).map(Number).sort())
      .toEqual([HOLIDAY_TYPE.LEGAL, HOLIDAY_TYPE.SWAP_WORKDAY, HOLIDAY_TYPE.COMPANY].sort())
    expect(Object.keys(MONTHLY_STATUS_LABEL_KEY).sort())
      .toEqual([MONTHLY_STATUS.DRAFT, MONTHLY_STATUS.FROZEN, MONTHLY_STATUS.SYNCED].sort())
  })

  it('Tag 颜色表覆盖同一套码值，不会出现有标签却无颜色的半渲染', () => {
    expect(Object.keys(PUNCH_RESULT_TAG_COLOR).sort()).toEqual(Object.keys(PUNCH_RESULT_LABEL_KEY).sort())
    expect(Object.keys(EXCEPTION_TYPE_TAG_COLOR).sort()).toEqual(Object.keys(EXCEPTION_TYPE_LABEL_KEY).sort())
    expect(Object.keys(EXCEPTION_STATUS_TAG_COLOR).sort()).toEqual(Object.keys(EXCEPTION_STATUS_LABEL_KEY).sort())
    expect(Object.keys(HOLIDAY_TYPE_TAG_COLOR).sort()).toEqual(Object.keys(HOLIDAY_TYPE_LABEL_KEY).sort())
    expect(Object.keys(MONTHLY_STATUS_TAG_COLOR).sort()).toEqual(Object.keys(MONTHLY_STATUS_LABEL_KEY).sort())
    // 旷工直接影响薪酬扣减，必须是最重的语义色而不是中性色
    expect(EXCEPTION_TYPE_TAG_COLOR[EXCEPTION_TYPE.ABSENT]).toBe('error')
    expect(ENABLE_STATUS_TAG_COLOR.enabled).toBe('success')
  })

  it('全部标签键与预警键在五个语言包中都有非空译文', () => {
    const keys = [
      ...Object.values(GROUP_TYPE_LABEL_KEY), ...Object.values(SCOPE_TYPE_LABEL_KEY),
      ...Object.values(PUNCH_SOURCE_LABEL_KEY), ...Object.values(PUNCH_TYPE_LABEL_KEY),
      ...Object.values(PUNCH_RESULT_LABEL_KEY), ...Object.values(EXCEPTION_TYPE_LABEL_KEY),
      ...Object.values(EXCEPTION_STATUS_LABEL_KEY), ...Object.values(HOLIDAY_TYPE_LABEL_KEY),
      ...Object.values(MONTHLY_STATUS_LABEL_KEY), ...Object.values(WORKBENCH_ALERT_KEY),
    ]
    // 键名必须带 attendance. 前缀：漏前缀会让 t() 落到根命名空间而静默显示键名
    keys.forEach(key => expect(key.startsWith('attendance.')).toBe(true))
    LOCALES.forEach(([locale, bundle]) => {
      keys.forEach(key => {
        const value = bundle[leaf(key)]
        expect(value, `${locale} 缺少 ${key}`).toBeTruthy()
      })
    })
  })

  it('五个语言包的 attendance 键集完全一致，避免某种语言半翻译', () => {
    const reference = Object.keys(LOCALES[0][1]).sort()
    LOCALES.forEach(([locale, bundle]) => {
      expect(Object.keys(bundle).sort(), `${locale} 的 attendance 键集与 zh-TW 不一致`).toEqual(reference)
    })
  })

  it('预警键覆盖后端会下发的全部预警类型', () => {
    // 后端 AttendanceWorkbenchServiceImpl 只产出这四种；新增预警却没加键会显示裸 key
    expect(Object.keys(WORKBENCH_ALERT_KEY).sort())
      .toEqual(['disabledGroups', 'noSyncToday', 'unfrozen', 'unscheduled'])
  })

  it('keyOf 对未知码值返回 undefined，由调用方显示原始码而不是空白', () => {
    expect(keyOf(GROUP_TYPE_LABEL_KEY, GROUP_TYPE.FIXED)).toBe('attendance.groupTypeFixed')
    expect(keyOf(GROUP_TYPE_LABEL_KEY, 99)).toBeUndefined()
    expect(keyOf(GROUP_TYPE_LABEL_KEY, null)).toBeUndefined()
    expect(keyOf(GROUP_TYPE_LABEL_KEY, undefined)).toBeUndefined()
  })
})
