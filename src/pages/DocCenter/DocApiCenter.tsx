/**
 * 接口管理：面向内部/合作方的接口文档。
 * 清單由代碼掃描生成草稿，人工補齊名稱、場景、鑒權、示例與錯誤碼後發佈。
 * 不保存請求內容或密鑰；示例僅作純文本展示。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Descriptions, Drawer, Empty, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ApiOutlined, CopyOutlined, EditOutlined, ReloadOutlined, SyncOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchDocApiCatalog, fetchDocApiCatalogSystems, scanDocApiCatalog, updateDocApiCatalog,
  type DocApiCatalogEntry, type DocApiCatalogSave, type DocApiCatalogSystem,
} from '@/api/docCatalog'
import { useAuth } from '@/contexts/AuthContext'
import { formatDocKnowledgeTime } from '@/api/docKnowledge'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

const METHOD_COLOR: Record<string, string> = {
  GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red', PATCH: 'purple',
  HEAD: 'default', OPTIONS: 'default',
}

const CODE_STYLE = {
  whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#fafafa',
  padding: 12, borderRadius: 8, fontSize: 12, margin: 0,
} as const

/** 按 baseUrl + path 拼出對外可複製的完整地址。 */
function endpointUrl(entry: DocApiCatalogEntry) {
  const base = (entry.baseUrl ?? '').trim().replace(/\/+$/, '')
  return base ? `${base}${entry.path}` : entry.path
}

/** 生成最小可用的 cURL；令牌只佔位，絕不寫入真實密鑰。 */
function curlSample(entry: DocApiCatalogEntry) {
  const lines = [`curl -X ${entry.method} '${endpointUrl(entry)}'`,
    "  -H 'Authorization: Bearer <access_token>'"]
  if (!['GET', 'HEAD', 'DELETE'].includes(entry.method)) lines.push("  -H 'Content-Type: application/json'")
  return lines.join(' \\\n')
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  }
}

function CodeBlock({ text }: { text?: string | null }) {
  return <pre style={CODE_STYLE}>{text?.trim() ? text : '—'}</pre>
}

function requestRows(entry: DocApiCatalogEntry | null) {
  try {
    const parsed = JSON.parse(entry?.requestSchema ?? '[]')
    return Array.isArray(parsed) ? parsed as {
      name?: string; type?: string; annotations?: string[];
      fields?: { name: string; type: string }[]
    }[] : []
  } catch {
    return []
  }
}

