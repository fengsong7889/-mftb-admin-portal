/**
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」的组成部分。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
import { useEffect, useId, useState } from 'react'
import { Button, ConfigProvider, InputNumber, Modal, Select, Switch, Tag } from 'antd'
import { CalculatorOutlined, ReloadOutlined } from '@ant-design/icons'
import { PhoneShell, PreviewCardView } from '../../waterfallConfig/WaterfallPreview'
import type { PreviewCard } from '../../waterfallConfig/previewLayout'
import { INSERT_STYLE_OPTIONS, type InsertStyle, type PrototypeValues } from './prototype'

type Scenario = 'normal' | 'partial' | 'empty'

/** 插入樣式专用试算：只保留动效／时长／高亮／匹配情境等呈现层操作，不携带召回/排序/计费内容。
 *  插入数量跟随表单配置的推薦數量（1→插 1 卡、2→插 2 卡），并保留「没有匹配」与「只有一家合格」情境；
 *  手机壳与卡片复用瀑布流策略新增界面（PhoneShell／PreviewCardView 单一真源）。
 *  弹层内调整即时重播动画、仅供预览，不回写表单；持久化仍走表单「④ 插入樣式」配置项。 */
export default function InsertStyleTrial({ values }: { values: PrototypeValues }) {
  const [open, setOpen] = useState(false)
  return <>
    <Button type="link" size="small" aria-label="插入樣式試算" icon={<CalculatorOutlined aria-hidden />} onClick={() => setOpen(true)}>試算</Button>
    <Modal open={open} title="插入樣式試算" onCancel={() => setOpen(false)} footer={null} width={820} destroyOnClose
      styles={{ body: { maxHeight: 'calc(100vh - 180px)', overflow: 'auto' } }}>
      <ConfigProvider componentDisabled={false}>
        {open && <TrialSession values={values} />}
      </ConfigProvider>
    </Modal>
  </>
}

/** 匿名示例商家（仅呈现层演示，不声称来自算法计算）。 */
const REC_CARDS: PreviewCard[] = [
  { position: 1, kind: 'category', itemName: '相似商家 A・手打漢堡', image: '🍔', rating: 4.8, monthlySales: 600, price: 32 },
  { position: 2, kind: 'category', itemName: '相似商家 B・脆皮炸雞', image: '🍗', rating: 4.7, monthlySales: 450, price: 28 },
]
const BASE_CARD = (position: number): PreviewCard => ({ position, kind: 'category', itemName: '原列表商家', image: '🏪', rating: 4.6, monthlySales: 300 })

function TrialSession({ values }: { values: PrototypeValues }) {
  const id = useId()
  const [style, setStyle] = useState<InsertStyle>(values.insertStyle)
  const [ms, setMs] = useState(values.insertAnimMs)
  const [highlight, setHighlight] = useState(values.insertHighlight)
  const [scenario, setScenario] = useState<Scenario>('normal')
  const [playKey, setPlayKey] = useState(1)
  const count = values.count
  // 正常＝按配置数量插满；partial＝只有一家合格（min(count,1)）；empty＝没有匹配插 0。
  const inserted = scenario === 'empty' ? 0 : scenario === 'partial' ? Math.min(count, 1) : count
  // 任一呈现参数或情境变化立即重播插入动画，所见即所得。
  useEffect(() => { setPlayKey(k => k + 1) }, [style, ms, highlight, scenario, count])

  const scenarioHint = scenario === 'empty'
    ? '本輪沒有匹配到相似商家：保留原列表，不產生插入動畫，也不放寬門檻湊數。'
    : scenario === 'partial'
      ? (count === 2 ? '配置 2 家但只有 1 家合格：插入 1 家，剩餘名額交回原瀑布流，不湊數。' : '推薦數量為 1 時，「只有一家合格」與正常匹配等價（插 1 家）。')
      : `按配置推薦數量插入 ${count} 家相似商家，逐卡播放所選動效。`

  return <div className="insert-trial">
    <div className="insert-trial__controls">
      <div className="insert-trial__grid">
        <div className="insert-trial__field">
          <label htmlFor={`${id}-style`}>插入效果</label>
          <Select<InsertStyle> id={`${id}-style`} value={style} onChange={setStyle} options={INSERT_STYLE_OPTIONS} />
        </div>
        <div className="insert-trial__field">
          <label htmlFor={`${id}-ms`}>動效時長</label>
          <InputNumber id={`${id}-ms`} min={120} max={1200} step={60} precision={0} value={ms}
            onChange={v => { if (v != null) setMs(v) }} suffix={<span className="traffic-config__unit">ms</span>} />
        </div>
        <div className="insert-trial__field">
          <label htmlFor={`${id}-highlight`}>插入高亮</label>
          <div><Switch id={`${id}-highlight`} checked={highlight} onChange={setHighlight} /></div>
        </div>
        <div className="insert-trial__field">
          <label htmlFor={`${id}-scenario`}>匹配情境</label>
          <Select<Scenario> id={`${id}-scenario`} value={scenario} onChange={setScenario} options={[
            { value: 'normal', label: '正常匹配' }, { value: 'partial', label: '只有一家合格' }, { value: 'empty', label: '沒有匹配商家' },
          ]} />
        </div>
      </div>
      <div className="insert-trial__status" role="status">
        <Tag color={inserted ? 'blue' : 'default'}>本次插入 {inserted} 家</Tag>
        <span>配置推荐数量 {count} · 匿名示例，不產生真實曝光或扣量</span>
      </div>
      <p className="insert-trial__hint">{scenarioHint}</p>
      <div className="insert-trial__actions">
        <Button icon={<ReloadOutlined />} onClick={() => setPlayKey(k => k + 1)}>重播插入動畫</Button>
      </div>
      <p className="insert-trial__hint">此處調整僅影響預覽、不回寫表單；如需持久化請使用表單「④ 插入樣式」配置項。動效與高亮不改變召回、準入、排序、頻控與計費。</p>
    </div>
    <PhoneShell title="商家瀑布流" hint="匿名示例 · 僅預覽插入動效，不產生真實曝光" height={620} contentClassName="insert-trial-feed">
      <PreviewCardView card={BASE_CARD(999)} contentType="store" />
      <PreviewCardView card={{ position: 1000, kind: 'category', itemName: '被點擊的漢堡店', image: '🍔', rating: 4.9, monthlySales: 800 }}
        contentType="store" anchor badge="被點擊商家" />
      {REC_CARDS.slice(0, inserted).map((card, i) => (
        <div key={`${playKey}-${card.position}`}
          className={`insert-trial__rec-wrap similar-insert--${style}${highlight ? ' similar-insert--highlight' : ''}`}
          style={{ animationDuration: `${ms}ms`, animationDelay: `${i * 90}ms` }}>
          <PreviewCardView card={card} contentType="store" badge="相似推薦" badgeColor="blue" />
        </div>
      ))}
      {scenario === 'empty' && <PreviewCardView card={{ position: 0, kind: 'empty' }} contentType="store" emptyText="沒有匹配到相似商家 · 保留原列表" />}
      {scenario !== 'empty' && inserted < count && <PreviewCardView card={{ position: 0, kind: 'empty' }} contentType="store" emptyText={`只有 ${inserted} 家合格 · 剩餘名額交回原瀑布流`} />}
      <PreviewCardView card={BASE_CARD(1001)} contentType="store" />
      <PreviewCardView card={BASE_CARD(1002)} contentType="store" />
    </PhoneShell>
  </div>
}