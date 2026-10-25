import { useCallback, useState } from 'react'
import { Alert, Button, Descriptions, Input, Modal, Result, Select, Space, Spin, Table, Tag, message } from 'antd'
import { DownloadOutlined, FileTextOutlined, HistoryOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DetailPageHeader from '@/components/DetailPageHeader'
import {
  buildDocNativeManifest, exportDocNativeVersion, fetchDocNativeAudit, fetchDocNativeView, formatDocNativeTime,
  isDocNativeConflict, parseDocNativeLink, restoreDocNativeDocument, trashDocNativeDocument,
} from '@/api/docNative'
import type { DocNativeAuditEvent } from '@/api/docNative'
import { useDocNativeLoad } from './useDocNativeLoad'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

export default function DocPlanDetail() {
  const { t } = useTranslation()
  const { search } = useLocation()
  const navigate = useNavigate()
  const target = parseDocNativeLink(search)
  const [busy, setBusy] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [audit, setAudit] = useState<DocNativeAuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const id = target?.id
  // 版本只以 URL 为准：页签可分享、可前进后退，切换版本不依赖组件残留状态
  const revisionId = target?.revisionId

  const load = useCallback(() => {
    if (id === undefined) return Promise.reject(new Error('invalid'))
    return fetchDocNativeView(id, revisionId)
  }, [id, revisionId])
  const { data, loading, failed, retry } = useDocNativeLoad(load)

  const openAudit = () => {
    if (id === undefined) return
    setAuditOpen(true); setAuditLoading(true)
    void fetchDocNativeAudit(id).then(rows => setAudit(rows)).catch(() => setAudit([]))
      .finally(() => setAuditLoading(false))
  }

  const handleExport = async () => {
    if (!data || id === undefined) return
    setBusy(true)
    try {
      const blob = await exportDocNativeVersion(id, data.revision.id)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${data.document.documentNo}-v${data.revision.revisionNo}.md`
      anchor.click()
      URL.revokeObjectURL(url)
      message.success(t('docNative.exportSuccess'))
    } finally {
      setBusy(false)
    }
  }

  const handleExportManifest = () => {
    if (!data) return
    const manifest = buildDocNativeManifest(data)
    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${data.document.documentNo}-manifest.json`
    anchor.click()
    URL.revokeObjectURL(url)
    message.success(t('docNative.exportManifestSuccess'))
  }

  const handleTrash = () => {
    if (!data || id === undefined) return
    let reason = ''
    Modal.confirm({
      title: t('docNative.trashTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div>
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('docNative.number')}：</span><b>{data.document.documentNo}</b></div>
          <div className="confirm-info-row"><span>{t('docNative.version')}：</span><b>v{data.revision.revisionNo}</b></div>
        </div>
        <Input.TextArea rows={3} maxLength={200} showCount style={{ marginTop: 12 }}
          placeholder={t('docNative.trashReason')} onChange={event => { reason = event.target.value }} />
      </div>,
      okText: t('docNative.trashAction'),
      okButtonProps: { danger: true },
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        if (!reason.trim()) { message.warning(t('docNative.trashReasonRequired')); return Promise.reject() }
        setBusy(true)
        try {
          await trashDocNativeDocument(id, { expectedVersion: data.document.version, reason: reason.trim() })
          message.success(t('docNative.trashSuccess'))
          navigate('/doc-plans')
        } catch (error) {
          if (isDocNativeConflict(error)) retry()
          throw error
        } finally {
          setBusy(false)
        }
      },
    })
  }

  const handleRestore = () => {
    if (!data || id === undefined) return
    Modal.confirm({
      title: t('docNative.restoreTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: <div className="confirm-info-card">
        <div className="confirm-info-row"><span>{t('docNative.number')}：</span><b>{data.document.documentNo}</b></div>
        <div className="confirm-info-row"><span>{t('docNative.version')}：</span><b>v{data.revision.revisionNo}</b></div>
      </div>,
      okText: t('docNative.restoreAction'),
      cancelText: t('docNative.cancel'),
      onOk: async () => {
        setBusy(true)
        try {
          await restoreDocNativeDocument(id, { expectedVersion: data.document.version })
          message.success(t('docNative.restoreSuccess'))
          retry()
        } catch (error) {
          if (isDocNativeConflict(error)) retry()
          throw error
        } finally {
          setBusy(false)
        }
      },
    })
  }

  if (!target) return <div className="content-area">
    <DetailPageHeader title={t('docNative.detailTitle')} onBack={() => navigate('/doc-plans')} />
    <Result status="warning" title={t('docNative.invalidLink')} subTitle={t('docNative.invalidLinkHint')} />
  </div>
  if (loading) return <div className="content-area">
    <DetailPageHeader title={t('docNative.detailTitle')} onBack={() => navigate('/doc-plans')} />
    <div style={{ minHeight: 400, display: 'grid', placeItems: 'center' }} role="status"><Spin size="large" aria-label={t('common.loading')} /></div>
  </div>
  if (failed || !data) return <div className="content-area">
    <DetailPageHeader title={t('docNative.detailTitle')} onBack={() => navigate('/doc-plans')} />
    <Result status="error" title={t('docNative.unavailable')} subTitle={t('docNative.unavailableHint')}
      extra={<Button onClick={retry}>{t('docNative.retry')}</Button>} />
  </div>

  const { document: doc, revision } = data
  const actions = data.allowedActions ?? []
  const isDeleted = !!doc.deletedAt
  return <div className="content-area">
    <DetailPageHeader title={t('docNative.detailTitle')} onBack={() => navigate('/doc-plans')}
      onEdit={actions.includes('edit') && !isDeleted ? () => navigate(`/doc-plans/edit?id=${doc.nodeId}`) : undefined}
      menuKey="doc-plans"
      meta={<>{doc.documentNo} · v{revision.revisionNo}</>} />
    {isDeleted && <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t('docNative.inTrash')}
      description={doc.deletionReason || undefined} />}
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<FileTextOutlined />} title={t('docNative.currentState')}
        extra={<Space wrap>
          {revision.id === doc.effectiveRevisionId && <Tag color="green">{t('docNative.effective')}</Tag>}
          {revision.id === doc.draftRevisionId && <Tag color="orange">{t('docNative.draft')}</Tag>}
          {revision.id === doc.adoptedRevisionId && <Tag color="purple">{t('docNative.adopted')}</Tag>}
          {!isDeleted && (actions.includes('confirm-request') || actions.includes('confirm-decision')) &&
            <Button size="small" onClick={() => navigate(`/doc-plans/confirm?id=${doc.nodeId}`)}>{t('docNative.confirmAction')}</Button>}
          {!isDeleted && actions.includes('handoff') && (doc.adoptedRevisionId != null || doc.effectiveRevisionId != null) &&
            <Button size="small" onClick={() => navigate(`/doc-plans/handoff?id=${doc.nodeId}`)}>{t('docNative.handoffAction')}</Button>}
          {!isDeleted && actions.includes('execution') && (doc.adoptedRevisionId != null || doc.effectiveRevisionId != null) &&
            <Button size="small" onClick={() => navigate(`/doc-plans/execution?id=${doc.nodeId}`)}>{t('docNative.executionTitle')}</Button>}
          {!isDeleted && actions.includes('acl') &&
            <Button size="small" onClick={() => navigate(`/doc-plans/acl?id=${doc.nodeId}`)}>{t('docNative.aclTitle')}</Button>}
          <Button size="small" icon={<HistoryOutlined />} onClick={openAudit}>{t('docNative.auditTitle')}</Button>
          <Button size="small" icon={<DownloadOutlined />} loading={busy} onClick={handleExport}>{t('docNative.exportVersion')}</Button>
          <Button size="small" icon={<DownloadOutlined />} onClick={handleExportManifest}>{t('docNative.exportManifest')}</Button>
          {!isDeleted && actions.includes('trash') &&
            <Button size="small" danger loading={busy} onClick={handleTrash}>{t('docNative.trashAction')}</Button>}
          {isDeleted && actions.includes('restore') &&
            <Button size="small" loading={busy} onClick={handleRestore}>{t('docNative.restoreAction')}</Button>}
        </Space>} />
      <Space wrap style={{ marginBottom: 16 }}>
        <strong>{revision.title}</strong>
        <Tag>{doc.documentNo} · v{revision.revisionNo}</Tag>
        {doc.restricted && <Tag color="red">{t('docNative.restricted')}</Tag>}
      </Space>
      <Descriptions column={4} size="middle" items={[
        { key: 'space', label: t('docNative.space'), children: doc.spaceName || '—' },
        { key: 'owner', label: t('docNative.owner'), children: doc.ownerName || '—' },
        { key: 'system', label: t('docNative.system'), children: revision.systemCode || '—' },
        { key: 'menu', label: t('docNative.menu'), children: revision.menuKey || '—' },
        { key: 'revision', label: t('docNative.revisionId'), children: revision.id },
        { key: 'time', label: t('docNative.savedAt'), children: formatDocNativeTime(revision.createdAt) },
        { key: 'hash', label: 'SHA-256', span: 2, children: <span style={{ overflowWrap: 'anywhere' }}>{revision.contentHash}</span> },
        { key: 'summary', label: t('docNative.summary'), span: 4, children: revision.summary || '—' },
        { key: 'history', label: t('docNative.versionSelector'), span: 4, children: <Space wrap>
          <Select style={{ minWidth: 260 }} value={revision.id}
            onChange={value => navigate(`/doc-plans/detail?id=${doc.nodeId}&revision=${value}`, { replace: true })}
            options={(data.revisions ?? []).map(item => ({
              value: item.id,
              label: `v${item.revisionNo} · ${item.title}${item.id === doc.effectiveRevisionId ? ` · ${t('docNative.effective')}` : ''}`,
            }))} />
          {target.revisionId !== undefined &&
            <Button size="small" onClick={() => navigate(`/doc-plans/detail?id=${doc.nodeId}`, { replace: true })}>
              {t('docNative.backToCurrent')}
            </Button>}
        </Space> },
      ]} />
    </div>
    <div style={docPlanCardStyle}>
      <DocPlanSectionTitle icon={<FileTextOutlined />} title={t('docNative.sourceTitle')} />
      {/* 本批提供精确原文核验，不执行 HTML，不加载正文中的远程图片或链接。 */}
      <pre aria-label={t('docNative.sourceTitle')} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>{revision.markdown}</pre>
    </div>
    <div style={{ background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 24, color: '#8C8C8C', fontSize: 12 }}>
      {/* DTO 尚无文档最后更新人，不能拿负责人或旧版本作者伪充。 */}
      <span>{t('docNative.lastUpdatedBy')}：—</span>
      <span>{t('docNative.lastUpdatedAt')}：{formatDocNativeTime(doc.updatedAt)}</span>
    </div>
    <Modal open={auditOpen} title={t('docNative.auditTitle')} footer={<Button onClick={() => setAuditOpen(false)}>{t('docNative.close')}</Button>}
      onCancel={() => setAuditOpen(false)} width={760} destroyOnHidden>
      <Table<DocNativeAuditEvent> rowKey="id" size="small" loading={auditLoading} dataSource={audit} pagination={false}
        scroll={{ y: 360 }}
        locale={{ emptyText: t('docNative.auditEmpty') }}
        columns={[
          { key: 'action', title: t('docNative.auditAction'), dataIndex: 'action' },
          { key: 'revision', title: t('docNative.revisionId'), render: (_, row) => row.revisionId ?? '—' },
          { key: 'detail', title: t('docNative.auditDetail'), render: (_, row) => row.detail || '—' },
          { key: 'time', title: t('docNative.auditTime'), render: (_, row) => formatDocNativeTime(row.createdAt) },
        ]} />
    </Modal>
  </div>
}
