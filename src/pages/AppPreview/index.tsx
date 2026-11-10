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
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import PhoneFrame from './PhoneFrame'
import MerchantApp from './MerchantApp'
import ConsumerApp from './ConsumerApp'
import MfoodApp from './MfoodApp'
import { HighlightProvider, useHighlightProvider } from './SpecHighlight'
import { SPEC_PANELS, loadSpecs, saveSpecs, type SpecEntry, type SpecPanelKey } from './groupBuySpec'
import './appPreview.css'

/** desc 支持 **加粗** 标记：按序拆成 普通/加粗 段渲染（说明文案重点标记口径），不用 innerHTML */
function renderDesc(text: string) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

/** 分段轨道·滑动高亮容器：高亮丸（thumb）以 transform+width 过渡跟随选中项（两者皆可插值），
 *  取代旧「选中背景硬切换」——渐变背景无法过渡插值只能瞬现，是「硬加载感」的根因；
 *  按钮只保留文字色渐变与按压反馈。首帧在 useLayoutEffect 内完成测量，无入场动画；
 *  setThumb 带值比较守卫，避免每渲染测量产生自激重渲染 */
function SpecTrack({ variant, children }: { variant: 'group' | 'panel' | 'mini'; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    const measure = () => {
      const active = root.querySelector<HTMLElement>('.is-on')
      const next = active ? { transform: `translateX(${active.offsetLeft}px)`, width: active.offsetWidth } : null
      setThumb((prev) => (
        prev?.transform === next?.transform && prev?.width === next?.width ? prev : next
      ))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  })

  const trackClass = variant === 'panel'
    ? 'ap-spec-track ap-spec-track--sub'
    : variant === 'mini'
      ? 'ap-spec-track ap-spec-track--mini'
      : 'ap-spec-track'
  return (
    <div ref={ref} className={trackClass}>
      {thumb && <span className={`ap-spec-thumb ap-spec-thumb--${variant}`} style={thumb} aria-hidden="true" />}
      {children}
    </div>
  )
}

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
    filter: loadSpecs('filter'),
    deliveryPage: loadSpecs('deliveryPage'),
    searchDelivery: loadSpecs('searchDelivery'),
    searchGroup: loadSpecs('searchGroup'),
    searchDeliveryPage: loadSpecs('searchDeliveryPage'),
    searchGroupPage: loadSpecs('searchGroupPage'),
  }))
  const [editId, setEditId] = useState<number | null>(null)
  /** 外卖瀑布流展示模式：小图（一行一店，原「列表」）/ 卡片（一行两店）/ 大图（顶部大图封面，閃蜂/MFOOD 均实现）；说明面板切换器下发，两台手机同步 */
  const [deliveryMode, setDeliveryMode] = useState<'list' | 'card' | 'large'>('list')
  /** 優選商家/附近好店列表大小圖模式：小圖/大圖；说明面板切换器下发，两台手机同步（同 deliveryMode 先例） */
  const [preferredLayout, setPreferredLayout] = useState<'small' | 'large'>('large')
  /** 美食外卖频道页瀑布流大小图模式：小图/大图；说明面板切换器下发（频道页为閃蜂专属，MFOOD 无对应页回落首页） */
  const [deliveryPageMode, setDeliveryPageMode] = useState<'small' | 'large'>('small')

  const specs = specsByPanel[panelKey]

  /** 面板 → 手机壳同步命令：首页两类回首页切分类；特惠团购页进团购页切页签（filter 只进页不改页签——筛选栏跨页签共享）；
   *  delivery-page → 双壳进美食外賣频道页；
   *  search-delivery / search-group → 双壳打开首页搜索结果页并切到对应瀑布流（频道内搜索会被替换为首页搜索，保证与面板口径对应）；
   *  delivery-search / groupbuy-search → 双壳进入对应频道内搜索结果页瀑布流（美食外卖页/特惠团购页·搜索结果瀑布流面板） */
  const SYNC_BY_PANEL: Record<SpecPanelKey, string> = {
    groupBuy: 'group',
    delivery: 'delivery',
    groupPage: 'page-group',
    preferred: 'preferred',
    filter: 'filter',
    searchGroupPage: 'groupbuy-search',
    deliveryPage: 'delivery-page',
    searchDeliveryPage: 'delivery-search',
    searchDelivery: 'search-delivery',
    searchGroup: 'search-group',
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
              deliveryPageMode={deliveryPageMode}
              preferredLayout={preferredLayout}
              onPreferredLayoutChange={setPreferredLayout}
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
              deliveryPageMode={deliveryPageMode}
              preferredLayout={preferredLayout}
              onPreferredLayoutChange={setPreferredLayout}
            />
          </PhoneFrame>
        </div>
        <div className="ap-spec-panel">
          {/* 顶部控制栈（统一分段轨道语言）：①菜单分组行 → ②瀑布流面板行（主级）→ ③条件行（展示模式切换） */}
          <div className="ap-spec-tabs">
            <SpecTrack variant="group">
              {Array.from(new Set(SPEC_PANELS.filter((p) => !p.hidden).map((p) => p.group))).map((group) => (
                <button
                  key={group}
                  type="button"
                  className={`ap-spec-group-tab${activePanel.group === group ? ' is-on' : ''}`}
                  onClick={() => {
                    const first = SPEC_PANELS.find((p) => p.group === group && !p.hidden)
                    if (first) selectPanel(first.key)
                  }}
                >
                  {group}
                </button>
              ))}
            </SpecTrack>
            {/* 面板行（次级）：单面板分组（美食外卖页）不渲染轨道，避免与标题重复的孤粒；隐藏面板（三级寻址）不进轨道 */}
            {SPEC_PANELS.filter((p) => p.group === activePanel.group && !p.hidden).length > 1 && (
              <SpecTrack variant="panel">
                {SPEC_PANELS.filter((p) => p.group === activePanel.group && !p.hidden).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`ap-spec-panel-tab${panelKey === p.key || activePanel.tabAlias === p.key ? ' is-on' : ''}`}
                    onClick={() => selectPanel(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </SpecTrack>
            )}
            {panelKey === 'delivery' && (
              <div className="ap-spec-mode">
                <span className="ap-spec-mode-label">展示模式</span>
                <SpecTrack variant="mini">
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${deliveryMode === 'list' ? ' is-on' : ''}`}
                    onClick={() => setDeliveryMode('list')}
                  >
                    小图模式
                  </button>
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${deliveryMode === 'card' ? ' is-on' : ''}`}
                    onClick={() => setDeliveryMode('card')}
                  >
                    卡片模式
                  </button>
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${deliveryMode === 'large' ? ' is-on' : ''}`}
                    onClick={() => setDeliveryMode('large')}
                  >
                    大图模式
                  </button>
                </SpecTrack>
              </div>
            )}
            {panelKey === 'deliveryPage' && (
              <div className="ap-spec-mode">
                <span className="ap-spec-mode-label">展示模式</span>
                <SpecTrack variant="mini">
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${deliveryPageMode === 'small' ? ' is-on' : ''}`}
                    onClick={() => setDeliveryPageMode('small')}
                  >
                    小图模式
                  </button>
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${deliveryPageMode === 'large' ? ' is-on' : ''}`}
                    onClick={() => setDeliveryPageMode('large')}
                  >
                    大图模式
                  </button>
                </SpecTrack>
              </div>
            )}
            {panelKey === 'preferred' && (
              <div className="ap-spec-mode">
                <span className="ap-spec-mode-label">展示模式</span>
                <SpecTrack variant="mini">
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${preferredLayout === 'small' ? ' is-on' : ''}`}
                    onClick={() => setPreferredLayout('small')}
                  >
                    小圖模式
                  </button>
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${preferredLayout === 'large' ? ' is-on' : ''}`}
                    onClick={() => setPreferredLayout('large')}
                  >
                    大圖模式
                  </button>
                </SpecTrack>
              </div>
            )}
            {/* 三级（搜索结果瀑布流）：外卖 / 团购 两条瀑布流各有一套字段说明，切换同步表格内容、锚点作用域与壳内结果页分类 */}
            {(panelKey === 'searchDelivery' || panelKey === 'searchGroup') && (
              <div className="ap-spec-mode">
                <span className="ap-spec-mode-label">瀑布流</span>
                <SpecTrack variant="mini">
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${panelKey === 'searchDelivery' ? ' is-on' : ''}`}
                    onClick={() => selectPanel('searchDelivery')}
                  >
                    外卖
                  </button>
                  <button
                    type="button"
                    className={`ap-spec-mode-btn${panelKey === 'searchGroup' ? ' is-on' : ''}`}
                    onClick={() => selectPanel('searchGroup')}
                  >
                    团购
                  </button>
                </SpecTrack>
              </div>
            )}
          </div>
          <h3>{activePanel.title ?? `${activePanel.group} · ${activePanel.label} · 展示字段及标签说明`}</h3>
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
                      <span onDoubleClick={(e) => { e.stopPropagation(); setEditId(s.id) }}>{renderDesc(s.desc)}<br/><em>{s.source}</em></span>
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
