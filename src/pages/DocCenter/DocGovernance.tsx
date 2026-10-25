import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { AppstoreAddOutlined, KeyOutlined, PlusOutlined, ReloadOutlined, SafetyCertificateOutlined, TeamOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DOC_NATIVE_PERMISSION, createDocNativeSpace, fetchDocNativeGrants, fetchDocNativeSpaces,
  formatDocNativeTime, issueDocNativeGrant, revokeDocNativeGrant,
} from '@/api/docNative'
import type { DocNativeGrant, DocNativeGrantCreated, DocNativeSpace } from '@/api/docNative'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

interface CreateValues { name: string; description?: string }
interface GrantValues { spaceId: number; name: string; canWrite: boolean; days: number }

/** 原生空间与集成凭据治理；备份与审计导出仍待后端接口。 */
export default function DocGovernance() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [spaceForm] = Form.useForm<CreateValues>()
  const [grantForm] = Form.useForm<GrantValues>()
  const [spaces, setSpaces] = useState<DocNativeSpace[]>([])
  const [grants, setGrants] = useState<DocNativeGrant[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [granting, setGranting] = useState(false)
  const [tokenInfo, setTokenInfo] = useState<DocNativeGrantCreated>()

  const load = useCallback(() => {
    setLoading(true); setFailed(false)
    void Promise.all([fetchDocNativeSpaces(), fetchDocNativeGrants()])
      .then(([spaceRows, grantRows]) => { setSpaces(spaceRows); setGrants(grantRows) })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    let values: CreateValues
    try { values = await spaceForm.validateFields() } catch { return }
    setCreating(true)
    try {
      await createDocNativeSpace({ name: values.name.trim(), description: values.description?.trim() || undefined })
      message.success(t('docNative.spaceCreated'))
      spaceForm.resetFields()
      load()
    } finally {
      setCreating(false)
    }
  }

  const handleIssue = async () => {
    let values: GrantValues
    try { values = await grantForm.validateFields() } catch { return }
    const space = spaces.find(item => item.id === values.spaceId)
    Modal.confirm({
      title: t('docNative.grantIssueConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.grantSpace')}：</span><b>{space?.name ?? '—'}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.grantCanWrite')}：</span><b>{values.canWrite ? t('docNative.yes') : t('docNative.no')}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.grantDays')}：</span><b>{values.days}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.grantPlainOnce')}</span></div>
      </div>,
      okText: t('docNative.grantIssue'),
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        setGranting(true)
        try {
          const created = await issueDocNativeGrant({
            spaceId: values.spaceId, name: values.name.trim(), canWrite: values.canWrite, days: values.days,
          })
          setTokenInfo(created)
          grantForm.resetFields()
          load()
        } finally {
          setGranting(false)
        }
      },
    })
  }

  const handleRevoke = (grant: DocNativeGrant) => {
    Modal.confirm({
      title: t('docNative.grantRevokeConfirm'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.grantName')}：</span><b>{grant.name}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.grantRevokeHint')}</span></div>
      </div>,
      okText: t('docNative.grantRevoke'),
      okButtonProps: { danger: true },
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        await revokeDocNativeGrant(grant.id)
        message.success(t('docNative.grantRevokeSuccess'))
        load()
      },
    })
  }

  const spaceName = (spaceId: number) => spaces.find(space => space.id === spaceId)?.name ?? `#${spaceId}`
  const grantStatus = (grant: DocNativeGrant) => {
    if (grant.revokedAt) return { text: t('docNative.grantStatusRevoked'), color: 'red' as const }
    const expires = grant.expiresAt
    if (expires !== undefined && expires !== null && new Date(expires).getTime() < Date.now()) {
      return { text: t('docNative.grantStatusExpired'), color: 'default' as const }
    }
    return { text: t('docNative.grantStatusActive'), color: 'green' as const }
  }

  const spaceColumns: ColumnsType<DocNativeSpace> = [
    { key: 'name', title: t('docNative.spaceName'), dataIndex: 'name' },
    { key: 'description', title: t('docNative.spaceDesc'), render: (_, row) => row.description || '—' },
    { key: 'permissions', title: t('docNative.permissions'), render: (_, row) => <Space size={4} wrap>
      {(row.permissions & DOC_NATIVE_PERMISSION.MANAGE) !== 0 && <Tag color="purple">{t('docNative.perm15')}</Tag>}
      {(row.permissions & DOC_NATIVE_PERMISSION.EDIT) !== 0 && (row.permissions & DOC_NATIVE_PERMISSION.MANAGE) === 0 && <Tag color="blue">{t('docNative.permEdit')}</Tag>}
      {(row.permissions & DOC_NATIVE_PERMISSION.EDIT) === 0 && <Tag>{t('docNative.permRead')}</Tag>}
    </Space> },
    { key: 'action', title: t('docNative.action'), render: (_, row) => <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" icon={<TeamOutlined />}
        onClick={() => navigate(`/doc-governance/members?spaceId=${row.id}`)}>{t('docNative.members')}</Button>
    </Space> },
  ]

  const grantColumns: ColumnsType<DocNativeGrant> = [
    { key: 'name', title: t('docNative.grantName'), dataIndex: 'name' },
    { key: 'space', title: t('docNative.grantSpace'), render: (_, row) => spaceName(row.spaceId) },
    { key: 'canWrite', title: t('docNative.grantCanWrite'), render: (_, row) => row.canWrite
      ? <Tag color="orange">{t('docNative.yes')}</Tag> : <Tag>{t('docNative.no')}</Tag> },
    { key: 'expiresAt', title: t('docNative.grantExpiresAt'), render: (_, row) => formatDocNativeTime(row.expiresAt) },
    { key: 'status', title: t('docNative.grantStatus'), render: (_, row) => {
      const status = grantStatus(row)
      return <Tag color={status.color}>{status.text}</Tag>
    } },
    { key: 'action', title: t('docNative.action'), render: (_, row) => <Space size={0} split={<span className="action-split">|</span>}>
      <Button type="link" size="small" danger disabled={!!row.revokedAt} onClick={() => handleRevoke(row)}>{t('docNative.grantRevoke')}</Button>
    </Space> },
  ]

  return <div className="content-area">
    <Alert type="info" showIcon style={{ marginBottom: 16 }} message={t('docNative.governanceScope')}
      description={t('docNative.governanceScopeHint')}
      action={<Space>
        <Button size="small" icon={<AppstoreAddOutlined />}
          onClick={() => navigate('/doc-governance/taxonomy')}>{t('docKnowledge.taxonomyTitle')}</Button>
        <Button size="small" icon={<SafetyCertificateOutlined />}
          onClick={() => navigate('/doc-governance/clearance')}>{t('docKnowledge.clearanceTitle')}</Button>
      </Space>} />
    {failed && <Alert type="error" showIcon style={{ marginBottom: 16 }} message={t('docNative.unavailable')}
      description={t('docNative.unavailableHint')} action={<Button onClick={load}>{t('docNative.retry')}</Button>} />}
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<AppstoreAddOutlined />} title={t('docNative.createSpaceSection')} />
      <Form form={spaceForm} layout="vertical" onFinish={handleCreate}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <Form.Item name="name" label={t('docNative.spaceName')} rules={[{ required: true, whitespace: true, max: 64 }]}>
          <Input maxLength={64} placeholder={t('docNative.spaceNamePlaceholder')} />
        </Form.Item>
        <Form.Item name="description" label={t('docNative.spaceDesc')} rules={[{ max: 255 }]}>
          <Input maxLength={255} placeholder={t('docNative.spaceDescPlaceholder')} />
        </Form.Item>
        <div style={{ paddingTop: 26 }}>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={creating}>{t('docNative.createSpace')}</Button>
          <Button icon={<ReloadOutlined />} style={{ marginLeft: 8 }} onClick={load}>{t('docNative.reload')}</Button>
        </div>
      </Form>
    </div>
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<TeamOutlined />} title={t('docNative.spaceList')} />
      <Table<DocNativeSpace> rowKey="id" size="middle" loading={loading} dataSource={spaces} columns={spaceColumns}
        scroll={{ x: 'max-content' }} pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docNative.noSpaces')} /> }} />
    </div>
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<KeyOutlined />} title={t('docNative.grantSection')} />
      <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 16 }}>{t('docNative.grantSectionHint')}</div>
      <Form form={grantForm} layout="vertical" onFinish={handleIssue} initialValues={{ days: 7, canWrite: false }}
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Form.Item name="spaceId" label={t('docNative.grantSpace')} rules={[{ required: true, message: t('docNative.spaceRequired') }]}>
          <Select style={{ width: '100%' }} placeholder={t('docNative.grantSpacePlaceholder')}
            options={spaces.map(space => ({ value: space.id, label: space.name }))} />
        </Form.Item>
        <Form.Item name="name" label={t('docNative.grantName')} rules={[{ required: true, whitespace: true, max: 64 }]}>
          <Input maxLength={64} placeholder={t('docNative.grantNamePlaceholder')} />
        </Form.Item>
        <Form.Item name="canWrite" label={t('docNative.grantCanWrite')} valuePropName="checked">
          <Switch checkedChildren={t('docNative.yes')} unCheckedChildren={t('docNative.no')} />
        </Form.Item>
        <Form.Item name="days" label={t('docNative.grantDays')} rules={[{ required: true, message: t('docNative.grantDaysRequired') }]}>
          <InputNumber min={1} max={30} style={{ width: '100%' }} />
        </Form.Item>
        <div style={{ gridColumn: '1 / -1' }}>
          <Button type="primary" icon={<KeyOutlined />} htmlType="submit" loading={granting}>{t('docNative.grantIssue')}</Button>
        </div>
      </Form>
    </div>
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<KeyOutlined />} title={t('docNative.grantList')} />
      <Table<DocNativeGrant> rowKey="id" size="middle" loading={loading} dataSource={grants} columns={grantColumns}
        scroll={{ x: 'max-content' }} pagination={false}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docNative.grantEmpty')} /> }} />
    </div>
    <Modal open={!!tokenInfo} title={t('docNative.grantTokenTitle')} onCancel={() => setTokenInfo(undefined)}
      footer={<Button type="primary" onClick={() => setTokenInfo(undefined)}>{t('docNative.close')}</Button>} width={640}>
      <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('docNative.grantTokenWarning')} />
      <Input readOnly value={tokenInfo?.token} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
      <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
        {t('docNative.grantTokenHint')}：{formatDocNativeTime(tokenInfo?.expiresAt)}
      </div>
    </Modal>
  </div>
}
