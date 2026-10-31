import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Descriptions, Form, Input, InputNumber, Modal, Select, Space, Steps, Tag, message } from 'antd'
import { ArrowLeftOutlined, CheckCircleOutlined, DatabaseOutlined, EditOutlined, EyeOutlined, SaveOutlined, SettingOutlined } from '@ant-design/icons'
import DetailPageHeader from '@/components/DetailPageHeader'
import RemarkTextArea from '@/components/RemarkTextArea'
import HelpPopover from '@/components/HelpPopover'
import StatCards from '@/components/StatCards'
import { useUnsavedGuard } from '@/contexts/UnsavedChangesContext'
import { CHANNELS, FIELD_SCHEMAS, KINDS, PANES, REGIONS, STATUS, validateDraft, options, type DraftValues, type PrototypeRecord, type RecordPane } from './prototypeData'
import { WIRED_PANES } from './searchBridge'
import { StatusTag } from './PrototypeTable'

interface RecordFormValues { name: string; channel: string; region: string; kind: string; values: DraftValues }
interface Props {
  pane: RecordPane
  record?: PrototypeRecord
  readOnly: boolean
  onBack: () => void
  onSave: (record: Omit<PrototypeRecord, 'id' | 'updatedAt'>, id?: string) => void
  onStatus: (id: string, status: PrototypeRecord['status']) => void
}

