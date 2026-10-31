import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Empty, Progress, Space, Tag, type TableColumnsType } from 'antd'
import { ArrowRightOutlined, CheckCircleOutlined, DatabaseOutlined, DollarOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons'
import StatCards from '@/components/StatCards'
import HelpPopover from '@/components/HelpPopover'
import { DEPENDENCIES, SAMPLE_METRICS, SCENES, type Pane, type PrototypeRecord } from './prototypeData'
import { SampleTable, ScopeFilters } from './PrototypeTable'

export default function OverviewPage({ analytics = false, records, onNavigate }: {
  analytics?: boolean; records: PrototypeRecord[]; onNavigate: (pane: Pane, view?: string, id?: string) => void
}) {
  const { t } = useTranslation()
  const [filters, setFilters] = useState({ keyword: '', channel: '全部場景', region: '全城' })
  const rows = SAMPLE_METRICS.filter(r => (filters.channel === '全部場景' || r.channel === filters.channel)
    && (filters.region === '全城' || r.region === filters.region) && r.query.includes(filters.keyword.trim()))
  const sum = (key: 'searches' | 'clicks' | 'orders' | 'empty' | 'impressions' | 'revenue') => rows.reduce((n, r) => n + r[key], 0)
  const searches = sum('searches')
  const percent = (n: number, total: number) => total ? `${(100 * n / total).toFixed(1)}%` : '—'
  const columns: TableColumnsType<typeof SAMPLE_METRICS[number]> = [
    { key: 'id', title: t('searchV2.overview.colSample'), dataIndex: 'id' }, { key: 'query', title: t('searchV2.overview.colQuery'), dataIndex: 'query' },
    { key: 'channel', title: t('searchV2.overview.colScene'), dataIndex: 'channel' }, { key: 'region', title: t('searchV2.overview.colRegion'), dataIndex: 'region' },
    { key: 'searches', title: t('searchV2.overview.colSearches'), dataIndex: 'searches' }, { key: 'empty', title: t('searchV2.overview.colEmpty'), render: (_, r) => percent(r.empty, r.searches) },
    { key: 'clicks', title: t('searchV2.overview.colClicks'), dataIndex: 'clicks' }, { key: 'orders', title: t('searchV2.overview.colOrders'), dataIndex: 'orders' },
    { key: 'impressions', title: t('searchV2.overview.colImpressions'), dataIndex: 'impressions' },
    { key: 'revenue', title: t('searchV2.overview.colRevenue'), dataIndex: 'revenue' },
  ]
  return <>
    <ScopeFilters onChange={setFilters} keywordLabel={t('searchV2.overview.keywordLabel')} />
    <div className="sv2__stats"><StatCards animationKey={JSON.stringify(filters)} items={[
      { key: 'search', label: t('searchV2.overview.statSearch'), value: searches, color: 'info', icon: <SearchOutlined /> },
      { key: 'click', label: t('searchV2.overview.statCtr'), value: percent(sum('clicks'), searches - sum('empty')), color: 'brand', icon: <EyeOutlined /> },
      { key: 'order', label: t('searchV2.overview.statOrder'), value: sum('orders'), color: 'success', icon: <CheckCircleOutlined /> },
      { key: 'revenue', label: t('searchV2.overview.statRevenue'), value: sum('revenue'), suffix: ' MOP', color: 'system', icon: <DollarOutlined /> },
    ]} /></div>
    {analytics ? <>
      <div className="sv2__split"><section className="detail-card"><h3>{t('searchV2.overview.funnelTitle')}</h3>
        {[[t('searchV2.overview.funnelValid'), searches], [t('searchV2.overview.funnelResult'), searches - sum('empty')], [t('searchV2.overview.funnelClick'), sum('clicks')], [t('searchV2.overview.funnelOrder'), sum('orders')]].map(([label, value]) =>
          <div className="sv2__funnel-row" key={String(label)}><span>{label}</span><Progress percent={searches ? Number(value) / searches * 100 : 0} format={() => Number(value).toLocaleString()} strokeColor="#E8720C" /></div>)}
      </section><section className="detail-card"><h3>{t('searchV2.overview.revenueTitle')} <HelpPopover title={t('searchV2.overview.revenueHelpTitle')} ariaLabel={t('searchV2.overview.revenueHelpAria')} content={t('searchV2.overview.revenueHelpBody')} /></h3>
        <p>{t('searchV2.overview.revenueLine1')}</p>
        <p>{t('searchV2.overview.revenueLine2')}</p>
        <Alert type="info" showIcon message={t('searchV2.overview.revenueAlert')} />
      </section></div>
      <SampleTable pageKey="analytics" rows={rows} columns={columns} />
    </> : <>
      <div className="sv2__split"><section className="detail-card"><h3>{t('searchV2.overview.sceneTitle')}</h3>
        <div className="sv2__scene-links">{SCENES.map(scene => <button key={scene.value} onClick={() => onNavigate('lab')}>
          <span className="sv2__scene-index">{SCENES.indexOf(scene) + 1}</span><div><strong>{scene.label}</strong><small>{scene.description}</small></div><ArrowRightOutlined />
        </button>)}</div>
      </section><section className="detail-card"><h3>{t('searchV2.overview.demandTitle')} <Tag>{t('searchV2.overview.demandTag')}</Tag></h3>
        {rows.length ? rows.map(row => <div className="sv2__demand" key={row.id}><div><strong>{row.query}</strong><span>{row.region} · {row.channel}</span></div>
          <Progress percent={row.searches / searches * 100} strokeColor="#1890FF" format={() => row.searches.toLocaleString()} /></div>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('searchV2.overview.demandEmpty')} />}
        <Button type="link" onClick={() => onNavigate('analytics')}>{t('searchV2.overview.viewFunnel')} <ArrowRightOutlined /></Button>
      </section></div>
      <div className="sv2__split"><section className="detail-card"><h3>{t('searchV2.overview.prereqTitle')}</h3>
        <div className="sv2__dependencies">{DEPENDENCIES.map(([name, description, owner]) => <div key={name}><DatabaseOutlined /><div><strong>{name}</strong><p>{description}</p><small>{owner}</small></div><Tag>{t('searchV2.overview.prereqTag')}</Tag></div>)}</div>
      </section><section className="detail-card"><h3>{t('searchV2.overview.guardrailTitle')}</h3>
        <div className="sv2__guardrail"><CheckCircleOutlined /><div><strong>{t('searchV2.overview.guard1Title')}</strong><p>{t('searchV2.overview.guard1Body')}</p></div></div>
        <div className="sv2__guardrail"><CheckCircleOutlined /><div><strong>{t('searchV2.overview.guard2Title')}</strong><p>{t('searchV2.overview.guard2Body')}</p></div></div>
        <div className="sv2__guardrail"><CheckCircleOutlined /><div><strong>{t('searchV2.overview.guard3Title')}</strong><p>{t('searchV2.overview.guard3Body')}</p></div></div>
        <Space wrap><Button onClick={() => onNavigate('interventions')}>{t('searchV2.overview.viewInterventions')}</Button><Button onClick={() => onNavigate('releases')}>{t('searchV2.overview.viewReleases')}</Button></Space>
        <p className="sv2__footnote">{t('searchV2.overview.footnote', { total: records.length })}</p>
      </section></div>
    </>}
  </>
}
