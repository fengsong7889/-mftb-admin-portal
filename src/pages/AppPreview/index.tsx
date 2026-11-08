/**
 * 移动 APP 原型 · 顶层入口（/app-preview）
 *
 * 在后台里以「手机外壳」承载三个 APP 原型：
 * - 商家端（真实下单闭环）
 * - 閃蜂用户端（?app=consumer）
 * - MFOOD 用户端（?app=mfood）
 *
 * 缺省展示两个用户端 APP 并排；加 app 参数可单独查看某一个。
 */
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import PhoneFrame from './PhoneFrame'
import MerchantApp from './MerchantApp'
import ConsumerApp from './ConsumerApp'
import MfoodApp from './MfoodApp'
import { HighlightProvider, useHighlightProvider } from './SpecHighlight'
import { SPEC_PANELS, loadSpecs, saveSpecs, type SpecEntry, type SpecPanelKey } from './groupBuySpec'
import './appPreview.css'

export default function AppPreview() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const appParam = params.get('app')
  const fromTab = params.get('from') || 'app'

  // 单 APP 模式（商家端或指定用户端）
  if (appParam === 'merchant') {
    return (
      <div className="ap-stage">
        <button type="button" className="ap-exit" onClick={() => navigate(`/portal?tab=${fromTab}`)}>‹ 返回企業門戶</button>
        <PhoneFrame><MerchantApp /></PhoneFrame>
      </div>
    )
  }
  if (appParam === 'consumer') {
    return (
      <div className="ap-stage">
        <button type="button" className="ap-exit" onClick={() => navigate(`/portal?tab=${fromTab}`)}>‹ 返回企業門戶</button>
        <PhoneFrame><ConsumerApp /></PhoneFrame>
      </div>
    )
  }
  if (appParam === 'mfood') {
    return (
      <div className="ap-stage">
        <button type="button" className="ap-exit" onClick={() => navigate(`/portal?tab=${fromTab}`)}>‹ 返回企業門戶</button>
        <PhoneFrame><MfoodApp /></PhoneFrame>
      </div>
    )
  }

  // 缺省：两个用户端 APP 并排展示 + 右侧字段说明表格
  return (
    <div className="ap-stage ap-stage--dual">
      <button type="button" className="ap-exit" onClick={() => navigate(`/portal?tab=${fromTab}`)}>‹ 返回企業門戶</button>
      <DualView />
    </div>
  )
}

