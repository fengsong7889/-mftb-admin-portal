/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分，属专有代码。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { afterEach, beforeEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider, Modal } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import TagDecaySettings from './index'
import { TAG_DECAY_FIELDS } from './store'

const auth = vi.hoisted(() => ({ user: { username: 'tag-decay-test' }, hasPermission: vi.fn(() => true), hasMenuPermission: vi.fn(() => true) }))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }))
// store.ts 的校验消息走 i18n 实例（测试环境默认 lng=en），按繁中真源口径固定回落 defaultValue。
vi.mock('@/i18n', () => ({ default: { t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key } }))
vi.mock('@/components/HelpPopover', () => ({ default: () => <span>说明</span> }))
// t 返回 defaultValue（繁中原文）；Trans 替身解析 defaults 里的 <c>…</c> 并按 components 映射，
// 保证句中高亮仍是独立文本节点（加分规则断言依赖它），与真实 react-i18next 行为一致。
vi.mock('react-i18next', async () => {
  const React = await import('react')
  const t = (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key
  const Trans = ({ i18nKey, defaults, components }: { i18nKey?: string; defaults?: string; components?: Record<string, React.ReactElement> }) => {
    const text = defaults ?? ''
    const nodes: React.ReactNode[] = []
    const pattern = /<(\w+)>([\s\S]*?)<\/\1>/g
    let cursor = 0
    let matched: RegExpExecArray | null
    let index = 0
    while ((matched = pattern.exec(text)) !== null) {
      if (matched.index > cursor) nodes.push(text.slice(cursor, matched.index))
      const slot = components?.[matched[1]]
      nodes.push(slot ? React.cloneElement(slot, { key: `c${index++}` }, matched[2]) : matched[2])
      cursor = matched.index + matched[0].length
    }
    if (cursor < text.length) nodes.push(text.slice(cursor))
    return React.createElement(React.Fragment, { key: i18nKey }, ...nodes)
  }
  return { useTranslation: () => ({ t }), Trans, initReactI18next: { type: '3rdParty', init: () => {} } }
})

beforeAll(() => configure({ asyncUtilTimeout: 5000 }))
// 默认恢复编辑权限，避免某个用例改写共享 mock 后污染后续用例。
beforeEach(() => auth.hasPermission.mockReturnValue(true))
afterEach(() => Modal.destroyAll())
afterAll(() => configure({ asyncUtilTimeout: 1000 }))

function mount() {
  return render(<ConfigProvider theme={{ token: { motion: false } }}>
    <MemoryRouter initialEntries={['/promotion-algorithm?settings=tag-decay']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TagDecaySettings />
    </MemoryRouter>
  </ConfigProvider>)
}

describe('全局标签衰变页 UI', () => {
  it('加分规则双栏展示商家/用户口径并凸显关键数字', () => {
    mount()
    expect(screen.getByRole('heading', { name: '標籤加分規則' })).toBeInTheDocument()
    expect(screen.getByText('商家側・供給熱度')).toBeInTheDocument()
    expect(screen.getByText('用戶側・偏好強度')).toBeInTheDocument()
    expect(screen.getByText('供給畫像')).toBeInTheDocument()
    expect(screen.getByText('偏好畫像')).toBeInTheDocument()
    // +1／僅已完成／線性 等关键口径以品牌色数字徽标凸显，商家与用户各一组
    expect(screen.getAllByText('+1').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('僅已完成').length).toBeGreaterThanOrEqual(2)
    // 锁定非对称计分：商家走量、用户同类去重·异类累计（薯条＋薯片＋土豆丝→土豆+3）
    expect(screen.getAllByText('走量').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('同類去重')).toBeInTheDocument()
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText('每件完成商品')).toBeInTheDocument()
    expect(screen.getByText('每種商品')).toBeInTheDocument()
    expect(screen.getByText(/原始累計與衰減後有效分分離儲存/)).toBeInTheDocument()
  })

  it('衰变参数三列对齐栅格，闲置项留空不启用', () => {
    const { container } = mount()
    const grids = container.querySelectorAll('.tag-decay-fields')
    expect(grids.length).toBe(3) // 商家 / 用户 两组衰变参数 + 饱和上限（B）一组
    expect(screen.getByRole('spinbutton', { name: '商家衰變週期' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '商家無新增清理' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '用戶衰變週期' })).toBeInTheDocument()
    // B 饱和上限作为可配置项显式展示
    expect(screen.getByRole('spinbutton', { name: '商家有效分上限' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '用戶有效分上限' })).toBeInTheDocument()
    expect(screen.getByText('飽和壓縮上限')).toBeInTheDocument()
    expect(screen.getAllByPlaceholderText('留空不啟用').length).toBe(2)
  })

  it('试算弹窗为宽敞模块化弹层，快捷案例与重置即时重算', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: '衰减试算' }))
    expect(await screen.findByText('标签有效分衰减试算')).toBeInTheDocument()
    // 三个模块分区（对齐自然流量计分面板），而非单行拥挤输入
    expect(screen.getByRole('heading', { name: '試算輸入' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '衰減推演' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '口徑說明' })).toBeInTheDocument()
    // 统一宽输入的可访问名
    expect(screen.getByRole('spinbutton', { name: '初始分' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '經過天數 t' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '距最後有效訂單新增' })).toBeInTheDocument()
    // 快捷案例：闲置清理边界 → 清零口径
    fireEvent.click(screen.getByRole('button', { name: '閒置清理邊界' }))
    await waitFor(() => expect(screen.getByText(/闲置达到 30 天，清零后/)).toBeInTheDocument())
    // 重置 → 回到周期衰减口径
    fireEvent.click(screen.getByRole('button', { name: '重置試算' }))
    await waitFor(() => expect(screen.getByText(/周期衰减后有效分/)).toBeInTheDocument())
  })

  it('默认只读，持编辑权限者点「编辑」后方可调整', () => {
    mount()
    const decayField = screen.getByRole('spinbutton', { name: '商家衰變週期' })
    expect(decayField).toBeDisabled()
    expect(screen.queryByRole('button', { name: /保\s*存/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /編輯/ }))
    expect(screen.getByRole('spinbutton', { name: '商家衰變週期' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: /保\s*存/ })).toBeInTheDocument()
  })

  it('无编辑权限时不显示编辑入口，字段保持只读', () => {
    auth.hasPermission.mockReturnValue(false)
    mount()
    expect(screen.queryByRole('button', { name: /編輯/ })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '商家衰變週期' })).toBeDisabled()
  })

  it('保存前先弹二次确认', async () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /編輯/ }))
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }))
    expect((await screen.findAllByText('確認更新全局標籤衰變規則？')).length).toBeGreaterThan(0)
    // 点取消关闭确认，不触发保存（命令式 Modal.confirm 由 afterEach destroyAll 兵底清理）
    fireEvent.click(screen.getByRole('button', { name: /返回編輯/ }))
  })

  it('衰变菜单用到的每个 i18n key 都已同时收录进 zh-TW 与 en', () => {
    const readRecommend = (lang: string) => JSON.parse(fs.readFileSync(path.resolve(process.cwd(), `frontend/packages/i18n/src/i18n/locales/${lang}.json`), 'utf8')).recommend as Record<string, unknown>
    const leaf = (node: unknown, dotted: string) => dotted.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | undefined)?.[k], node)
    const source = ['index.tsx', 'store.ts'].map(f => fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Recommend/TagDecaySettings', f), 'utf8')).join('\n')
    // check:i18n 的引用解析只认 t('…') 字面量；Trans 的 i18nKey 与模板拼接的动态 key 靠本用例守住。
    const used = new Set<string>()
    for (const m of source.matchAll(/'recommend\.tagDecay\.([a-zA-Z0-9_.]+)'/g)) used.add(m[1])
    for (const m of source.matchAll(/i18nKey="recommend\.tagDecay\.([a-zA-Z0-9_.]+)"/g)) used.add(m[1])
    expect(used.size).toBeGreaterThan(60)
    for (const lang of ['zh-TW', 'en'] as const) {
      const ns = readRecommend(lang).tagDecay as Record<string, unknown>
      for (const key of used) expect(leaf(ns, key), `${lang} 缺 recommend.tagDecay.${key}`).toBeTruthy()
      // 字段 label 由 decayFieldKey 模板拼接，显式枚举逐个校验；单位复用全站既有键，不另造译法
      for (const name of Object.keys(TAG_DECAY_FIELDS)) expect(leaf(ns, `field.${name}`), `${lang} 缺 recommend.tagDecay.field.${name}`).toBeTruthy()
      expect(leaf(readRecommend(lang), 'scoreUnit'), `${lang} 缺 recommend.scoreUnit`).toBeTruthy()
      expect(leaf(readRecommend(lang), 'dayUnit'), `${lang} 缺 recommend.dayUnit`).toBeTruthy()
    }
    // 加分规则富文本必须保留 <c> 插槽，否则句中高亮会随翻译丢失
    expect(leaf(readRecommend('zh-TW').tagDecay, 'rules.m2Body')).toContain('<c>')
    expect(leaf(readRecommend('en').tagDecay, 'rules.u2Body')).toContain('<c>')
  })
})