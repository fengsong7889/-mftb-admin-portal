/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { I18nextProvider } from 'react-i18next'
import i18n from '@/i18n'
import WorklogGantt from './WorklogGantt'
import dayjs from 'dayjs'
import { fmt, mondayOf, type GanttData } from './worklogGanttModel'

/**
 * 统一工作记录视图（甘特台账）的界面契约测试。
 *
 * 钉的是几轮迭代确认下来的形态，不是像素：
 * ①统计卡必须在搜索区下方（§E.8）；②列表态隐藏甘特专属控件；
 * ③「完成」列已改名「狀態」且与筛选词同源；④計劃屬性可单独筛临时插入；
 * ⑤节假日配置入口在功能区（它已升为独立菜单）。
 *
 * 台账已改成服务端唯一真源，所以整层 API 在此换成内存夹具：本文件验的是
 * 「版式与筛选联动」，不是取数协议。放它去打真实 /cpm/worklog/ledger，
 * jsdom 里没有登录态，红了只会是 401 而不是版式变了——那种红没有信息量。
 * 取数与写回的契约由后端 CpmWorklogLedgerTest 与真实环境冒烟负责。
 */
vi.mock('./worklogApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./worklogApi')>()
  // FIXTURE 在调用时才读：mock 工厂会在 import 阶段执行，那时它还在 TDZ 里
  const ledger = (): unknown => ({ data: FIXTURE, rangeStart: null, rangeEnd: null, hasUngrouped: false })
  return {
    ...actual,
    fetchLedger: vi.fn(async () => ledger()),
    createGroup: vi.fn(async () => ({})),
    updateGroup: vi.fn(async () => ({})),
    deleteGroup: vi.fn(async () => undefined),
    restoreGroup: vi.fn(async () => undefined),
    reorderGroups: vi.fn(async () => undefined),
    createTask: vi.fn(async () => ({})),
    updateTask: vi.fn(async () => ({})),
    deleteTask: vi.fn(async () => undefined),
    restoreTask: vi.fn(async () => undefined),
    importLocalLedger: vi.fn(async () => ({ groups: 0, tasks: 0, skippedGroups: 0, skippedTasks: 0, calendarDays: 0 })),
  }
})

/**
 * 夹具按「本周」相对日期生成：本周一为锚点，上周一档故意落在区间外。
 * 写死日期会让用例在换周后必红（默认档就是本周），那不是产品缺陷而是测试自身腐坏。
 */
const MON = dayjs()
const THIS_MONDAY = mondayOf(MON)
const d = (offset: number) => fmt(THIS_MONDAY.add(offset, 'day'))

const FIXTURE: GanttData = {
  groups: [
    {
      id: 'g1', title: '團購瀑布流調整', hue: 0,
      tasks: [
        { id: 't1', title: '瀑布流改動導入研發', start: d(-7), end: d(-7), progress: 100, note: '已完成', history: [{ at: d(-7), progress: 100 }] },
        { id: 't2', title: '篩選項改動導入研發', start: d(-6), end: d(-4), progress: 40, note: '', history: [{ at: d(-6), progress: 0 }, { at: d(-4), progress: 40 }] },
      ],
    },
    {
      id: 'g2', title: '無敵星星廣告', hue: 2,
      tasks: [
        { id: 't3', title: '銷售定價-門店', start: d(0), end: d(2), progress: 90, note: '定價待複核', planType: 'inserted', insertedAt: d(0), history: [{ at: d(0), progress: 0 }, { at: d(1), progress: 90 }] },
        { id: 't5', title: '廣告銷售-商品購買', start: d(1), end: d(3), progress: 30, note: '', history: [{ at: d(1), progress: 0 }, { at: d(2), progress: 30 }] },
        { id: 't4', title: '商家PC端', start: null, end: null, progress: 0, note: '' },
      ],
    },
    // 未分组虚拟容器（服务端 id=0，title 汇成空串）：生产上它就是那条「没有名称的工作項」
    {
      id: '0', title: '', hue: 0, virtual: true,
      tasks: [
        { id: 't9', title: '相似引擎對賬', start: d(0), end: d(1), progress: 0, note: '' },
      ],
    },
  ],
  holidays: [d(-5)],
  makeup: [], compOff: [], leave: [],
}

function mount() {
  return render(<I18nextProvider i18n={i18n}><MemoryRouter><WorklogGantt /></MemoryRouter></I18nextProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('zh-TW')
})

