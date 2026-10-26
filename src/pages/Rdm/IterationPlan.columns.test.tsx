/**
 * 迭代排期列表列改造回归（2026-10 第二阶段）
 *
 * 钉两件事：
 * 1. 列标题全部走 t('rdm.iteration.col*')，且 zh-TW 与 en 双语键齐备
 *    （门禁脚本只扫字面量 t()，抽屉里那份由 COLUMN_META 派生，容易漏对齐）；
 * 2. 原「起止」列拆成開始/結束/週期三列、归属改造新增「所屬項目」列后，老用户 localStorage
 *    里残留的旧存档不能把新列甩乱 —— 靠 storageKey 升到 -v3 强制按默认顺序重排，
 *    同时用户对新版列的自定义顺序仍须被尊重（不能顺手把功能改没）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import { fetchIterations } from '@/api/rdm'
import IterationPlan, { COLUMN_META } from './IterationPlan'

vi.mock('@/api/rdm', () => ({
  fetchIterations: vi.fn(),
  updateIterationStatus: vi.fn(),
}))
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => true }),
}))
// t 直接回显 key：列顺序断言与语言无关，双语齐备由下面的语言包用例单独钉
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

/** 一条起止完整的迭代，够把 12 列全部渲染出来 */
const row = {
  id: 1,
  code: 'SP202610001',
  name: '11月第一版迭代',
  iterationType: 'SPRINT',
  startDate: '2026-11-02',
  endDate: '2026-11-13',
  capacityHours: 100,
  ownerName: '測試入职员',
  status: 'active',
  remark: '完成推广金上线',
  reqCount: 1,
  taskCount: 3,
  taskHours: 18,
}

/** 按 DOM 顺序取表头文本（t 被 mock 成回显 key，所以这里拿到的是 i18n 键） */
function headerKeys(): string[] {
  return screen.getAllByRole('columnheader').map(th => th.textContent ?? '')
}

/** 沿点号路径查语言包，命中叶子且非对象才算解析成功（与门禁脚本同口径） */
function resolves(locale: unknown, dotted: string): boolean {
  let node: unknown = locale
  for (const part of dotted.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string'
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchIterations).mockResolvedValue([row])
})

describe('迭代排期列标题 i18n', () => {
  it('COLUMN_META 的每个标题键在 zh-TW 与 en 都能解析', () => {
    for (const meta of COLUMN_META) {
      expect(resolves(zhTW, meta.titleKey), `zh-TW 缺 ${meta.titleKey}`).toBe(true)
      expect(resolves(en, meta.titleKey), `en 缺 ${meta.titleKey}`).toBe(true)
    }
  })

  it('週期列的天数文案键双语齐备且用双花括号插值', () => {
    const tw = (zhTW as { rdm: { iteration: Record<string, string> } }).rdm.iteration.durationDays
    const enText = (en as { rdm: { iteration: Record<string, string> } }).rdm.iteration.durationDays
    expect(tw).toContain('{{days}}')
    expect(enText).toContain('{{days}}')
  })
})

describe('迭代排期列顺序', () => {
  it('老用户残留的 range 存档（旧 key）不再生效，新列按默认顺序排在類型之後', async () => {
    // 旧存档：仍带着已删除的 range，且用户当时把說明拖到了狀態前面
    localStorage.setItem('table-config-rdm-iteration-plan', JSON.stringify([
      { key: 'name', visible: true, locked: 'head' },
      { key: 'remark', visible: true, locked: null },
      { key: 'range', visible: true, locked: null },
      { key: 'status', visible: true, locked: null },
      { key: 'iterationType', visible: true, locked: null },
      { key: 'ownerName', visible: true, locked: null },
      { key: 'reqCount', visible: true, locked: null },
      { key: 'taskCount', visible: true, locked: null },
      { key: 'capacity', visible: true, locked: null },
      { key: 'action', visible: true, locked: 'tail' },
    ]))

    render(<MemoryRouter><IterationPlan /></MemoryRouter>)
    await screen.findByText(row.name)

    // 旧 key 整体作废：既没有 range 残留，也没有把說明提到前面，而是回到代码里的默认顺序
    expect(headerKeys()).toEqual(COLUMN_META.map(m => m.titleKey))
    expect(screen.queryByText('range')).not.toBeInTheDocument()
  })

  it('新 key 下用户自定义的列顺序与隐藏设置仍然生效', async () => {
    // 抽屉里拖拽后的典型存档：head 锁定列仍在首位，週期被拖到類型之前，任務數被勾掉
    const savedOrder = [
      'name', 'duration', 'iterationType', 'projectName', 'startDate', 'endDate', 'status',
      'ownerName', 'reqCount', 'taskCount', 'capacity', 'remark', 'action',
    ]
    localStorage.setItem('table-config-rdm-iteration-plan-v3', JSON.stringify(
      savedOrder.map(key => ({
        key,
        visible: key !== 'taskCount',
        locked: key === 'name' ? 'head' : key === 'action' ? 'tail' : null,
      })),
    ))

    render(<MemoryRouter><IterationPlan /></MemoryRouter>)
    await screen.findByText(row.name)

    const keys = headerKeys()
    expect(keys[0]).toBe('rdm.iteration.colName')
    expect(keys[1]).toBe('rdm.iteration.colDuration')
    // 被隐藏的任務數不再渲染
    expect(keys).not.toContain('rdm.iteration.colTaskCount')
  })
})
