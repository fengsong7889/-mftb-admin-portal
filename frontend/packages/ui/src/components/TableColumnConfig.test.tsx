/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TableColumnConfig, { applyColumnConfig, mergeColumnConfigs, type ColumnConfig } from './TableColumnConfig'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

/** 默认布局：排名默认靠左锁定、操作默认靠右锁定 —— 是默认值，不是硬限制。
 * 每个用例给一份新对象：组件不得原地修改调用方传入的 columns，但测试也不能用共享夹具掩盖这类副作用 */
const makeColumns = (): ColumnConfig[] => [
  { key: 'rank', title: '排名', visible: true, locked: 'head' },
  { key: 'store', title: '門店', visible: true, locked: null },
  { key: 'action', title: '操作', visible: true, locked: 'tail' },
]

/** jsdom 不提供真实 dataTransfer，手工构造：组件只写入 effectAllowed/dropEffect */
const dragEvents = { dataTransfer: { setData: vi.fn(), effectAllowed: '', dropEffect: '' } }

/** 打开抽屉并返回 onChange 探针（未传 storageKey，避免测试间互相污染 localStorage） */
function openDrawer(columns = makeColumns()) {
  const onChange = vi.fn()
  render(<TableColumnConfig columns={columns} onChange={onChange} />)
  fireEvent.click(screen.getByRole('button'))
  return { onChange, columns }
}

const fieldRows = () => Array.from(document.querySelectorAll<HTMLElement>('.tcc-field-item'))
const unlockedZone = () => document.querySelector<HTMLElement>('.tcc-zone-main')!

describe('TableColumnConfig 三区外观与跨区自由排序', () => {
  it('三区外观保留，锁定字段带解除按钮', () => {
    openDrawer()
    expect(screen.getByText('columnConfig.headZone')).toBeInTheDocument()
    expect(screen.getByText('columnConfig.unlockedZone')).toBeInTheDocument()
    expect(screen.getByText('columnConfig.tailZone')).toBeInTheDocument()
    // 排名/操作落在锁定卡样式里，門店在自由区；每行都有 × 解除入口
    expect(document.querySelectorAll('.tcc-field-locked')).toHaveLength(2)
    expect(document.querySelectorAll('.tcc-unlock-btn')).toHaveLength(2)
    expect(fieldRows()).toHaveLength(3)
  })

  it('锁定字段拖到非锁定区字段行上即解除锁定，且只处理一次 drop', () => {
    const { onChange, columns } = openDrawer()
    const [rankRow, storeRow] = fieldRows()
    fireEvent.dragStart(rankRow, dragEvents)
    fireEvent.dragOver(storeRow, dragEvents)
    fireEvent.drop(storeRow, dragEvents)
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ColumnConfig[]
    expect(next.find(c => c.key === 'rank')?.locked).toBeNull()
    // 副作用回归：不得原地污染页面传入的默认配置（否则 useMemo 默认值会跟着被改坏）
    expect(columns[0].locked).toBe('head')
    // 头部区已空，显示占位提示而不是死区
    expect(screen.getAllByText('columnConfig.zoneEmpty').length).toBeGreaterThan(0)
  })

  it('非锁定区空白处也是落点：拖到容器即追加到自由区末尾', () => {
    const { onChange } = openDrawer()
    const [rankRow] = fieldRows()
    fireEvent.dragStart(rankRow, dragEvents)
    fireEvent.dragOver(unlockedZone(), dragEvents)
    fireEvent.drop(unlockedZone(), dragEvents)
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ColumnConfig[]
    // 自由区当前只有門店，拖到空白处即排到門店之后（仍在锁定尾部列之前）
    expect(next.map(c => c.key)).toEqual(['store', 'rank', 'action'])
    expect(next.find(c => c.key === 'rank')?.locked).toBeNull()
  })

  it('× 解除锁定后字段进入自由区，顺序不变', () => {
    const { onChange } = openDrawer()
    fireEvent.click(document.querySelector<HTMLElement>('.tcc-unlock-btn')!)
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ColumnConfig[]
    expect(next.map(c => c.key)).toEqual(['rank', 'store', 'action'])
    expect(next[0].locked).toBeNull()
  })

  it('全選只作用于自由区（锁定列保持自身显隐，属既有交互）', () => {
    const { onChange } = openDrawer()
    fireEvent.click(screen.getByRole('checkbox', { name: 'columnConfig.selectAll' }))
    const next = onChange.mock.calls[0][0] as ColumnConfig[]
    expect(next.find(c => c.key === 'store')?.visible).toBe(false)
    expect(next.find(c => c.key === 'rank')?.visible).toBe(true)
  })

  it('父组件重渲染（columns 引用变化）不会把已解除锁定的列弹回锁定区', () => {
    const onChange = vi.fn()
    const view = render(<TableColumnConfig columns={makeColumns()} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(document.querySelector<HTMLElement>('.tcc-unlock-btn')!)
    // 页面几乎都把 defaultConfig 写成内联数组：重渲染时引用必变，旧实现会因此重跑合并把排名弹回头部区
    view.rerender(<TableColumnConfig columns={makeColumns()} onChange={onChange} />)
    const next = onChange.mock.calls.at(-1)![0] as ColumnConfig[]
    expect(next.find(c => c.key === 'rank')?.locked).toBeNull()
    // 排名确实留在非锁定区（自由区 2 行：排名 + 門店）
    expect(document.querySelectorAll('.tcc-zone-main .tcc-field-item')).toHaveLength(2)
  })
})

describe('mergeColumnConfigs 尊重显式解除的锁定', () => {
  it('存量配置里 locked:null 是用户主动解除，不得被默认值弹回头部/尾部区', () => {
    const merged = mergeColumnConfigs([{ key: 'rank', title: '排名', visible: true, locked: null }], makeColumns())
    expect(merged[0].locked).toBeNull()
  })

  it('存量配置从未声明过的列才用默认锁定兜底', () => {
    const merged = mergeColumnConfigs([{ key: 'store', title: '門店', visible: true, locked: null }], makeColumns())
    expect(merged.find(c => c.key === 'rank')?.locked).toBe('head')
    expect(merged.find(c => c.key === 'action')?.locked).toBe('tail')
  })
})

describe('applyColumnConfig 固定端派生', () => {
  it('顺序跟随用户配置，locked 派生 fixed，解除锁定后不再带 fixed', () => {
    const tableColumns = [
      { key: 'rank', title: '排名' },
      { key: 'store', title: '門店' },
      { key: 'action', title: '操作', fixed: 'right' as const },
    ]
    const applied = applyColumnConfig(tableColumns, [
      { key: 'store', title: '門店', visible: true, locked: null },
      { key: 'rank', title: '排名', visible: true, locked: 'head' },
      { key: 'action', title: '操作', visible: true, locked: null },
    ])
    expect(applied.map(c => c.key)).toEqual(['store', 'rank', 'action'])
    expect(applied[1].fixed).toBe('left')
    expect(applied[0].fixed).toBeUndefined()
    expect(applied[2].fixed).toBeUndefined()
  })
})