describe('统一工作记录视图', () => {
  it('统计卡排在搜索区之下、操作区之上（§E.8 顺序铁律）', async () => {
    const { container } = mount()
    await screen.findByText('銷售定價-門店')
    const search = container.querySelector('.search-section')!
    const stats = container.querySelector('.wg-stats')!
    const actions = container.querySelector('.action-section')!
    const sheet = container.querySelector('.wg-sheet')!
    const order = [search, stats, actions, sheet].map(node => [...container.querySelectorAll('*')].indexOf(node))
    expect(order[0]).toBeLessThan(order[1])
    expect(order[1]).toBeLessThan(order[2])
    expect(order[2]).toBeLessThan(order[3])
    expect(container.querySelectorAll('.wg-stat')).toHaveLength(6)
  })

  it('表头「完成」列已改名「狀態」，与筛选区用词同源', async () => {
    const { container } = mount()
    await screen.findByText('銷售定價-門店')
    const heads = [...container.querySelectorAll('.wg-lhead__cell')].map(n => n.textContent?.trim())
    expect(heads).toContain('狀態')
    expect(heads).not.toContain('完成')
    // 状态列里渲染的仍是状态标签，不是进度数字
    expect(screen.getAllByText('進行中').length).toBeGreaterThan(0)
  })

  it('默认落在本週档：只显示与本周相交的任务，未排期不进本期', async () => {
    const { container } = mount()
    await screen.findByText('銷售定價-門店')
    const rows = [...container.querySelectorAll('.wg-left .wg-row__ops')]
    // 3 行 = g2 的 t3/t5（本周相交）+ 虚拟分组的 t9；未排期/上周任务不进本期
    expect(container.querySelectorAll('.wg-left .wg-row')).toHaveLength(3)
    expect(rows).toHaveLength(3)
    expect(screen.queryByText('商家PC端')).toBeNull()
    expect(screen.getByText(/第\s*\d+\s*週（/)).toBeTruthy()
  })

  it('切「全部」后未排期任务回来，计划属性可单独筛出临时插入', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText('銷售定價-門店')
    expect(screen.queryByText('團購瀑布流調整')).toBeNull()
    await user.click(screen.getByText('全部'))
    expect(await screen.findByText('商家PC端')).toBeTruthy()
    expect(await screen.findByText('團購瀑布流調整')).toBeTruthy()
    // 6 行 = g1×2 + g2×3 + 虚拟分组×1
    expect(container.querySelectorAll('.wg-left .wg-row')).toHaveLength(6)

    // 标签与控件在同一个 .ant-form-item 下（不是父子关系），用 closest 取行容器
    const planItem = screen.getByText('計劃屬性').closest('.ant-form-item')!
    // 「臨時插入」同时出现在统计卡标签、图例与下拉选项里，只认下拉的那一项
    // antd v5 的 Select 靠 mousedown 在 .ant-select-selector 上弹层（仓内先例同形）；
    // 选项文本用 .ant-select-item-option-content 锁定，避开统计卡与图例上的同名词
    fireEvent.mouseDown(planItem.querySelector('.ant-select-selector')!)
    fireEvent.click(await screen.findByText('臨時插入', { selector: '.ant-select-item-option-content' }))
    await user.click(screen.getByRole('button', { name: /查.*詢/ }))
    expect(await screen.findByText('銷售定價-門店')).toBeTruthy()
    expect(screen.queryByText('商家PC端')).toBeNull()
    expect(container.querySelectorAll('.wg-left .wg-row')).toHaveLength(1)
  })

  it('列表态隐藏甘特专属控件，甘特态才出现', async () => {
    const { container } = mount()
    await screen.findByText('銷售定價-門店')
    // 甘特态（默认）：收合左欄/顯示周末/密度/回到今天都在
    expect(screen.getByRole('button', { name: /收合左欄/ })).toBeTruthy()
    expect(screen.getByText(/顯示周末/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /回到今天/ })).toBeTruthy()

    // 功能区里有两枚开关（甘特开关 + 顯示周末开关），按 DOM 顺序取第一枚；
    // 用 getByRole('switch') 会撞「多个元素」而不是拿到想要的哪一枚
    const ganttSwitch = container.querySelector('.action-section .ant-switch')!
    fireEvent.click(ganttSwitch)
    expect(screen.queryByRole('button', { name: /收合左欄/ })).toBeNull()
    expect(screen.queryByText(/顯示周末/)).toBeNull()
    expect(screen.queryByRole('button', { name: /回到今天/ })).toBeNull()
    // 与甘特无关的动作在两种形态下都保留；节假日配置已升为独立菜单，不再占功能区
    expect(screen.getByRole('button', { name: /新增工作項/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /節假日配置/ })).toBeNull()
  })

  it('工作日口径说明收在左下角芯片，点开才给全文', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByText('銷售定價-門店')
    expect(screen.queryByText(/耗時 = 區間工作日/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /工作日口徑/ }))
    expect(await screen.findByText(/耗時 = 區間工作日/)).toBeTruthy()
  })

  it('未分组虚拟容器：渲染「未分組記錄」，不给改名/删除入口，子任务照常可加', async () => {
    const user = userEvent.setup()
    const { container } = mount()
    await screen.findByText('銷售定價-門店')

    // 空白名称 → 按语言给词，不再是一条没有名称的记录
    const ungroupedTitle = await screen.findByText('未分組記錄')
    const virtualReq = ungroupedTitle.closest('.wg-group')!
    // 只读容器：点标题不进编辑态，也不会把 PUT /groups/0 打出去
    await user.click(ungroupedTitle)
    expect(container.querySelectorAll('input.wg-inline, .wg-req input')).toHaveLength(0)
    // 删除入口直接不给：本周档只剩真实分组 g2 的一颗删除钮（g1 本期无相交任务被滤掉）
    expect(virtualReq.querySelectorAll('.wg-req__ops .anticon-delete')).toHaveLength(0)
    expect(container.querySelectorAll('.wg-req__ops .anticon-delete')).toHaveLength(1)
    // 添加子任務仍可用：服务端 resolveGroupId 把 0 当未分组，本来就能落
    const ledgerApi = await import('./worklogApi')
    await user.click(virtualReq.querySelector('.wg-req__ops .anticon-plus')!.closest('button')!)
    await waitFor(() => expect((ledgerApi.createTask as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0].groupId).toBe(0))
  })
})
