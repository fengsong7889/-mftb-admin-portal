import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Result, Space, Tag, message } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, ExperimentOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { renderMenuIcon } from '@/components/MenuIcon'
import { useAuth } from '@/contexts/AuthContext'
import { useMenu } from '@/contexts/MenuContext'
import OverviewPage from './OverviewPage'
import { RecordList } from './PrototypeTable'
import RecordPage from './RecordPage'
import LabPage from './LabPage'
import { createSampleRecords, isPane, isRecordPane, leafUrl, PANES, prototypeUrl, SCENE_LABEL_KEY, SCENES, type Pane, type PrototypeRecord } from './prototypeData'
import { loadConfigPanes, saveConfigRecord, advanceStatus, WIRED_PANES } from './searchBridge'
import { leafMenuName } from './leafRoutes'
import './prototype.css'

interface Props {
  /** 叶子模式：由既有菜单叶子固定承载的能力域（方案 §18）；不传则从 query 读 pane（横线 tab 模式）。 */
  pane?: Pane
  /** 叶子模式下本叶子允许的类型 code 子集；多个菜单共用一张配置表时用它划分职责边界。 */
  kinds?: string[]
  /** 叶子自身路径；提供后列表/详情用 leafUrl 表达，不再依赖横线 tab。 */
  leafPath?: string
  /** 叶子对应的 sys_menu key；用于把页面标题对齐菜单自身名称（真值在 DB）。 */
  menuKey?: string
}