export default function DocApiCenter() {
  const { t } = useTranslation()
  const [systems, setSystems] = useState<DocApiCatalogSystem[]>([])
  const [systemCode, setSystemCode] = useState<string | undefined>()
  const [keyword, setKeyword] = useState('')
  const [rows, setRows] = useState<DocApiCatalogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState<DocApiCatalogEntry | null>(null)
  const [editing, setEditing] = useState<DocApiCatalogEntry | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<DocApiCatalogSave>()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('doc-api-center:edit')

  const loadSystems = useCallback(async () => {
    try {
      const list = await fetchDocApiCatalogSystems()
      setSystems(list)
    } catch {
      setSystems([])
    }
  }, [])

  const load = useCallback(async (targetPage = page) => {
    setLoading(true)
    try {
      const result = await fetchDocApiCatalog({ systemCode, keyword, page: targetPage, size })
      setRows(result.records)
      setTotal(result.total)
      setPage(result.page)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [systemCode, keyword, page, size, t])

  useEffect(() => { void loadSystems() }, [loadSystems])
  useEffect(() => { void load(1) }, [systemCode]) // eslint-disable-line react-hooks/exhaustive-deps

  const openEdit = (entry: DocApiCatalogEntry) => {
    setEditing(entry)
    form.setFieldsValue({
      apiName: entry.apiName ?? '', description: entry.description ?? '', scenario: entry.scenario ?? '',
      authType: entry.authType ?? 'JWT', authScope: entry.authScope ?? '',
      visibility: entry.visibility ?? 1, docStatus: entry.docStatus ?? 1, version: entry.version ?? 'v1',
      baseUrl: entry.baseUrl ?? '', requestExample: entry.requestExample ?? '',
      responseExample: entry.responseExample ?? '', errorCodes: entry.errorCodes ?? '',
      changelog: entry.changelog ?? '',
    })
  }

  const handleSave = async () => {
    if (!editing) return
    try {
      const values = await form.validateFields()
      setSaving(true)
      const updated = await updateDocApiCatalog(editing.id, values)
      setSelected(updated)
      setEditing(null)
      message.success(t('docKnowledge.apiDocSaved'))
      await load()
    } catch (error) {
      if (error instanceof Error) message.error(error.message)
    } finally {
      setSaving(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    try {
      const result = await scanDocApiCatalog()
      message.success(t('docKnowledge.apiCatalogScanned', { count: result.scanned ?? 0 }))
      await loadSystems()
      await load(1)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.apiCatalogScanFailed'))
    } finally {
      setScanning(false)
    }
  }

  const columns: ColumnsType<DocApiCatalogEntry> = [
    {
      title: t('docKnowledge.apiName'), dataIndex: 'apiName', ellipsis: true,
      render: (value: string | null | undefined, row) => (
        <div>
          <div style={{ fontWeight: 600 }}>{value || <span style={{ color: '#bfbfbf' }}>{t('docKnowledge.apiNameMissing')}</span>}</div>
          <span style={{ color: '#8c8c8c', fontSize: 12 }}>{row.method} {row.path}</span>
        </div>
      ),
    },
    {
      title: t('docKnowledge.apiScenario'), dataIndex: 'scenario', ellipsis: true,
      render: (value?: string | null) => value?.trim() || <span style={{ color: '#bfbfbf' }}>—</span>,
    },
    { title: t('docKnowledge.apiDocStatus'), dataIndex: 'docStatus', width: 100,
      render: (value: number) => <Tag color={value === 2 ? 'green' : value === 3 ? 'red' : 'default'}>{t(`docKnowledge.apiDocStatusValue.${value}`)}</Tag> },
    { title: t('docKnowledge.apiVisibility'), dataIndex: 'visibility', width: 100,
      render: (value: number) => <Tag>{t(`docKnowledge.apiVisibilityValue.${value}`)}</Tag> },
    { title: t('docKnowledge.apiDocVersion'), dataIndex: 'version', width: 80 },
    { title: t('docKnowledge.apiSyncedAt'), dataIndex: 'syncedAt', width: 170, render: (value: string | number) => formatDocKnowledgeTime(value) },
  ]

  const handleCopy = async (text: string) => {
    if (await copyText(text)) message.success(t('docKnowledge.apiCopied'))
    else message.error(t('docKnowledge.apiCopyFailed'))
  }

  const selectedParams = useMemo(() => requestRows(selected), [selected])
  const allEndpoints = useMemo(() => systems.reduce((sum, item) => sum + item.endpointCount, 0), [systems])

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.apiCenterTitle')} description={t('docKnowledge.apiCenterHint')} />
      <div style={{ ...docPlanCardStyle, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #f0f0f0', paddingRight: 12 }}>
          <DocPlanSectionTitle icon={<ApiOutlined />} title={t('docKnowledge.apiSystems')} />
          {systems.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.apiCatalogEmpty')} /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Button key="all" type={systemCode == null ? 'primary' : 'text'}
                onClick={() => { setSystemCode(undefined); setPage(1) }}
                style={{ justifyContent: 'space-between', textAlign: 'left' }}>
                <span>{t('docKnowledge.apiAllSystems')}</span>
                <span style={{ opacity: 0.7 }}>{allEndpoints}</span>
              </Button>
              {systems.map(item => (
                <Button key={item.systemCode} type={systemCode === item.systemCode ? 'primary' : 'text'}
                  onClick={() => { setSystemCode(item.systemCode); setPage(1) }}
                  style={{ justifyContent: 'space-between', textAlign: 'left' }}>
                  <span>{item.systemName}</span>
                  <span style={{ opacity: 0.7 }}>{item.endpointCount}</span>
                </Button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space wrap style={{ marginBottom: 12 }}>
            <Input.Search allowClear value={keyword} onChange={e => setKeyword(e.target.value)}
              onSearch={() => void load(1)} placeholder={t('docKnowledge.apiDocSearchPlaceholder')} style={{ width: 280 }} />
            <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('docKnowledge.reload')}</Button>
            <Button type="primary" icon={<SyncOutlined />} onClick={handleScan} loading={scanning}>
              {t('docKnowledge.apiCatalogScan')}
            </Button>
          </Space>
          <Table rowKey="id" size="small" dataSource={rows} columns={columns} loading={loading}
            scroll={{ x: 900 }} onRow={record => ({ onClick: () => setSelected(record), style: { cursor: 'pointer' } })}
            pagination={{
              current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
              showTotal: count => t('common.total', { count }),
              onChange: (nextPage, nextSize) => {
                setPage(nextSize !== size ? 1 : nextPage)
                setSize(nextSize)
                void load(nextSize !== size ? 1 : nextPage)
              },
            }}
            locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.apiCatalogEmpty')} /> }} />
        </div>
      </div>

      <Drawer open={!!selected} width={880} title={selected ? (selected.apiName || `${selected.method} ${selected.path}`) : ''}
        onClose={() => setSelected(null)} extra={selected && canEdit ? (
          <Button icon={<EditOutlined />} onClick={() => openEdit(selected)}>{t('docKnowledge.apiEditDoc')}</Button>
        ) : undefined}>
        {selected && (
          <>
            <Space wrap style={{ marginBottom: 12 }}>
              <Tag color={METHOD_COLOR[selected.method] ?? 'default'}>{selected.method}</Tag>
              <Typography.Text code>{selected.path}</Typography.Text>
              <Tag color={selected.docStatus === 2 ? 'green' : selected.docStatus === 3 ? 'red' : 'default'}>
                {t(`docKnowledge.apiDocStatusValue.${selected.docStatus}`)}
              </Tag>
              <Tag>{t(`docKnowledge.apiVisibilityValue.${selected.visibility}`)}</Tag>
            </Space>
            {!selected.apiName && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.apiDraftHint')} />}
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }} items={[
              { key: 'system', label: t('docKnowledge.apiSystemName'), children: selected.systemName },
              { key: 'version', label: t('docKnowledge.apiDocVersion'), children: selected.version || 'v1' },
              { key: 'auth', label: t('docKnowledge.apiAuth'), children: selected.authType || 'JWT' },
              { key: 'scope', label: t('docKnowledge.apiAuthScope'), children: selected.authScope || '—' },
              {
                key: 'address', label: t('docKnowledge.apiAddress'), span: 2,
                children: (
                  <Space>
                    <Typography.Text code>{endpointUrl(selected)}</Typography.Text>
                    <Tooltip title={t('docKnowledge.apiCopy')}>
                      <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => void handleCopy(endpointUrl(selected))} />
                    </Tooltip>
                  </Space>
                ),
              },
              { key: 'handler', label: t('docKnowledge.apiHandler'), children: selected.handler, span: 2 },
              { key: 'synced', label: t('docKnowledge.apiSyncedAt'), children: formatDocKnowledgeTime(selected.syncedAt), span: 2 },
            ]} />
            <Typography.Title level={5}>{t('docKnowledge.apiDescription')}</Typography.Title>
            <Typography.Paragraph>{selected.description || t('docKnowledge.apiNoDescription')}</Typography.Paragraph>
            <Typography.Title level={5}>{t('docKnowledge.apiScenario')}</Typography.Title>
            <Typography.Paragraph>{selected.scenario || t('docKnowledge.apiNoScenario')}</Typography.Paragraph>
            <Typography.Title level={5}>{t('docKnowledge.apiRequest')}</Typography.Title>
            <Table rowKey={(_, index) => String(index)} size="small" pagination={false} dataSource={selectedParams}
              locale={{ emptyText: t('docKnowledge.apiNoRequest') }}
              columns={[
                { title: t('docKnowledge.apiParamName'), dataIndex: 'name', width: 160 },
                {
                  title: t('docKnowledge.apiParamType'), dataIndex: 'type', ellipsis: true,
                  render: (value: string, row: { fields?: { name: string; type: string }[] }) => (
                    <div>
                      <span>{value}</span>
                      {row.fields?.length ? (
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {row.fields.map(field => <Tag key={field.name}>{field.name}: {field.type}</Tag>)}
                        </div>
                      ) : null}
                    </div>
                  ),
                },
                { title: t('docKnowledge.apiParamAnnotation'), dataIndex: 'annotations', width: 160, render: (value?: string[]) => (value ?? []).map(item => <Tag key={item}>{item}</Tag>) },
              ]} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
              <Typography.Title level={5} style={{ margin: 0 }}>{t('docKnowledge.apiRequestExample')}</Typography.Title>
              <Button size="small" icon={<CopyOutlined />} onClick={() => void handleCopy(curlSample(selected))}>
                {t('docKnowledge.apiCopyCurl')}
              </Button>
            </div>
            <CodeBlock text={selected.requestExample || curlSample(selected)} />
            <Typography.Title level={5} style={{ marginTop: 20 }}>{t('docKnowledge.apiResponse')}</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {t('docKnowledge.apiResponseType')}：{selected.responseSchema || '—'}
            </Typography.Paragraph>
            <CodeBlock text={selected.responseExample} />
            <Typography.Title level={5} style={{ marginTop: 20 }}>{t('docKnowledge.apiErrorCodes')}</Typography.Title>
            <CodeBlock text={selected.errorCodes} />
            <Typography.Title level={5} style={{ marginTop: 20 }}>{t('docKnowledge.apiChangelog')}</Typography.Title>
            <CodeBlock text={selected.changelog} />
          </>
        )}
      </Drawer>

      <Modal open={!!editing} title={t('docKnowledge.apiEditDoc')} width={920} onCancel={() => setEditing(null)}
        onOk={handleSave} confirmLoading={saving} okText={t('docKnowledge.apiSaveDoc')} cancelText={t('docKnowledge.cancel')}>
        <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('docKnowledge.apiPublishHint')} />
        <Form form={form} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="apiName" label={t('docKnowledge.apiName')} dependencies={['docStatus']} rules={[
              { max: 200 },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (getFieldValue('docStatus') === 2 && !String(value ?? '').trim()) {
                    return Promise.reject(new Error(t('docKnowledge.apiRequiredForPublish')))
                  }
                  return Promise.resolve()
                },
              }),
            ]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="version" label={t('docKnowledge.apiDocVersion')}><Input maxLength={32} /></Form.Item>
          </div>
          <Form.Item name="description" label={t('docKnowledge.apiDescription')}><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
          <Form.Item name="scenario" label={t('docKnowledge.apiScenario')}><Input.TextArea rows={3} maxLength={2000} /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="authType" label={t('docKnowledge.apiAuth')}><Input maxLength={32} /></Form.Item>
            <Form.Item name="authScope" label={t('docKnowledge.apiAuthScope')}><Input maxLength={500} /></Form.Item>
            <Form.Item name="baseUrl" label={t('docKnowledge.apiBaseUrl')}><Input maxLength={255} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="visibility" label={t('docKnowledge.apiVisibility')}>
              <Select options={[{ value: 1, label: t('docKnowledge.apiVisibilityValue.1') }, { value: 2, label: t('docKnowledge.apiVisibilityValue.2') }, { value: 3, label: t('docKnowledge.apiVisibilityValue.3') }]} />
            </Form.Item>
            <Form.Item name="docStatus" label={t('docKnowledge.apiDocStatus')}>
              <Select options={[{ value: 1, label: t('docKnowledge.apiDocStatusValue.1') }, { value: 2, label: t('docKnowledge.apiDocStatusValue.2') }, { value: 3, label: t('docKnowledge.apiDocStatusValue.3') }]} />
            </Form.Item>
          </div>
          <Form.Item name="requestExample" label={t('docKnowledge.apiRequestExample')}><Input.TextArea rows={4} maxLength={20000} /></Form.Item>
          <Form.Item name="responseExample" label={t('docKnowledge.apiResponseExample')}><Input.TextArea rows={4} maxLength={20000} /></Form.Item>
          <Form.Item name="errorCodes" label={t('docKnowledge.apiErrorCodes')}><Input.TextArea rows={3} maxLength={10000} /></Form.Item>
          <Form.Item name="changelog" label={t('docKnowledge.apiChangelog')}><Input.TextArea rows={3} maxLength={10000} /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
