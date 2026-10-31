import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Result, Space, Tag, message } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, ExperimentOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { renderMenuIcon } from '@/components/MenuIcon'
import { useAuth } from '@/contexts/AuthContext'
import OverviewPage from './OverviewPage'
import { RecordList } from './PrototypeTable'
import RecordPage from './RecordPage'
import LabPage from './LabPage'
import { createSampleRecords, isPane, isRecordPane, PANES, prototypeUrl, SCENES, type Pane, type PrototypeRecord } from './prototypeData'
import { loadConfigPanes, saveConfigRecord, advanceStatus, WIRED_PANES } from './searchBridge'
import './prototype.css'

// 本阶段只有静态原型。借用既有全局配置入口权限，不登记尚未落库的生产菜单。
export default function SearchV2Prototype() {
  const navigate = useNavigate()
  const [query] = useSearchParams()
  const { hasMenuPermission } = useAuth()
  const { t } = useTranslation()
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
  const paneValue = query.get('pane') ?? 'overview'
  const view = query.get('view') ?? 'list'
  const id = query.get('id')
  const handleNavigate = (pane: Pane, nextView = 'list', nextId?: string) => navigate(prototypeUrl(pane, nextView, nextId))
  if (!hasMenuPermission('global-config')) return <Result status="403" title={t('searchV2.deniedTitle')} subTitle={t('searchV2.deniedSub')} />
  if (!isPane(paneValue) || !['list', 'add', 'edit', 'detail'].includes(view)) return <Result status="404" title={t('searchV2.notFoundTitle')} extra={<Button onClick={() => handleNavigate('overview')}>{t('searchV2.backOverview')}</Button>} />
  const pane = paneValue
  const page = PANES.find(item => item.key === pane)!
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
    <header className="sv2__header">
      <div className="sv2__identity"><span className="sv2__logo"><ExperimentOutlined /></span><div><span className="sv2__eyebrow">{t('searchV2.eyebrow')}</span><h1>{t('searchV2.headline')}</h1><p>{t('searchV2.subline')}</p></div></div>
      <div className="sv2__header-actions"><Tag color="orange">{t('searchV2.badgePrototype')}</Tag><Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/global-config')}>{t('searchV2.backLegacy')}</Button></div>
    </header>
    <Alert type="info" showIcon message={t('searchV2.alertTitle')} description={t('searchV2.alertDesc')} />
    <nav className="sv2__navigation" aria-label="搜索新版原型導航">
      {PANES.map(item => <button key={item.key} aria-current={pane === item.key ? 'page' : undefined} onClick={() => handleNavigate(item.key)}>
        <span className="sv2__nav-icon">{renderMenuIcon(item.icon)}</span><span><strong>{t(item.title)}</strong><small>{t(item.subtitle)}</small></span>
      </button>)}
    </nav>
    <div className="sv2__page-title"><div><h2>{t(page.title)}</h2><p>{t(page.subtitle)}</p></div><Space><Tag icon={<SafetyCertificateOutlined />}>{t('searchV2.realOpsDisabled')}</Tag><Tag>{t('searchV2.appSample')}</Tag></Space></div>
    {missingRecord ? <Result status="404" title={t('searchV2.missingTitle')} subTitle={t('searchV2.missingSub')} extra={<Button onClick={() => handleNavigate(pane)}>{t('searchV2.backList')}</Button>} />
      : formMode && isRecordPane(pane) ? <RecordPage key={`${pane}-${view}-${id}`} pane={pane} record={record} readOnly={view === 'detail'} onBack={() => handleNavigate(pane)} onSave={handleSave}
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
              {pane === 'scenarios' && <div className="sv2__scenario-strip">{SCENES.map((scene, i) => <button key={scene.value} onClick={() => handleNavigate('scenarios', 'edit', `DEMO-S0${i + 1}`)}><strong>{scene.label}</strong><small>{scene.description}</small><span>查看參數 →</span></button>)}</div>}
              {pane === 'guidance' && <Alert type="info" showIcon message={t('searchV2.guidanceNote')} />}
              {pane === 'interventions' && <Alert type="warning" showIcon message={t('searchV2.interventionNote')} />}
              {pane === 'ads' && <div className="sv2__product-strip"><div><Tag color="orange">{t('searchV2.productMainTag')}</Tag><strong>{t('searchV2.productMainName')}</strong><p>{t('searchV2.productMainDesc')}</p></div><div><Tag color="blue">{t('searchV2.productAuxTag')}</Tag><strong>{t('searchV2.productAuxName')}</strong><p>{t('searchV2.productAuxDesc')}</p></div></div>}
              {pane === 'releases' && <Alert type="warning" showIcon message={t('searchV2.releaseNote')} />}
              <RecordList key={pane} pane={pane} records={records} onNavigate={handleNavigate} />
            </> : null}
    <footer className="sv2__footer"><CheckCircleOutlined /> {t('searchV2.footer')} <span>{t('searchV2.footerNext')}</span></footer>
  </div>
}
