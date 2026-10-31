import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Descriptions, Empty, Form, Input, Select, Space, Switch, Tabs, Tag, type TableColumnsType } from 'antd'
import { ExperimentOutlined, SearchOutlined, SwapOutlined } from '@ant-design/icons'
import HelpPopover from '@/components/HelpPopover'
import ConsumerPreview from './ConsumerPreview'
import { SampleTable } from './PrototypeTable'
import { SCENE_LABEL_KEY, SCENES, options } from './prototypeData'
import { getPreviewCards, type DisplayState, type PreviewCard, type PreviewContext } from './previewFixtures'

const INITIAL: PreviewContext = { scene: 'delivery', region: '澳門', query: '漢堡', sort: 'relevance', showAds: true }
const DISPLAY_OPTIONS: { value: DisplayState; labelKey: string }[] = [
  { value: 'results', labelKey: 'searchV2.lab.dsResults' }, { value: 'guidance', labelKey: 'searchV2.lab.dsGuidance' }, { value: 'empty', labelKey: 'searchV2.lab.dsEmpty' },
  { value: 'loading', labelKey: 'searchV2.lab.dsLoading' }, { value: 'error', labelKey: 'searchV2.lab.dsError' }, { value: 'partial', labelKey: 'searchV2.lab.dsPartial' },
]
const PIPELINE_KEYS = ['searchV2.lab.pipelineData', 'searchV2.lab.pipelineChannel', 'searchV2.lab.pipelineService', 'searchV2.lab.pipelineExact', 'searchV2.lab.pipelineWindow', 'searchV2.lab.pipelineDedup']
export default function LabPage() {
  const { t } = useTranslation()
  const [form] = Form.useForm<PreviewContext>()
  const [context, setContext] = useState<PreviewContext>(INITIAL)
  const [displayState, setDisplayState] = useState<DisplayState>('results')
  const [mode, setMode] = useState('current')
  const [compare, setCompare] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [histories, setHistories] = useState<Record<string, string[]>>({})
  const sceneValue = Form.useWatch('scene', form) ?? INITIAL.scene
  const historyMode = mode === 'history'
  const activeContext = historyMode ? INITIAL : context
  const cards = getPreviewCards(activeContext)
  const baseline = getPreviewCards({ ...activeContext, showAds: false })
  const columns: TableColumnsType<PreviewCard> = [
    { key: 'id', title: t('searchV2.lab.colObject'), dataIndex: 'id', width: 140 },
    { key: 'title', title: t('searchV2.lab.colResult'), dataIndex: 'title', width: 190 },
    { key: 'natural', title: t('searchV2.lab.colNatural'), render: (_, row) => baseline.findIndex(c => c.id === row.id) + 1 },
    { key: 'final', title: t('searchV2.lab.colFinal'), render: (_, row) => cards.findIndex(c => c.id === row.id) + 1 },
    { key: 'source', title: t('searchV2.lab.colType'), render: (_, row) => <Tag color={row.isAd ? 'orange' : 'default'}>{row.isAd ? t('searchV2.lab.tagAdSample') : t('searchV2.lab.tagNaturalSample')}</Tag> },
    { key: 'score', title: t('searchV2.lab.colScore'), render: () => t('searchV2.lab.scoreNotConnected') },
  ]
  const historyKey = activeContext.scene === 'store' ? `store-${activeContext.region}` : activeContext.scene
  const handleApply = (next: PreviewContext) => {
    const key = next.scene === 'store' ? `store-${next.region}` : next.scene
    setHistories(previous => ({ ...previous, [key]: [next.query, ...(previous[key] ?? []).filter(word => word !== next.query)].slice(0, 10) }))
    setContext(next); form.setFieldsValue(next); setDisplayState('results')
  }
  const handleQuery = (query: string) => handleApply({ ...context, query })
  const handleGlobal = () => {
    const next = { ...context, scene: 'home' as const }
    setContext(next); form.setFieldsValue(next); setDisplayState('results')
  }
  return <>
    <Alert type="warning" showIcon message={t('searchV2.lab.alertMsg')} description={t('searchV2.lab.alertDesc')} />
    <Tabs activeKey={mode} onChange={value => { setMode(value); setHistoryLoaded(false); setCompare(false) }} items={[
      { key: 'current', label: t('searchV2.lab.tabCurrent') }, { key: 'history', label: t('searchV2.lab.tabHistory') },
    ]} />
    {historyMode && <section className="detail-card"><h3>{t('searchV2.lab.historyH3')}</h3>
      <div className="sv2__form-grid"><Form.Item label={t('searchV2.lab.historyFieldTrace')}><Input disabled placeholder={t('searchV2.lab.historyPlaceholder')} /></Form.Item>
        <Form.Item label={t('searchV2.lab.historyFieldDemo')}><Button onClick={() => setHistoryLoaded(true)}>{t('searchV2.lab.historyLoadBtn')}</Button></Form.Item></div>
      <Alert type="info" showIcon message={t('searchV2.lab.historyAlert')} />
    </section>}
    {(!historyMode || historyLoaded) ? <div className="sv2__lab-layout">
      <div className="sv2__lab-controls">
        {!historyMode && <section className="detail-card"><h3><ExperimentOutlined /> {t('searchV2.lab.selectDemoH3')}</h3>
          <Form form={form} layout="vertical" initialValues={INITIAL} onFinish={values => handleApply({ ...values, query: values.query.trim() })}
            onValuesChange={changed => { if (changed.scene) { form.setFieldValue('query', SCENES.find(s => s.value === changed.scene)?.query ?? ''); form.setFieldValue('sort', 'relevance') } }}>
            <div className="sv2__form-grid sv2__form-grid--two">
              <Form.Item name="scene" label={t('searchV2.lab.fieldScene')}><Select options={SCENES.map(s => ({ value: s.value, label: t(SCENE_LABEL_KEY(s.value)) }))} /></Form.Item>
              <Form.Item name="region" label={t('searchV2.lab.fieldRegion')}><Select options={options(['澳門', '氹仔'])} /></Form.Item>
              <Form.Item name="query" label={t('searchV2.lab.fieldKeyword')} rules={[{ required: true, whitespace: true, message: t('searchV2.lab.keywordRequired') }]}><Input maxLength={60} /></Form.Item>
              <Form.Item name="sort" label={t('searchV2.lab.fieldSort')}><Select options={[
                { value: 'relevance', label: t('searchV2.lab.sortRelevance') }, { value: 'sales', label: t('searchV2.lab.sortSales') },
                { value: 'distance', label: t('searchV2.lab.sortDistance'), disabled: sceneValue === 'store' || sceneValue === 'home' }, { value: 'price', label: t('searchV2.lab.sortPrice'), disabled: sceneValue === 'home' },
              ]} /></Form.Item>
            </div>
            {sceneValue === 'store' && <p className="sv2__rule-note">{t('searchV2.lab.storeNote')}</p>}
            <Form.Item name="showAds" label={t('searchV2.lab.fieldShowAds')} valuePropName="checked"><Switch checkedChildren={t('searchV2.lab.switchOn')} unCheckedChildren={t('searchV2.lab.switchOff')} /></Form.Item>
            <div className="sv2__lab-actions"><Button type="primary" aria-label={t('searchV2.lab.btnLoad')} icon={<SearchOutlined />} htmlType="submit">{t('searchV2.lab.btnLoad')}</Button><Button onClick={() => { form.resetFields(); setContext(INITIAL); setDisplayState('results'); setCompare(false) }}>{t('searchV2.lab.btnReset')}</Button></div>
          </Form>
        </section>}
        <section className="detail-card"><h3>{t('searchV2.lab.contextH3')}</h3><Descriptions column={1} size="small" items={[
          { key: 'scene', label: t('searchV2.lab.ctxScene'), children: t(SCENE_LABEL_KEY(activeContext.scene)) },
          { key: 'region', label: t('searchV2.lab.ctxRegion'), children: `${activeContext.region} ${t('searchV2.lab.ctxRegionSuffix')}` },
          { key: 'word', label: t('searchV2.lab.ctxWord'), children: activeContext.query },
          { key: 'time', label: t('searchV2.lab.ctxSource'), children: historyMode ? t('searchV2.lab.ctxSourceHistory') : t('searchV2.lab.ctxSourceBuiltin') },
          { key: 'policy', label: t('searchV2.lab.ctxOnline'), children: t('searchV2.lab.ctxNotConnected') },
          { key: 'user', label: t('searchV2.lab.ctxUser'), children: t('searchV2.lab.ctxSynthetic') },
        ]} /></section>
        {!historyMode && <section className="detail-card"><h3>{t('searchV2.lab.displayH3')}</h3><Select aria-label={t('searchV2.lab.displayH3')} value={displayState} options={DISPLAY_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) }))} onChange={setDisplayState} />
          <p className="sv2__footnote">{t('searchV2.lab.displayFootnote')}</p>
          <Button icon={<SwapOutlined />} onClick={() => setCompare(previous => !previous)}>{compare ? t('searchV2.lab.btnCollapse') : t('searchV2.lab.btnView')}{t('searchV2.lab.compareSuffix')}</Button>
        </section>}
      </div>
      <ConsumerPreview key={`${activeContext.scene}-${activeContext.region}-${activeContext.query}-${mode}`} context={activeContext} cards={cards} state={historyMode ? 'results' : displayState}
        readOnly={historyMode} history={histories[historyKey] ?? []} onClearHistory={() => setHistories(previous => ({ ...previous, [historyKey]: [] }))}
        onQuery={handleQuery} onGlobal={handleGlobal} onRetry={() => setDisplayState('results')} />
    </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('searchV2.lab.historyEmpty')} />}
    {(!historyMode || historyLoaded) && <>
      {(compare || historyMode) && <section><h3>{t('searchV2.lab.comparisonH3')} <Tag>{t('searchV2.lab.tagNonAlgo')}</Tag></h3><SampleTable pageKey="lab-comparison" rows={cards} columns={columns} /></section>}
      <div className="sv2__split"><section className="detail-card"><h3>{t('searchV2.lab.missH3')} <HelpPopover title={t('searchV2.lab.missHelpTitle')} ariaLabel={t('searchV2.lab.missHelpAria')} content={t('searchV2.lab.missHelpBody')} /></h3>
        <div className="sv2__pipeline">{PIPELINE_KEYS.map(key => <Tag key={key}>{t(key)} · {t('searchV2.lab.pipelinePending')}</Tag>)}</div>
      </section><section className="detail-card"><h3>{t('searchV2.lab.serverH3')}</h3><p>{t('searchV2.lab.serverBody')}</p>
        <Space wrap><Button disabled>{t('searchV2.lab.btnEsExplain')}</Button><Button disabled>{t('searchV2.lab.btnSaveRegression')}</Button></Space>
      </section></div>
    </>}
  </>
}