// 未融合入口仍借用既有全局配置；已融合叶子由侧边栏导航，不展示横线 tab。
export default function SearchV2Prototype({ pane: fixedPane, kinds, leafPath, menuKey }: Props = {}) {
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const { hasMenuPermission } = useAuth()
  const { menuTree } = useMenu()
  const { t } = useTranslation()
  const isLeaf = Boolean(leafPath)
  const [records, setRecords] = useState(createSampleRecords)
  const sequence = useRef(0)
  // 配置域接后端：拉取真实配置；响应成功的域以后端为真值替换样例，不可达的域保留原型样例（离线可预览）。
  const refreshConfig = async () => {
    const { records: rows, responded } = await loadConfigPanes()
    setRecords(prev => [...prev.filter(r => !responded.includes(r.pane)), ...rows])
  }
  useEffect(() => {
    let active = true
    void (async () => { if (active) await refreshConfig() })()
    return () => { active = false }
  }, [])
  const paneValue = fixedPane ?? query.get('pane') ?? 'overview'
  const view = query.get('view') ?? 'list'
  const id = query.get('id')
  // 叶子模式用自身路径 + view/id；落地页模式沿用 prototype=search-v2&pane= 查询参数。
  const handleNavigate = (nextPane: Pane, nextView = 'list', nextId?: string) =>
    navigate(leafPath ? leafUrl(leafPath, nextView, nextId) : prototypeUrl(nextPane, nextView, nextId))
  // 第一阶段暂沿用 global-config 门禁，与融合前行为一致；后端控制器仍绑该 key，
  // 若此处改成叶子 key 会出现「前端放行、接口 403」，重定与角色授予属第二阶段（方案 §18.4）。
  if (!hasMenuPermission('global-config')) return <Result status="403" title={t('searchV2.deniedTitle')} subTitle={t('searchV2.deniedSub')} />
  if (!isPane(paneValue) || !['list', 'add', 'edit', 'detail'].includes(view)) {
    return <Result status="404" title={t('searchV2.notFoundTitle')} extra={<Button onClick={() => (leafPath ? navigate(leafUrl(leafPath)) : handleNavigate('overview'))}>{leafPath ? t('searchV2.backList') : t('searchV2.backOverview')}</Button>} />
  }
  const pane = paneValue
  const page = PANES.find(item => item.key === pane)!
  // 叶子模式下标题跟菜单名一致（否则进「底紋配置」却显示「搜索引導」，且与兄弟叶子撞名）；
  // 菜单树不可用时回退能力域标题，不编造名称。
  const pageTitle = leafPath && menuKey ? leafMenuName(menuTree, menuKey) ?? t(page.title) : t(page.title)
  const record = records.find(item => item.id === id && item.pane === pane)
  const formMode = isRecordPane(pane) && view !== 'list'
  const missingRecord = formMode && view !== 'add' && !record
  const handleSave = async (draft: Omit<PrototypeRecord, 'id' | 'updatedAt'>, recordId?: string) => {
    // 已接后端的配置域优先落库；成功用后端 id，失败（不可用/校验拒绝）回退本次会话草稿，不谎报线上生效。
    if (WIRED_PANES.includes(draft.pane)) {
      const draftId = recordId && /^\d+$/.test(recordId) ? recordId : undefined
      const probe: PrototypeRecord = { ...draft, id: draftId ?? 'pending', updatedAt: '' }
      try {
        const backendId = await saveConfigRecord(probe, draft.pane, draftId)
        const saved: PrototypeRecord = { ...draft, id: backendId, updatedAt: '已保存到後端 · 未連接 ES，不參與檢索' }
        setRecords(prev => [...prev.filter(r => !(r.pane === draft.pane && r.id === (draftId ?? ''))), saved])
        message.success(t('searchV2.savedBackend'))
        handleNavigate(draft.pane, 'detail', backendId)
        return
      } catch {
        message.warning(t('searchV2.backendUnconfirmed'))
      }
    }
    const next: PrototypeRecord = { ...draft, id: recordId ?? `DEMO-LOCAL-${++sequence.current}`, updatedAt: '本次原型會話 · 尚未同步' }
    setRecords(previous => recordId ? previous.map(row => row.id === recordId ? next : row) : [next, ...previous])
    handleNavigate(draft.pane, 'detail', next.id)
  }
  return <div className="sv2 content-area">
    {!isLeaf && <header className="sv2__header">
      <div className="sv2__identity"><span className="sv2__logo"><ExperimentOutlined /></span><div><span className="sv2__eyebrow">{t('searchV2.eyebrow')}</span><h1>{t('searchV2.headline')}</h1><p>{t('searchV2.subline')}</p></div></div>
      <div className="sv2__header-actions"><Tag color="orange">{t('searchV2.badgePrototype')}</Tag><Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/global-config')}>{t('searchV2.backLegacy')}</Button></div>
    </header>}
    {/* 「借用全局配置入口」仅对未融合的落地页为真；叶子模式下该描述已不成立，不得展示。 */}
    {!isLeaf && <Alert type="info" showIcon message={t('searchV2.alertTitle')} description={t('searchV2.alertDesc')} />}
    {!isLeaf && <nav className="sv2__navigation" aria-label={t('searchV2.chrome.navAria')}>
      {PANES.map(item => <button key={item.key} aria-current={pane === item.key ? 'page' : undefined} onClick={() => handleNavigate(item.key)}>
        <span className="sv2__nav-icon">{renderMenuIcon(item.icon)}</span><span><strong>{t(item.title)}</strong><small>{t(item.subtitle)}</small></span>
      </button>)}
    </nav>}
    <div className="sv2__page-title"><div><h2>{pageTitle}</h2><p>{t(page.subtitle)}</p></div><Space><Tag icon={<SafetyCertificateOutlined />}>{t('searchV2.realOpsDisabled')}</Tag><Tag>{t('searchV2.appSample')}</Tag></Space></div>
    {missingRecord ? <Result status="404" title={t('searchV2.missingTitle')} subTitle={t('searchV2.missingSub')} extra={<Button onClick={() => handleNavigate(pane)}>{t('searchV2.backList')}</Button>} />
      : formMode && isRecordPane(pane) ? <RecordPage key={`${pane}-${view}-${id}`} pane={pane} kinds={kinds} record={record} readOnly={view === 'detail'} onBack={() => handleNavigate(pane)} onSave={handleSave}
        onStatus={async (recordId, status) => {
          // 已接后端且数字 id：走真实审批端点并刷新；否则回退本地演示。
          if (WIRED_PANES.includes(pane) && await advanceStatus(pane, recordId, status)) {
            message.success(t('searchV2.approvalUpdated'))
            await refreshConfig()
            handleNavigate(pane, 'detail', recordId)
            return
          }
          setRecords(previous => previous.map(row => row.id === recordId ? { ...row, status } : row))
        }} />
        : pane === 'overview' || pane === 'analytics' ? <OverviewPage key={pane} analytics={pane === 'analytics'} records={records} onNavigate={handleNavigate} />
          : pane === 'lab' ? <LabPage />
            : isRecordPane(pane) ? <>
              {pane === 'scenarios' && <div className="sv2__scenario-strip">{SCENES.map((scene, i) => <button key={scene.value} onClick={() => handleNavigate('scenarios', 'edit', `DEMO-S0${i + 1}`)}><strong>{t(SCENE_LABEL_KEY(scene.value))}</strong><small>{t(scene.descriptionKey)}</small><span>查看參數 →</span></button>)}</div>}
              {pane === 'guidance' && <Alert type="info" showIcon message={t('searchV2.guidanceNote')} />}
              {pane === 'interventions' && <Alert type="warning" showIcon message={t('searchV2.interventionNote')} />}
              {pane === 'ads' && <div className="sv2__product-strip"><div><Tag color="orange">{t('searchV2.productMainTag')}</Tag><strong>{t('searchV2.productMainName')}</strong><p>{t('searchV2.productMainDesc')}</p></div><div><Tag color="blue">{t('searchV2.productAuxTag')}</Tag><strong>{t('searchV2.productAuxName')}</strong><p>{t('searchV2.productAuxDesc')}</p></div></div>}
              {pane === 'releases' && <Alert type="warning" showIcon message={t('searchV2.releaseNote')} />}
              <RecordList key={pane} pane={pane} records={records} kinds={kinds} onNavigate={handleNavigate} />
            </> : null}
    <footer className="sv2__footer"><CheckCircleOutlined /> {t('searchV2.footer')} <span>{t('searchV2.footerNext')}</span></footer>
  </div>
}