export default function RecordPage({ pane, record, readOnly, onBack, onSave, onStatus }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<RecordFormValues>()
  const kind = Form.useWatch('kind', form) ?? record?.kind ?? KINDS[pane][0]
  const channel = Form.useWatch('channel', form) ?? record?.channel ?? '美食外賣'
  const [issue, setIssue] = useState('')
  const dirty = useRef(false)
  const { register } = useUnsavedGuard()
  const [updatedAt] = useState(record?.updatedAt ?? '未保存')
  const title = `${readOnly ? '查看' : record ? '編輯' : '新增'}${t(PANES.find(p => p.key === pane)!.title)}示例`
  useEffect(() => register({ isDirty: () => dirty.current, discard: () => { dirty.current = false }, describe: () => title }), [register, title])
  useEffect(() => {
    const handleUnload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])
  const fields = FIELD_SCHEMAS[pane].filter(field => !(
    (pane === 'interventions' && ['精確準入', '同集團打散'].includes(kind) && field.key === 'factor')
    || (pane === 'ads' && kind === '推廣搜索週期位' && ['quota', 'daily', 'match', 'negative'].includes(field.key))
  ))
  const initial: RecordFormValues = {
    name: record?.name ?? '', channel: record?.channel ?? '美食外賣', region: record?.region ?? '全城', kind: record?.kind ?? KINDS[pane][0],
    values: { ...Object.fromEntries(FIELD_SCHEMAS[pane].map(f => [f.key, f.initial])), ...record?.values },
  }
  const handleSave = (values: RecordFormValues) => {
    const error = validateDraft(pane, values.kind, values.values)
      ?? (pane === 'scenarios' && channel === '店內搜索' && Number(values.values.ads) !== 0 ? '店內搜索不允許跨商家廣告' : undefined)
      ?? (pane === 'scenarios' && channel === '大首頁' && Number(values.values.ads) > 2 ? '大首頁廣告上限為 2 張' : undefined)
    if (error) { setIssue(error); return }
    dirty.current = false
    const visibleValues: DraftValues = Object.fromEntries(fields.map(field => [field.key, values.values[field.key]]))
    // 编辑只改变计划草稿，不沿用已交付样例的账本数字制造可修改额度的错觉。
    onSave({ pane, ...values, values: visibleValues, name: values.name.trim(), status: STATUS.DRAFT }, record?.id)
  }
  const handleDemoReview = () => {
    if (!record) return
    const next = record.status === STATUS.DRAFT ? STATUS.REVIEW : record.status === STATUS.REVIEW ? STATUS.APPROVED : STATUS.SCHEDULED
    Modal.confirm({
      title: t('searchV2.form.demoConfirmTitle'), className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card"><b>{record.name}</b><p>{record.status} → {next}</p><p>{t('searchV2.form.demoConfirmBody')}</p></div>,
      okText: t('searchV2.form.demoConfirmOk'), cancelText: t('searchV2.form.cancel'),
      onOk: () => { onStatus(record.id, next); message.info(t('searchV2.form.demoDone')) },
    })
  }
  return <div className="sv2__record">
    {readOnly ? <DetailPageHeader title={title} meta={record?.id} onBack={onBack} tags={<Tag>{t('searchV2.form.readOnlyTag')}</Tag>} />
      : <div className="sv2__form-header"><div className="sv2__gradient" /><div className="sv2__form-title">
        <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}>{t('searchV2.form.back')}</Button><h2>{title}</h2><Tag>{t('searchV2.form.draftTag')}</Tag>
      </div></div>}
    <Alert type="info" showIcon message={t('searchV2.form.formAlert')} />
    {readOnly && record && <div className="sv2__detail-status"><StatusTag status={record.status} /></div>}
    <Form form={form} layout="vertical" initialValues={initial} disabled={readOnly} onFinish={handleSave}
      onValuesChange={changed => {
        dirty.current = true; setIssue('')
        if (pane === 'ads' && changed.kind) form.setFieldValue(['values', 'slot'], changed.kind === '搜索投流包' ? '搜索結果首屏' : '搜索激活頁推廣區')
      }}>
      <section className="detail-card sv2__form-card"><h3><DatabaseOutlined /> {t('searchV2.form.sectionBase')}</h3>
        <div className="sv2__form-grid">
          <Form.Item name="name" label={<>{t('searchV2.form.fieldName')}{WIRED_PANES.includes(pane) && <HelpPopover title={t('searchV2.form.nameHelpTitle')} ariaLabel={t('searchV2.form.nameHelpAria')} content={t('searchV2.form.nameHelpBody')} />}</>} rules={[{ required: true, whitespace: true, message: t('searchV2.form.nameRequired') }, { max: 60, message: t('searchV2.form.nameMax') }]}><Input maxLength={60} /></Form.Item>
          <Form.Item name="kind" label={t('searchV2.form.fieldType')} rules={[{ required: true }]}><Select options={options(KINDS[pane])} /></Form.Item>
          <Form.Item name="channel" label={t('searchV2.form.fieldScene')} rules={[{ required: true }]}><Select options={options(CHANNELS)} /></Form.Item>
          <Form.Item name="region" label={t('searchV2.form.fieldRegion')} rules={[{ required: true }]}><Select options={options(REGIONS)} /></Form.Item>
          <Form.Item label={t('searchV2.form.fieldAppBrand')}><Input value={t('searchV2.form.appBrandValue')} disabled /></Form.Item>
          <Form.Item label={t('searchV2.form.fieldOnlineVersion')}><Input value={t('searchV2.form.notConnected')} disabled /></Form.Item>
        </div>
      </section>
      <section className="detail-card sv2__form-card"><h3><SettingOutlined /> {pane === 'ads' ? t('searchV2.form.sectionAd') : t('searchV2.form.sectionRule')}
        <HelpPopover title="原型與正式校驗" ariaLabel="原型校驗說明" content="此階段只校驗表單體驗；真實權限、資源歸屬、衝突、庫存與金額均須由第二階段後端重驗。" /></h3>
        <div className="sv2__form-grid">
          {fields.map(field => <Form.Item key={field.key} name={['values', field.key]} className={field.type === 'remark' ? 'sv2__full-row' : undefined}
            label={<>{field.label}{field.help && <HelpPopover title={field.label} ariaLabel={`${field.label}說明`} content={field.help} />}</>}
            rules={field.type === 'number' ? [{ required: true, type: 'number', min: field.min, max: field.max, message: `請填寫 ${field.min}～${field.max}` }]
              : [{ required: field.required, whitespace: true, message: `請填寫${field.label}` }]}>
            {field.type === 'number' ? <InputNumber min={field.min} max={field.max} precision={field.key === 'factor' ? 1 : 0} step={field.key === 'factor' ? 0.1 : 1} />
              : field.type === 'select' ? <Select disabled={readOnly || (pane === 'ads' && field.key === 'slot')} options={options(field.options ?? [])} />
                : field.type === 'remark' ? <RemarkTextArea /> : <Input type={field.type === 'date' ? 'date' : 'text'} maxLength={field.key === 'evidence' ? 200 : 120} />}
          </Form.Item>)}
        </div>
        {pane === 'scenarios' && <div className="sv2__rule-note">{t('searchV2.form.scenarioNote')}</div>}
        {pane === 'interventions' && <Alert type="warning" showIcon message={t('searchV2.form.interventionNote')} />}
        {pane === 'guidance' && <Alert type="info" showIcon message={kind === '推廣搜索' ? t('searchV2.form.guidancePaid') : t('searchV2.form.guidanceNatural')} />}
        {pane === 'ads' && <Alert type="warning" showIcon message={kind === '搜索投流包' ? t('searchV2.form.adsPlan') : t('searchV2.form.adsCycle')} />}
      </section>
      {issue && <Alert type="error" showIcon message={issue} />}
      {!readOnly && <div className="form-footer"><Button onClick={onBack}>{t('searchV2.form.cancel')}</Button><Button type="primary" htmlType="submit" aria-label={t('searchV2.form.saveDraft')} icon={<SaveOutlined />}>{t('searchV2.form.saveDraft')}</Button></div>}
    </Form>
    {pane === 'ads' && readOnly && record?.kind === '搜索投流包' && <section className="detail-card">
      <h3>{t('searchV2.form.entitlementTitle')}</h3><StatCards items={[
        { key: 'q', label: '示例購買額度 Q', value: Number(record.values.quota ?? 0), color: 'info', icon: <DatabaseOutlined /> },
        { key: 'c', label: '示例有效消耗 C', value: Number(record.values.consumed ?? 0), color: 'brand', icon: <EyeOutlined /> },
        { key: 'r', label: '示例暫占 R', value: Number(record.values.reserved ?? 0), color: 'system', icon: <EditOutlined /> },
        { key: 'left', label: '示例可用餘額 Q−C−R', value: Number(record.values.quota ?? 0) - Number(record.values.consumed ?? 0) - Number(record.values.reserved ?? 0), color: 'success', icon: <CheckCircleOutlined /> },
      ]} /><p className="sv2__footnote">50% 面積連續可見 1 秒，通過服務端校驗才消耗；退款需先結清暫占。本原型不簽發回執。</p>
      <Space><Button disabled>{t('searchV2.form.buyPackage')}</Button><Button disabled>{t('searchV2.form.refund')}</Button></Space>
    </section>}
    {pane === 'releases' && readOnly && record && <section className="detail-card">
      <h3>{t('searchV2.form.lifecycleTitle')}</h3>
      <Steps size="small" current={[STATUS.DRAFT, STATUS.REVIEW, STATUS.APPROVED, STATUS.SCHEDULED, STATUS.LIVE].findIndex(status => status === record.status)}
        items={['草稿', '待審核', '已批准', '待生效', '實例確認'].map(label => ({ title: label }))} />
      <Descriptions className="sv2__release-meta" column={2} items={[
        { key: 'code', label: '代碼／詞庫／索引版本', children: '未接入，不可校驗兼容性' },
        { key: 'instances', label: '真實服務實例', children: '未接入，不代表 100% 已載入' },
      ]} />
      <Space wrap>{[STATUS.DRAFT, STATUS.REVIEW, STATUS.APPROVED].some(status => status === record.status) && <Button onClick={handleDemoReview}>{t('searchV2.form.demoNext')}</Button>}
        <Button disabled>{t('searchV2.form.publishOnline')}</Button><Button disabled>{t('searchV2.form.rollbackOnline')}</Button></Space>
    </section>}
    {readOnly && <footer className="sv2__updated"><span>{t('searchV2.form.updatedBy')}</span><span>{t('searchV2.form.updatedPrefix')}{updatedAt}</span></footer>}
  </div>
}