/** 双机并排 + 可切换规范表格（抽成子组件以使用 hooks） */
function DualView() {
  /** 当前说明面板：按菜单分类分组（首页 / 特惠团购页；Tab 手动切换 + 壳内分类/页签点击自动联动） */
  const [panelKey, setPanelKey] = useState<SpecPanelKey>('groupBuy')
  const activePanel = SPEC_PANELS.find((p) => p.key === panelKey) ?? SPEC_PANELS[0]
  /** 高亮作用域：面板锚点（「推荐」与首页团购共用 groupBuy 卡片锚点） */
  const highlight = useHighlightProvider(activePanel.anchor ?? activePanel.key)
  /** Tab 手动切换的同步序号：自增时命令两个壳把分类切到面板对应瀑布流 */
  const [syncSeq, setSyncSeq] = useState(0)
  const [specsByPanel, setSpecsByPanel] = useState<Record<SpecPanelKey, SpecEntry[]>>(() => ({
    groupBuy: loadSpecs('groupBuy'),
    delivery: loadSpecs('delivery'),
    preferred: loadSpecs('preferred'),
    groupPage: loadSpecs('groupPage'),
  }))
  const [editId, setEditId] = useState<number | null>(null)
  /** 外卖瀑布流展示模式：列表（一行一店）/ 卡片（一行两店）；说明面板切换器下发，两台手机同步 */
  const [deliveryMode, setDeliveryMode] = useState<'list' | 'card'>('list')

  const specs = specsByPanel[panelKey]

  /** 面板 → 手机壳同步命令：首页两类回首页切分类；特惠团购页两类进团购页切页签 */
  const SYNC_BY_PANEL: Record<SpecPanelKey, string> = {
    groupBuy: 'group',
    delivery: 'delivery',
    groupPage: 'page-group',
    preferred: 'preferred',
  }

  function handleEdit(id: number, field: keyof SpecEntry, value: string) {
    const next = specs.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    setSpecsByPanel((prev) => ({ ...prev, [panelKey]: next }))
    saveSpecs(panelKey, next)
  }

  /** 壳内分类/页签切换联动：外卖 → 外卖面板，優選商家 → 優選商家面板，团购页推荐 → 推荐面板，其余 → 首页团购面板（只切面板，不回流命令） */
  function handleCategoryChange(cat: string) {
    if (cat === 'delivery') setPanelKey('delivery')
    else if (cat === 'preferred') setPanelKey('preferred')
    else if (cat === 'page-group') setPanelKey('groupPage')
    else setPanelKey('groupBuy')
  }

  /** 面板 Tab 手动切换：同时下发命令同步两个壳的分类（看哪份说明，APP 就在哪个瀑布流） */
  function selectPanel(key: SpecPanelKey) {
    setPanelKey(key)
    setSyncSeq((seq) => seq + 1)
  }

  return (
    <HighlightProvider value={highlight}>
      <div className="ap-dual-wrap">
        <div className="ap-dual-item">
          <span className="ap-dual-label ap-dual-label--mfood">mFood</span>
          <PhoneFrame>
            <MfoodApp
              onCategoryChange={handleCategoryChange}
              syncCategory={SYNC_BY_PANEL[panelKey]}
              syncSeq={syncSeq}
              deliveryMode={deliveryMode}
            />
          </PhoneFrame>
        </div>
        <div className="ap-dual-item">
          <span className="ap-dual-label ap-dual-label--bee">閃蜂</span>
          <PhoneFrame>
            <ConsumerApp
              onCategoryChange={handleCategoryChange}
              syncCategory={SYNC_BY_PANEL[panelKey]}
              syncSeq={syncSeq}
              deliveryMode={deliveryMode}
            />
          </PhoneFrame>
        </div>
        <div className="ap-spec-panel">
          {/* 横排三层：①菜单分类行 → ②该分类下瀑布流面板行 → ③条件行（如外卖卡片模式切换） */}
          <div className="ap-spec-tabs">
            <div className="ap-spec-group-row">
              {Array.from(new Set(SPEC_PANELS.map((p) => p.group))).map((group) => (
                <button
                  key={group}
                  type="button"
                  className={`ap-spec-tab ap-spec-tab--group${activePanel.group === group ? ' is-on' : ''}`}
                  onClick={() => {
                    const first = SPEC_PANELS.find((p) => p.group === group)
                    if (first) selectPanel(first.key)
                  }}
                >
                  {group}
                </button>
              ))}
            </div>
            <div className="ap-spec-group-tabs">
              {SPEC_PANELS.filter((p) => p.group === activePanel.group).map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`ap-spec-tab${panelKey === p.key ? ' is-on' : ''}`}
                  onClick={() => selectPanel(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {panelKey === 'delivery' && (
            <div className="ap-spec-mode">
              <span className="ap-spec-mode-label">展示模式</span>
              <div className="ap-spec-mode-switch">
                <button
                  type="button"
                  className={`ap-spec-mode-btn${deliveryMode === 'list' ? ' is-on' : ''}`}
                  onClick={() => setDeliveryMode('list')}
                >
                  列表模式
                </button>
                <button
                  type="button"
                  className={`ap-spec-mode-btn${deliveryMode === 'card' ? ' is-on' : ''}`}
                  onClick={() => setDeliveryMode('card')}
                >
                  卡片模式
                </button>
              </div>
            </div>
          )}
          {panelKey === 'delivery' && deliveryMode === 'card' && (
            <p className="ap-spec-mode-hint">卡片模式为一行两店的精简卡片：起送/減配、準時寶、营业状态、标签栏、红包展开区等字段不展示，悬停说明仅标记卡片中可见字段。</p>
          )}
          <h3>{activePanel.group} · {activePanel.label} · 展示字段及标签说明</h3>
          <table>
            <thead>
              <tr><th>品牌</th><th>名称</th><th>说明</th></tr>
            </thead>
            <tbody>
              {specs.map((s) => (
                <tr
                  key={s.id}
                  onMouseEnter={() => highlight.setHighlight(s.id)}
                  onMouseLeave={() => highlight.setHighlight(null)}
                >
                  <td className="ap-spec-brand">
                    <div className="ap-spec-brand-pills">
                      {(s.brand ?? 'both') !== 'bee' && (
                        <span className="ap-spec-brand-pill ap-spec-brand-pill--mfood">mFood</span>
                      )}
                      {(s.brand ?? 'both') !== 'mfood' && (
                        <span className="ap-spec-brand-pill ap-spec-brand-pill--bee">閃蜂</span>
                      )}
                    </div>
                  </td>
                  <td className="ap-spec-name">
                    {editId === s.id ? (
                      <input
                        defaultValue={s.label}
                        onBlur={(e) => { handleEdit(s.id, 'label', e.target.value); setEditId(null) }}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        autoFocus
                      />
                    ) : (
                      <span onDoubleClick={(e) => { e.stopPropagation(); setEditId(s.id) }}>{s.label}</span>
                    )}
                  </td>
                  <td className="ap-spec-desc">
                    {editId === s.id ? (
                      <textarea
                        defaultValue={s.desc}
                        onBlur={(e) => { handleEdit(s.id, 'desc', e.target.value); setEditId(null) }}
                        rows={3}
                        autoFocus
                      />
                    ) : (
                      <span onDoubleClick={(e) => { e.stopPropagation(); setEditId(s.id) }}>{s.desc}<br/><em>{s.source}</em></span>
                    )}
                    {s.note && <p className="ap-spec-note">⚠ {s.note}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </HighlightProvider>
  )
}
