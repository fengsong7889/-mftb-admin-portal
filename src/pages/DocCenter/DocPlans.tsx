import { useCallback, useState } from 'react'
import { Alert, Button, Empty, Form, Input, Select, Space, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DOC_NATIVE_VIEWS, docNativeDetailPath, fetchDocNativePage, formatDocNativeTime } from '@/api/docNative'
import type { DocNativeQuery, DocNativeView } from '@/api/docNative'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { useDocNativeLoad } from './useDocNativeLoad'

const INITIAL_QUERY: DocNativeQuery = { keyword: '', view: 'effective', page: 1, size: 20 }

export default function DocPlans() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form] = Form.useForm<Pick<DocNativeQuery, 'keyword' | 'view'>>()
  const [query, setQuery] = useState(INITIAL_QUERY)
  const load = useCallback(() => fetchDocNativePage(query), [query])
  const { data, loading, failed, retry } = useDocNativeLoad(load)
  const columns: ColumnsType<DocNativeView> = [
    { key: 'number', title: t('docNative.number'), render: (_, row) => row.document.documentNo },
    { key: 'title', title: t('docNative.title'), render: (_, row) => row.revision.title },
    { key: 'space', title: t('docNative.space'), render: (_, row) => row.document.spaceName || '—' },
    { key: 'owner', title: t('docNative.owner'), render: (_, row) => row.document.ownerName || '—' },
    { key: 'version', title: t('docNative.version'), render: (_, row) => <Space size={4} wrap>
      <span>v{row.revision.revisionNo}</span>
      {row.revision.id === row.document.effectiveRevisionId && <Tag color="green">{t('docNative.effective')}</Tag>}
      {row.revision.id === row.document.draftRevisionId && <Tag color="orange">{t('docNative.draft')}</Tag>}
      {row.document.deletedAt && <Tag color="red">{t('docNative.inTrash')}</Tag>}
    </Space> },
    { key: 'execution', title: t('docNative.executionStatus'), render: (_, row) => t(`docNative.exec.${row.document.executionStatus}`) },
    { key: 'updatedAt', title: t('docNative.lastUpdatedAt'), render: (_, row) => formatDocNativeTime(row.document.updatedAt) },
    { key: 'action', title: t('docNative.action'), render: (_, row) => {
      const actions = row.allowedActions ?? []
      const revisionId = row.revision.id
      const canEdit = actions.includes('edit')
      const canConfirm = actions.includes('confirm-request') || actions.includes('confirm-decision')
      const canHandoff = actions.includes('handoff')
        && (row.document.adoptedRevisionId != null || row.document.effectiveRevisionId != null)
      return <Space size={0} split={<span className="action-split">|</span>}>
        <Button type="link" size="small"
          onClick={() => navigate(docNativeDetailPath(row.document.nodeId, revisionId))}>{t('docNative.readVersion')}</Button>
        {canEdit && <Button type="link" size="small"
          onClick={() => navigate(`/doc-plans/edit?id=${row.document.nodeId}`)}>{t('docNative.editAction')}</Button>}
        {canConfirm && <Button type="link" size="small"
          onClick={() => navigate(`/doc-plans/confirm?id=${row.document.nodeId}`)}>{t('docNative.confirmAction')}</Button>}
        {canHandoff && <Button type="link" size="small"
          onClick={() => navigate(`/doc-plans/handoff?id=${row.document.nodeId}`)}>{t('docNative.handoffAction')}</Button>}
      </Space>
    } },
  ]
  const { applyConfig, configComponent } = useColumnConfig('doc-plans', columns.map(col => ({ key: String(col.key), title: String(col.title) })), [
    { key: 'number', visible: true, locked: 'head' }, { key: 'action', visible: true, locked: 'tail' },
  ])
  const handleSearch = (values: Pick<DocNativeQuery, 'keyword' | 'view'>) => {
    setQuery(previous => ({ ...previous, keyword: values.keyword?.trim() ?? '', view: values.view, page: 1 }))
  }
  return <div className="content-area">
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('docNative.readOnlyNotice')} />
    {failed && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={t('docNative.unavailable')}
      description={t('docNative.unavailableHint')} action={<Button onClick={retry}>{t('docNative.retry')}</Button>} />}
    <div className="search-section">
      <Form form={form} layout="vertical" initialValues={INITIAL_QUERY} onFinish={handleSearch}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px 12px' }}>
        <Form.Item name="keyword" label={t('docNative.keyword')} rules={[{ max: 100 }]}>
          <Input maxLength={100} allowClear placeholder={t('docNative.keywordHint')} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="view" label={t('docNative.scope')}>
          <Select style={{ width: '100%' }} options={DOC_NATIVE_VIEWS.map(value => ({ value, label: t(`docNative.scopes.${value}`) }))} />
        </Form.Item>
        <div className="search-actions" style={{ paddingTop: 26 }}>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading}>{t('common.search')}</Button>
          <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setQuery({ ...INITIAL_QUERY }) }}>{t('common.reset')}</Button>
        </div>
      </Form>
    </div>
    <div className="action-section">
      <div className="action-section-left" />
      <div className="action-section-right">
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/doc-plans/edit')}>{t('docNative.createAction')}</Button>
        {configComponent}
      </div>
    </div>
    <Table<DocNativeView> rowKey={row => row.document.nodeId} loading={loading} dataSource={data?.records ?? []}
      columns={applyConfig(columns) as ColumnsType<DocNativeView>} scroll={{ x: 'max-content' }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(failed ? 'docNative.unavailable' : 'docNative.empty')} /> }}
      pagination={{ current: query.page, pageSize: query.size, total: data?.total ?? 0,
        showSizeChanger: true, showQuickJumper: true, pageSizeOptions: ['10', '20', '50', '100'],
        showTotal: count => t('common.total', { count }),
        onChange: (page, size) => setQuery(previous => ({ ...previous, page: size !== previous.size ? 1 : page, size })),
      }} />
  </div>
}
