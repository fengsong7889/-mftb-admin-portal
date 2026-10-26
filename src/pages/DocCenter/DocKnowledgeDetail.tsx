/**
 * 知识库文档详情（P0）：元数据 + Markdown/PDF 预览 + 版本历史 + ACL。
 *
 * 安全：
 * - 预览不走裸 <iframe src="/api/...">（iframe 不带 JWT），而是 axios 取 Blob 后生成 object URL；
 * - 下载按钮只在后端 allowedActions 含 download 时渲染，服务端仍会二次校验；
 * - Office 在线转换未接入，页面明确提示下载查看，不伪造预览。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Alert, Button, DatePicker, Descriptions, Empty, Input, InputNumber, Modal, Progress, Select, Space, Spin, Switch, Table, Tag, Typography, message,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ApiOutlined, BarChartOutlined, DownloadOutlined, ExportOutlined, EyeOutlined, FileTextOutlined, LinkOutlined, LockOutlined,
  SafetyCertificateOutlined, StarFilled, StarOutlined, TeamOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import DetailPageHeader from '@/components/DetailPageHeader'
import AiRichText from '@/pages/Home/AiRichText'
import EmployeeSelect from '@/components/EmployeeSelect'
import { fetchDataAuthDepartmentOptions, fetchDataAuthRoleOptions } from '@/api/dataAuthorization'
import {
  DOC_CONFIDENTIALITY_COLOR, ackDoc, downloadDocAckReceipts, downloadDocAsset, fetchDocAckCoverage,
  fetchDocAckStatus, fetchDocAckTargets, fetchDocAssetBlob, fetchDocKnowledgeDetail, fetchDocOfficePreview,
  formatDocKnowledgeTime,
  saveDocAckTargets, saveDocKnowledgeAcl, type DocAckCoverage, type DocAckStatus, type DocAckTarget,
  type DocAclEntry, type DocAsset,
  type DocConfidentiality, type DocContentKind, type DocKnowledgeDetail, type DocKnowledgeRevision,
} from '@/api/docKnowledge'
import {
  deleteDocNote, fetchDocFavorites, fetchDocNotes, fetchDocReaderState, saveDocNote, saveDocReaderState,
  toggleDocFavorite, type DocNote,
} from '@/api/docReading'
import {
  ackDocApiChange, fetchDocApiSpec, fetchDocApiSpecs, importDocApiSpec,
  type DocApiSpec, type DocApiSpecView,
} from '@/api/docApi'
import { archiveDoc } from '@/api/docArchive'
import DocSectionCard from './DocSectionCard'
import '@/styles/components.css'

const KIND_KEY: Record<DocContentKind, string> = { 1: 'markdown', 2: 'pdf', 3: 'office', 4: 'link', 5: 'openapi' }
const CONFIDENTIALITY_KEY: Record<DocConfidentiality, string> = {
  1: 'public', 2: 'internal', 3: 'sensitive', 4: 'restricted',
}
const STATUS_KEY: Record<number, string> = {
  1: 'draft', 2: 'reviewing', 3: 'effective', 4: 'archived', 5: 'superseded', 6: 'pendingDisposal', 7: 'destroyed',
}
const STATUS_COLOR: Record<number, string> = {
  1: 'default', 2: 'processing', 3: 'success', 4: 'purple', 5: 'default', 6: 'warning', 7: 'error',
}

function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

function primaryAsset(assets: DocAsset[]): DocAsset | undefined {
  return assets.find(asset => asset.mime === 'application/pdf')
    ?? assets.find(asset => asset.mime.startsWith('image/'))
    ?? assets[0]
}

function parseTagsJson(value?: string | null): string[] {
  try {
    const parsed = JSON.parse(value ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export default function DocKnowledgeDetail() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { search } = useLocation()
  const params = useMemo(() => new URLSearchParams(search), [search])
  const nodeId = parseId(params.get('id'))
  const revisionId = parseId(params.get('revision'))

  const [detail, setDetail] = useState<DocKnowledgeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  const [officePreviewUrl, setOfficePreviewUrl] = useState<string | null>(null)
  const [officePreviewLoading, setOfficePreviewLoading] = useState(false)
  const [officePreviewError, setOfficePreviewError] = useState<string | null>(null)

  const [aclOpen, setAclOpen] = useState(false)
  const [aclDraft, setAclDraft] = useState<DocAclEntry[]>([])
  const [aclSaving, setAclSaving] = useState(false)
  const [deptOptions, setDeptOptions] = useState<{ value: number; label: string }[]>([])
  const [roleOptions, setRoleOptions] = useState<{ value: number; label: string }[]>([])
  const [newSubjectType, setNewSubjectType] = useState<'USER' | 'DEPT' | 'ROLE' | 'ALL'>('USER')
  const [newSubjectId, setNewSubjectId] = useState('')
  const [newSubjectName, setNewSubjectName] = useState('')
  const [newPermissions, setNewPermissions] = useState(1)

  const [ackStatus, setAckStatus] = useState<DocAckStatus | null>(null)
  const [ackOpen, setAckOpen] = useState(false)
  const [ackTargets, setAckTargets] = useState<DocAckTarget[]>([])
  const [ackSaving, setAckSaving] = useState(false)
  const [coverageOpen, setCoverageOpen] = useState(false)
  const [coverage, setCoverage] = useState<DocAckCoverage | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [favoriteLoading, setFavoriteLoading] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [notes, setNotes] = useState<DocNote[]>([])
  const [notesOpen, setNotesOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteVisibility, setNoteVisibility] = useState(1)
  const [noteSaving, setNoteSaving] = useState(false)
  const [apiOpen, setApiOpen] = useState(false)
  const [apiList, setApiList] = useState<DocApiSpec[]>([])
  const [apiView, setApiView] = useState<DocApiSpecView | null>(null)
  const [apiSystem, setApiSystem] = useState('doc')
  const [apiVersion, setApiVersion] = useState('1.0.0')
  const [apiRaw, setApiRaw] = useState('')
  const [apiLoading, setApiLoading] = useState(false)
  const [apiSaving, setApiSaving] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [archiveYears, setArchiveYears] = useState(10)
  const [archiveStart, setArchiveStart] = useState(dayjs().format('YYYY-MM-DD'))
  const [archiveHold, setArchiveHold] = useState(false)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const lastSavedPercent = useRef(0)
  const lastSavedAt = useRef(0)
  const [ackType, setAckType] = useState<'DEPT' | 'ROLE' | 'ALL'>('DEPT')
  const [ackSubjectId, setAckSubjectId] = useState('')
  const [ackSubjectName, setAckSubjectName] = useState('')
  const [ackDueAt, setAckDueAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!nodeId) {
      setLoading(false)
      setFailed(t('docKnowledge.missingId'))
      return
    }
    setLoading(true)
    setFailed(null)
    try {
      const [data, status, noteRows, favoriteRows] = await Promise.all([
        fetchDocKnowledgeDetail(nodeId, revisionId),
        fetchDocAckStatus(nodeId).catch(() => null),
        fetchDocNotes(nodeId).catch(() => []),
        fetchDocFavorites().catch(() => []),
      ])
      setDetail(data)
      setAckStatus(status)
      setNotes(noteRows)
      setFavorite(favoriteRows.some(item => item.nodeId === nodeId))
    } catch (error) {
      setDetail(null)
      setFailed(error instanceof Error ? error.message : t('docKnowledge.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [nodeId, revisionId, t])

  useEffect(() => { void load() }, [load])

  const asset = detail ? primaryAsset(detail.assets) : undefined
  const kind = detail?.document.contentKind

  useEffect(() => {
    if (!detail || !nodeId || detail.document.contentKind !== 1) return
    let cancelled = false
    fetchDocReaderState(nodeId)
      .then(state => { if (!cancelled) lastSavedPercent.current = state.percent || 0 })
      .catch(() => { /* 进度读取失败不阻塞阅读 */ })
    const onScroll = () => {
      const root = window.document.documentElement
      const max = root.scrollHeight - root.clientHeight
      if (max <= 0) return
      const percent = Math.min(100, Math.round((window.scrollY / max) * 10000) / 100)
      if (percent <= lastSavedPercent.current) return
      const now = Date.now()
      if (now - lastSavedAt.current < 5000) return
      lastSavedAt.current = now
      lastSavedPercent.current = percent
      void saveDocReaderState(nodeId, { revisionId: detail.revision.id, percent }).catch(() => { /* 静默 */ })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelled = true
      window.removeEventListener('scroll', onScroll)
    }
  }, [detail?.document.nodeId, detail?.document.contentKind, detail?.revision.id, nodeId])

  useEffect(() => {
    if (!detail || !asset || kind !== 3 || !nodeId) {
      setOfficePreviewUrl(null)
      setOfficePreviewError(null)
      return
    }
    let cancelled = false
    let objectUrl: string | null = null
    setOfficePreviewLoading(true)
    setOfficePreviewError(null)
    fetchDocOfficePreview(asset.id, nodeId)
      .then(blob => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setOfficePreviewUrl(objectUrl)
      })
      .catch(error => {
        if (!cancelled) setOfficePreviewError(error instanceof Error ? error.message : t('docKnowledge.officePreviewFailed'))
      })
      .finally(() => { if (!cancelled) setOfficePreviewLoading(false) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [detail, asset, kind, nodeId, t])

  const loadAclOptions = useCallback(() => {
    fetchDataAuthDepartmentOptions()
      .then(rows => setDeptOptions(rows.map(row => ({ value: row.id, label: row.name }))))
      .catch(() => setDeptOptions([]))
    fetchDataAuthRoleOptions()
      .then(rows => setRoleOptions(rows.map(row => ({ value: row.id, label: row.name }))))
      .catch(() => setRoleOptions([]))
  }, [])

  const openAcl = () => {
    if (!detail) return
    setAclDraft(detail.acl.map(entry => ({ ...entry })))
    setNewSubjectType('USER')
    setNewSubjectId('')
    setNewSubjectName('')
    setNewPermissions(1)
    setAclOpen(true)
    loadAclOptions()
  }

  const handleAddAcl = () => {
    if (!detail) return
    if (newSubjectType === 'ALL') {
      if (detail.document.confidentiality >= 3) {
        message.warning(t('docKnowledge.aclAllDenied'))
        return
      }
      if (aclDraft.some(entry => entry.subjectType === 'ALL')) {
        message.warning(t('docKnowledge.aclDuplicate'))
        return
      }
      setAclDraft(prev => [...prev, {
        id: -Date.now(), subjectType: 'ALL', subjectId: '0', subjectName: t('docKnowledge.aclAll'), permissions: newPermissions,
      }])
      return
    }
    if (!newSubjectId) {
      message.warning(t('docKnowledge.aclSubjectRequired'))
      return
    }
    if (aclDraft.some(entry => entry.subjectType === newSubjectType && entry.subjectId === newSubjectId)) {
      message.warning(t('docKnowledge.aclDuplicate'))
      return
    }
    setAclDraft(prev => [...prev, {
      id: -Date.now(), subjectType: newSubjectType, subjectId: newSubjectId,
      subjectName: newSubjectName || newSubjectId, permissions: newPermissions,
    }])
    setNewSubjectId('')
    setNewSubjectName('')
  }

  const handleSaveAcl = async () => {
    if (!detail) return
    setAclSaving(true)
    try {
      await saveDocKnowledgeAcl(detail.document.nodeId, detail.document.version, aclDraft)
      message.success(t('docKnowledge.aclSaved'))
      setAclOpen(false)
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.aclSaveFailed'))
    } finally {
      setAclSaving(false)
    }
  }

  const handleAck = async () => {
    if (!nodeId) return
    try {
      const status = await ackDoc(nodeId)
      setAckStatus(status)
      message.success(t('docKnowledge.ackSuccess'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.ackFailed'))
    }
  }

  const openCoverage = () => {
    if (!nodeId) return
    setCoverageOpen(true)
    setCoverage(null)
    setCoverageLoading(true)
    fetchDocAckCoverage(nodeId)
      .then(setCoverage)
      .catch(() => setCoverage(null))
      .finally(() => setCoverageLoading(false))
  }

  const openAckTargets = () => {
    if (!nodeId) return
    setAckOpen(true)
    loadAclOptions()
    fetchDocAckTargets(nodeId)
      .then(setAckTargets)
      .catch(error => message.error(error instanceof Error ? error.message : t('docKnowledge.loadFailed')))
  }

  const handleAddAckTarget = () => {
    if (ackType !== 'ALL' && !ackSubjectId) {
      message.warning(t('docKnowledge.ackSubjectRequired'))
      return
    }
    const subjectId = ackType === 'ALL' ? '0' : ackSubjectId
    if (ackTargets.some(item => item.subjectType === ackType && item.subjectId === subjectId)) {
      message.warning(t('docKnowledge.ackDuplicate'))
      return
    }
    const subjectName = ackType === 'ALL'
      ? t('docKnowledge.aclAll')
      : ackSubjectName || (ackType === 'DEPT'
        ? deptOptions.find(option => String(option.value) === subjectId)?.label
        : roleOptions.find(option => String(option.value) === subjectId)?.label) || subjectId
    setAckTargets(prev => [...prev, {
      subjectType: ackType, subjectId, subjectName, dueAt: ackDueAt,
    }])
    setAckSubjectId('')
    setAckSubjectName('')
    setAckDueAt(null)
  }

  const handleSaveAckTargets = async () => {
    if (!nodeId) return
    setAckSaving(true)
    try {
      await saveDocAckTargets(nodeId, ackTargets)
      message.success(t('docKnowledge.ackTargetsSaved'))
      setAckOpen(false)
      setAckStatus(await fetchDocAckStatus(nodeId).catch(() => null))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.ackTargetsSaveFailed'))
    } finally {
      setAckSaving(false)
    }
  }

  const handleDownload = async () => {
    if (!detail || !asset) return
    try {
      await downloadDocAsset(asset.id, detail.document.nodeId, asset.originalName)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.downloadFailed'))
    }
  }

  if (loading) {
    return <div className="content-area" style={{ minHeight: 400, display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  }
  if (failed || !detail) {
    return (
      <div className="content-area" style={{ padding: '20px 24px' }}>
        <Alert type="error" showIcon message={failed ?? t('docKnowledge.loadFailed')}
          action={<Button size="small" onClick={() => navigate('/doc-center')}>{t('docKnowledge.backToLibrary')}</Button>} />
      </div>
    )
  }

  const document = detail.document

  const openApi = () => {
    if (!nodeId) return
    setApiOpen(true)
    setApiLoading(true)
    fetchDocApiSpecs(nodeId)
      .then(async list => {
        setApiList(list)
        setApiView(list.length > 0 ? await fetchDocApiSpec(list[0].id) : null)
      })
      .catch(() => { setApiList([]); setApiView(null) })
      .finally(() => setApiLoading(false))
  }

  const handleArchive = async () => {
    setArchiveSaving(true)
    try {
      await archiveDoc(document.nodeId, {
        retentionYears: archiveYears, retentionStart: archiveStart, legalHold: archiveHold,
      })
      setArchiveOpen(false)
      message.success(t('docKnowledge.archived'))
      await load()
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.loadFailed'))
    } finally {
      setArchiveSaving(false)
    }
  }

  const handleImportApi = async () => {
    if (!apiRaw.trim()) {
      message.warning(t('docKnowledge.apiRawRequired'))
      return
    }
    setApiSaving(true)
    try {
      const view = await importDocApiSpec(document.nodeId, {
        systemCode: apiSystem.trim() || 'doc', specVersion: apiVersion.trim() || '1.0.0', rawSpec: apiRaw,
      })
      setApiView(view)
      setApiList(await fetchDocApiSpecs(document.nodeId))
      message.success(t('docKnowledge.apiImported'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.apiImportFailed'))
    } finally {
      setApiSaving(false)
    }
  }

  const handleAckApiChange = async (changeId: number) => {
    try {
      await ackDocApiChange(changeId)
      if (apiView) setApiView(await fetchDocApiSpec(apiView.spec.id))
      message.success(t('docKnowledge.apiChangeAcked'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.apiChangeAckFailed'))
    }
  }

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      message.warning(t('docKnowledge.noteRequired'))
      return
    }
    setNoteSaving(true)
    try {
      await saveDocNote(document.nodeId, {
        revisionId: detail.revision.id, noteType: 2, content: noteText.trim(), visibility: noteVisibility,
      })
      setNoteText('')
      setNotes(await fetchDocNotes(document.nodeId))
      message.success(t('docKnowledge.noteSaved'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.noteSaveFailed'))
    } finally {
      setNoteSaving(false)
    }
  }

  const handleDeleteNote = async (id: number) => {
    try {
      await deleteDocNote(id)
      setNotes(prev => prev.filter(note => note.id !== id))
      message.success(t('docKnowledge.noteDeleted'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.noteSaveFailed'))
    }
  }

  const handleOpenInBrowser = async () => {
    if (!asset) return
    // 先同步打开空白页，避免 await 之后被浏览器弹窗拦截。
    const win = window.open('', '_blank')
    try {
      const blob = await fetchDocAssetBlob(asset.id, document.nodeId)
      const url = URL.createObjectURL(blob)
      if (win) {
        win.location.href = url
        win.opener = null
      } else {
        // 弹窗被浏览器拦截时退回当前页打开，仍由系统 PDF/图片查看器渲染。
        window.location.href = url
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      win?.close()
      message.error(error instanceof Error ? error.message : t('docKnowledge.previewFailed'))
    }
  }

  const handleFavorite = async () => {
    setFavoriteLoading(true)
    try {
      const favored = await toggleDocFavorite(document.nodeId)
      setFavorite(favored)
      message.success(t(favored ? 'docKnowledge.favoriteAdded' : 'docKnowledge.favoriteRemoved'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.favoriteFailed'))
    } finally {
      setFavoriteLoading(false)
    }
  }

  const handleExportReceipts = async () => {
    try {
      await downloadDocAckReceipts(document.nodeId, document.documentNo)
      message.success(t('docKnowledge.ackExportSuccess'))
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.ackExportFailed'))
    }
  }

  const canDownload = detail.allowedActions.includes('download') && !!asset
  const canManageAcl = detail.allowedActions.includes('acl')
  const revisionColumns: ColumnsType<DocKnowledgeRevision> = [
    {
      title: t('docKnowledge.version'), dataIndex: 'revisionNo', width: 80,
      render: (value: number) => `v${value}`,
    },
    { title: t('docKnowledge.versionTitle'), dataIndex: 'title', ellipsis: true },
    {
      title: t('docKnowledge.changeReason'), dataIndex: 'changeReason', width: 180, ellipsis: true,
      render: (value?: string | null) => value || '—',
    },
    {
      title: t('docKnowledge.createdAt'), dataIndex: 'createdAt', width: 170,
      render: (value?: string | number | null) => formatDocKnowledgeTime(value),
    },
    {
      title: t('docKnowledge.colAction'), width: 90,
      render: (_, row) => (
        <Button type="link" size="small"
          onClick={() => navigate(`/doc-center/knowledge?id=${document.nodeId}&revision=${row.id}`)}>
          {t('docKnowledge.view')}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      <DetailPageHeader
        title={document.documentNo}
        tags={(
          <>
            <Tag>{t(`docKnowledge.kind.${KIND_KEY[document.contentKind]}`)}</Tag>
            <Tag color={DOC_CONFIDENTIALITY_COLOR[document.confidentiality]}>
              {t(`docKnowledge.confidentiality.${CONFIDENTIALITY_KEY[document.confidentiality]}`)}
            </Tag>
            <Tag color={STATUS_COLOR[document.status ?? 1]}>
              {t(`docKnowledge.status.${STATUS_KEY[document.status ?? 1] ?? 'draft'}`)}
            </Tag>
          </>
        )}
        meta={`${document.spaceName ?? '—'} · ${document.categoryName ?? '—'} · ${t('docKnowledge.owner')} ${document.ownerName ?? '—'} · ${formatDocKnowledgeTime(document.updatedAt)}`}
        onBack={() => navigate('/doc-center')}
        extra={(
          <Space wrap>
            {detail.revisions.length > 1 && (
              <Select
                size="small"
                style={{ width: 100 }}
                value={detail.revision.id}
                options={detail.revisions.map(row => ({ value: row.id, label: `v${row.revisionNo}` }))}
                onChange={value => navigate(`/doc-center/knowledge?id=${document.nodeId}&revision=${value}`)}
              />
            )}
            {canDownload && (
              <Button icon={<DownloadOutlined />} onClick={handleDownload}>{t('docKnowledge.download')}</Button>
            )}
            <Button icon={favorite ? <StarFilled style={{ color: '#FAAD14' }} /> : <StarOutlined />}
              loading={favoriteLoading} onClick={handleFavorite}>
              {t(favorite ? 'docKnowledge.favoriteDone' : 'docKnowledge.favorite')}
            </Button>
            <Button icon={<FileTextOutlined />} onClick={() => setNotesOpen(true)}>{t('docKnowledge.notes')}</Button>
            {(detail.allowedActions.includes('edit') || document.contentKind === 5) && (
              <Button icon={<ApiOutlined />} onClick={openApi}>{t('docKnowledge.apiSpecs')}</Button>
            )}
            {detail.allowedActions.includes('edit') && document.status === 3 && (
              <Button onClick={() => setArchiveOpen(true)}>{t('docKnowledge.archiveAction')}</Button>
            )}
            {canManageAcl && (
              <Button icon={<TeamOutlined />} onClick={openAcl}>{t('docKnowledge.aclManage')}</Button>
            )}
            {detail.allowedActions.includes('ack-targets') && (
              <Button icon={<SafetyCertificateOutlined />} onClick={openAckTargets}>{t('docKnowledge.ackTargets')}</Button>
            )}
            {detail.allowedActions.includes('ack-coverage') && (
              <Button icon={<BarChartOutlined />} onClick={openCoverage}>{t('docKnowledge.ackCoverage')}</Button>
            )}
            {detail.allowedActions.includes('ack-export') && (
              <Button icon={<ExportOutlined />} onClick={handleExportReceipts}>{t('docKnowledge.ackExport')}</Button>
            )}
          </Space>
        )}
      />

      {document.status === 7 && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.destroyedHint')} />
      )}
      {document.status === 4 && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.archivedHint')} />
      )}
      {ackStatus?.targeted && !ackStatus.acknowledged && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={t('docKnowledge.ackRequired', { date: ackStatus.dueAt ?? t('docKnowledge.ackNoDue') })}
          description={t('docKnowledge.ackRequiredHint', { signed: ackStatus.receiptCount, total: ackStatus.targetCount })}
          action={<Button type="primary" onClick={handleAck}>{t('docKnowledge.ackNow')}</Button>} />
      )}
      {ackStatus?.acknowledged && (
        <Alert type="success" showIcon style={{ marginBottom: 12 }}
          message={t('docKnowledge.ackDone', { time: formatDocKnowledgeTime(ackStatus.acknowledgedAt) })} />
      )}
      {canManageAcl && document.restricted && detail.acl.length === 0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={t('docKnowledge.restrictedNoAcl')} description={t('docKnowledge.restrictedNoAclHint')} />
      )}
      {asset?.scanResult === 'UNSCANNED' && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={t('docKnowledge.unscannedWarning')} description={t('docKnowledge.unscannedHint')} />
      )}

      <DocSectionCard icon={<FileTextOutlined />} color="#1890ff" bg="#e6f7ff" title={t('docKnowledge.overview')}>
        <Descriptions bordered size="small" column={2} items={[
          { key: 'space', label: t('docKnowledge.fieldSpace'), children: document.spaceName ?? '—' },
          { key: 'category', label: t('docKnowledge.fieldCategory'), children: document.categoryName ?? '—' },
          { key: 'kind', label: t('docKnowledge.fieldKind'), children: t(`docKnowledge.kind.${KIND_KEY[document.contentKind]}`) },
          {
            key: 'conf', label: t('docKnowledge.fieldConfidentiality'),
            children: <Tag color={DOC_CONFIDENTIALITY_COLOR[document.confidentiality]}>
              {t(`docKnowledge.confidentiality.${CONFIDENTIALITY_KEY[document.confidentiality]}`)}
            </Tag>,
          },
          { key: 'owner', label: t('docKnowledge.fieldOwner'), children: document.ownerName ?? '—' },
          { key: 'version', label: t('docKnowledge.fieldVersion'), children: `v${detail.revision.revisionNo}` },
          { key: 'created', label: t('docKnowledge.createdAt'), children: formatDocKnowledgeTime(document.createdAt) },
          { key: 'updated', label: t('docKnowledge.updatedAt'), children: formatDocKnowledgeTime(document.updatedAt) },
          {
            key: 'tags', label: t('docKnowledge.fieldTags'), span: 2,
            children: <Space size={4} wrap>{parseTagsJson(detail.revision.tagsJson)
              .map(tag => <Tag key={tag} color="blue">{tag}</Tag>)}</Space>,
          },
          {
            key: 'summary', label: t('docKnowledge.fieldSummary'), span: 2,
            children: detail.revision.summary || '—',
          },
        ]} />
      </DocSectionCard>

      <DocSectionCard icon={<EyeOutlined />} color="#13c2c2" bg="#e6fffb" title={t('docKnowledge.content')}
        hint={t('docKnowledge.contentHint')}>
        {detail.revision.markdown ? (
          <div style={{ fontSize: 13, color: '#262626', lineHeight: 1.9 }}>
            <AiRichText text={detail.revision.markdown} />
          </div>
        ) : kind === 4 ? (
          <Space direction="vertical" size={12}>
            <Alert type="info" showIcon message={t('docKnowledge.linkDocHint')} />
            <Typography.Text copyable>{document.sourceUrl}</Typography.Text>
            <Button type="primary" icon={<LinkOutlined />}
              onClick={() => window.open(document.sourceUrl ?? '', '_blank', 'noopener')}>
              {t('docKnowledge.openLink')}
            </Button>
          </Space>
        ) : kind === 3 ? (
          officePreviewLoading ? <div style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}><Spin /></div>
            : officePreviewUrl ? (
              <iframe src={officePreviewUrl} title={asset?.originalName ?? 'Office preview'} allowFullScreen
                style={{ width: '100%', height: '78vh', border: '1px solid #e8eaed', borderRadius: 8, background: '#fff' }} />
            ) : (
              <Alert type="warning" showIcon message={t('docKnowledge.officePreviewHint')}
                description={officePreviewError}
                action={canDownload ? <Button size="small" onClick={handleDownload}>{t('docKnowledge.download')}</Button> : undefined} />
            )
        ) : asset && (asset.mime === 'application/pdf' || asset.mime.startsWith('image/')) ? (
          <Space direction="vertical" size={12}>
            <Alert type="info" showIcon message={t('docKnowledge.browserViewHint')} />
            <Button type="primary" icon={<ExportOutlined />} onClick={() => void handleOpenInBrowser()}>
              {t('docKnowledge.openInBrowser')}
            </Button>
            <Typography.Text type="secondary">{asset.originalName} · {asset.mime}</Typography.Text>
          </Space>
        ) : (
          <Empty description={t('docKnowledge.noContent')} />
        )}
      </DocSectionCard>

      {detail.assets.length > 1 && (
        <DocSectionCard icon={<LockOutlined />} color="#722ed1" bg="#f9f0ff" title={t('docKnowledge.attachments')}>
          <Table rowKey="id" size="small" pagination={false} dataSource={detail.assets}
            columns={[
              { title: t('docKnowledge.fileName'), dataIndex: 'originalName', ellipsis: true },
              { title: t('docKnowledge.fileType'), dataIndex: 'mime', width: 220 },
              { title: t('docKnowledge.fileSize'), dataIndex: 'sizeBytes', width: 120, render: (value: number) => `${(value / 1024 / 1024).toFixed(2)} MB` },
            ]} />
        </DocSectionCard>
      )}

      <DocSectionCard icon={<SafetyCertificateOutlined />} color="#fa8c16" bg="#fff7e6" title={t('docKnowledge.versionHistory')}>
        <Table rowKey="id" size="small" pagination={false} dataSource={detail.revisions} columns={revisionColumns}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.noVersions')} /> }} />
      </DocSectionCard>

      <Modal
        open={aclOpen}
        title={t('docKnowledge.aclTitle')}
        width={820}
        onCancel={() => setAclOpen(false)}
        onOk={handleSaveAcl}
        confirmLoading={aclSaving}
        okText={t('docKnowledge.save')}
        cancelText={t('docKnowledge.cancel')}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.aclHint')} />
        {document.confidentiality >= 3 && (
          <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.aclClearanceHint')} />
        )}
        <Table rowKey="id" size="small" pagination={false} dataSource={aclDraft}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.aclEmpty')} /> }}
          columns={[
            {
              title: t('docKnowledge.aclSubjectType'), dataIndex: 'subjectType', width: 110,
              render: (value: string) => <Tag>{t(`docKnowledge.aclType.${value.toLowerCase()}`)}</Tag>,
            },
            {
              title: t('docKnowledge.aclSubject'), dataIndex: 'subjectName',
              render: (value: string | null | undefined, row) => value || row.subjectId,
            },
            {
              title: t('docKnowledge.aclPermissions'), dataIndex: 'permissions', width: 150,
              render: (value: number, row) => (
                <Select size="small" value={value} style={{ width: 120 }}
                  options={[
                    { value: 1, label: t('docKnowledge.aclRead') },
                    { value: 3, label: t('docKnowledge.aclEdit') },
                  ]}
                  onChange={next => setAclDraft(prev => prev.map(item => item.id === row.id ? { ...item, permissions: next } : item))} />
              ),
            },
            {
              title: t('docKnowledge.aclExpires'), dataIndex: 'expiresAt', width: 170,
              render: (value?: string | number | null) => value ? formatDocKnowledgeTime(value) : t('docKnowledge.aclLongTerm'),
            },
            {
              title: t('docKnowledge.colAction'), width: 80,
              render: (_, row) => (
                <Button type="link" size="small" danger
                  onClick={() => setAclDraft(prev => prev.filter(item => item.id !== row.id))}>
                  {t('docKnowledge.remove')}
                </Button>
              ),
            },
          ]} />

        <div style={{ marginTop: 16, padding: 12, background: '#FAFAFA', borderRadius: 8, display: 'grid', gridTemplateColumns: '120px 1fr 120px 90px', gap: 8, alignItems: 'center' }}>
          <Select value={newSubjectType} onChange={value => { setNewSubjectType(value as 'USER' | 'DEPT' | 'ROLE' | 'ALL'); setNewSubjectId(''); setNewSubjectName('') }}
            options={[
              { value: 'USER', label: t('docKnowledge.aclType.user') },
              { value: 'DEPT', label: t('docKnowledge.aclType.dept') },
              { value: 'ROLE', label: t('docKnowledge.aclType.role') },
              ...(document.confidentiality < 3 ? [{ value: 'ALL', label: t('docKnowledge.aclType.all') }] : []),
            ]} />
          {newSubjectType === 'USER' ? (
            <EmployeeSelect single
              value={newSubjectId ? Number(newSubjectId) : []}
              onChange={ids => setNewSubjectId(ids[0] ? String(ids[0]) : '')}
              onPick={items => setNewSubjectName(items[0]?.name ?? '')}
              placeholder={t('docKnowledge.aclSelectUser')} />
          ) : newSubjectType === 'DEPT' ? (
            <Select showSearch optionFilterProp="label" value={newSubjectId ? Number(newSubjectId) : undefined}
              onChange={value => setNewSubjectId(String(value))}
              options={deptOptions} placeholder={t('docKnowledge.aclSelectDept')} />
          ) : newSubjectType === 'ROLE' ? (
            <Select showSearch optionFilterProp="label" value={newSubjectId ? Number(newSubjectId) : undefined}
              onChange={value => setNewSubjectId(String(value))}
              options={roleOptions} placeholder={t('docKnowledge.aclSelectRole')} />
          ) : (
            <Typography.Text type="secondary">{t('docKnowledge.aclAllHint')}</Typography.Text>
          )}
          <Select value={newPermissions} onChange={setNewPermissions}
            options={[
              { value: 1, label: t('docKnowledge.aclRead') },
              { value: 3, label: t('docKnowledge.aclEdit') },
            ]} />
          <Button onClick={handleAddAcl}>{t('docKnowledge.aclAdd')}</Button>
        </div>
      </Modal>

      <Modal
        open={ackOpen}
        title={t('docKnowledge.ackTargetsTitle')}
        width={820}
        onCancel={() => setAckOpen(false)}
        onOk={handleSaveAckTargets}
        confirmLoading={ackSaving}
        okText={t('docKnowledge.save')}
        cancelText={t('docKnowledge.cancel')}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.ackTargetsHint')} />
        <Table rowKey={row => `${row.subjectType}:${row.subjectId}`} size="small" pagination={false}
          dataSource={ackTargets}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.ackTargetsEmpty')} /> }}
          columns={[
            {
              title: t('docKnowledge.ackTypeLabel'), dataIndex: 'subjectType', width: 110,
              render: (value: string) => <Tag>{t(`docKnowledge.ackType.${value.toLowerCase()}`)}</Tag>,
            },
            {
              title: t('docKnowledge.ackSubject'), dataIndex: 'subjectName',
              render: (value: string | null | undefined, row: DocAckTarget) => value || row.subjectId,
            },
            {
              title: t('docKnowledge.ackDueAt'), dataIndex: 'dueAt', width: 160,
              render: (value?: string | null) => value || t('docKnowledge.ackNoDue'),
            },
            {
              title: t('docKnowledge.colAction'), width: 80,
              render: (_, row: DocAckTarget) => (
                <Button type="link" size="small" danger
                  onClick={() => setAckTargets(prev => prev.filter(item =>
                    !(item.subjectType === row.subjectType && item.subjectId === row.subjectId)))}>
                  {t('docKnowledge.remove')}
                </Button>
              ),
            },
          ]} />

        <div style={{ marginTop: 16, padding: 12, background: '#FAFAFA', borderRadius: 8, display: 'grid', gridTemplateColumns: '130px 1fr 180px 90px', gap: 8, alignItems: 'center' }}>
          <Select value={ackType}
            onChange={value => { setAckType(value as 'DEPT' | 'ROLE' | 'ALL'); setAckSubjectId(''); setAckSubjectName('') }}
            options={[
              { value: 'DEPT', label: t('docKnowledge.ackType.dept') },
              { value: 'ROLE', label: t('docKnowledge.ackType.role') },
              ...(document.confidentiality < 3 ? [{ value: 'ALL', label: t('docKnowledge.ackType.all') }] : []),
            ]} />
          {ackType === 'DEPT' ? (
            <Select showSearch optionFilterProp="label" value={ackSubjectId ? Number(ackSubjectId) : undefined}
              onChange={value => { setAckSubjectId(String(value)); setAckSubjectName(deptOptions.find(option => option.value === value)?.label ?? '') }}
              options={deptOptions} placeholder={t('docKnowledge.aclSelectDept')} />
          ) : ackType === 'ROLE' ? (
            <Select showSearch optionFilterProp="label" value={ackSubjectId ? Number(ackSubjectId) : undefined}
              onChange={value => { setAckSubjectId(String(value)); setAckSubjectName(roleOptions.find(option => option.value === value)?.label ?? '') }}
              options={roleOptions} placeholder={t('docKnowledge.aclSelectRole')} />
          ) : (
            <Typography.Text type="secondary">{t('docKnowledge.ackAllHint')}</Typography.Text>
          )}
          <DatePicker value={ackDueAt ? dayjs(ackDueAt) : null}
            onChange={date => setAckDueAt(date ? date.format('YYYY-MM-DD') : null)}
            placeholder={t('docKnowledge.ackDueAt')} />
          <Button onClick={handleAddAckTarget}>{t('docKnowledge.ackAdd')}</Button>
        </div>
      </Modal>

      <Modal
        open={coverageOpen}
        title={t('docKnowledge.ackCoverageTitle')}
        width={820}
        footer={null}
        onCancel={() => setCoverageOpen(false)}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.ackCoverageHint')} />
        <div style={{ display: 'flex', gap: 28, marginBottom: 12, color: '#595959' }}>
          <span>{t('docKnowledge.ackCoverageTarget')} <b>{coverageLoading ? '—' : coverage?.targetUsers ?? 0}</b></span>
          <span>{t('docKnowledge.ackCoverageDone')} <b>{coverageLoading ? '—' : coverage?.acknowledgedUsers ?? 0}</b></span>
          <span>{t('docKnowledge.ackCoverageRate')} <b>{coverageLoading ? '—' : `${coverage?.rate ?? 0}%`}</b></span>
        </div>
        <Table
          rowKey={row => `${row.subjectType}:${row.subjectId}`}
          size="small"
          loading={coverageLoading}
          pagination={false}
          dataSource={coverage?.rows ?? []}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.ackCoverageEmpty')} /> }}
          columns={[
            {
              title: t('docKnowledge.ackTypeLabel'), dataIndex: 'subjectType', width: 90,
              render: (value: string) => <Tag>{t(`docKnowledge.ackType.${value.toLowerCase()}`)}</Tag>,
            },
            {
              title: t('docKnowledge.ackSubject'), dataIndex: 'subjectName',
              render: (value: string | null | undefined, row) => value || row.subjectId,
            },
            { title: t('docKnowledge.ackCoverageTarget'), dataIndex: 'targetUsers', width: 100 },
            { title: t('docKnowledge.ackCoverageDone'), dataIndex: 'acknowledgedUsers', width: 100 },
            {
              title: t('docKnowledge.ackCoverageRate'), dataIndex: 'rate', width: 180,
              render: (value: number) => <Progress percent={Math.min(100, Math.round(value))} size="small" />,
            },
            {
              title: t('docKnowledge.ackDueAt'), dataIndex: 'dueAt', width: 120,
              render: (value?: string | null) => value || t('docKnowledge.ackNoDue'),
            },
          ]}
        />
      </Modal>

      <Modal
        open={notesOpen}
        title={t('docKnowledge.notesTitle')}
        width={760}
        footer={null}
        onCancel={() => setNotesOpen(false)}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.notesHint')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 100px', gap: 8, marginBottom: 12 }}>
          <Input.TextArea rows={4} maxLength={4000} showCount value={noteText}
            onChange={event => setNoteText(event.target.value)}
            placeholder={t('docKnowledge.notePlaceholder')} />
          <Select value={noteVisibility} onChange={setNoteVisibility}
            options={[
              { value: 1, label: t('docKnowledge.noteVisibilityPrivate') },
              { value: 2, label: t('docKnowledge.noteVisibilitySpace') },
            ]} />
          <Button type="primary" loading={noteSaving} onClick={handleSaveNote}>{t('docKnowledge.noteSave')}</Button>
        </div>
        <Table rowKey="id" size="small" pagination={false} dataSource={notes}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.noteEmpty')} /> }}
          columns={[
            { title: t('docKnowledge.noteContent'), dataIndex: 'content', ellipsis: true },
            {
              title: t('docKnowledge.noteVisibility'), dataIndex: 'visibility', width: 110,
              render: (value: number) => <Tag>{t(value === 2 ? 'docKnowledge.noteVisibilitySpace' : 'docKnowledge.noteVisibilityPrivate')}</Tag>,
            },
            {
              title: t('docKnowledge.createdAt'), dataIndex: 'createdAt', width: 170,
              render: (value: string | number) => formatDocKnowledgeTime(value),
            },
            {
              title: t('docKnowledge.colAction'), width: 80,
              render: (_, row: DocNote) => (
                <Button type="link" size="small" danger onClick={() => void handleDeleteNote(row.id)}>
                  {t('docKnowledge.noteDelete')}
                </Button>
              ),
            },
          ]} />
      </Modal>

      <Modal
        open={apiOpen}
        title={t('docKnowledge.apiSpecsTitle')}
        width={1000}
        footer={null}
        onCancel={() => setApiOpen(false)}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.apiSpecsHint')} />
        <div style={{ display: 'grid', gridTemplateColumns: '160px 160px 1fr', gap: 8, marginBottom: 8 }}>
          <Input value={apiSystem} onChange={e => setApiSystem(e.target.value)} placeholder={t('docKnowledge.apiSystem')} />
          <Input value={apiVersion} onChange={e => setApiVersion(e.target.value)} placeholder={t('docKnowledge.apiVersion')} />
          <Button type="primary" loading={apiSaving} onClick={handleImportApi}>{t('docKnowledge.apiImport')}</Button>
        </div>
        <Input.TextArea rows={7} value={apiRaw} onChange={e => setApiRaw(e.target.value)}
          placeholder={t('docKnowledge.apiRawPlaceholder')} style={{ marginBottom: 12, fontFamily: 'monospace' }} />
        {apiLoading ? <Spin /> : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: '#595959' }}>{t('docKnowledge.apiSpecList')}</span>
              <Select style={{ width: 260 }} value={apiView?.spec.id}
                options={apiList.map(spec => ({ value: spec.id, label: `${spec.specVersion} · ${spec.systemCode}` }))}
                onChange={value => void fetchDocApiSpec(value).then(setApiView)} />
              {apiView && <Tag color="blue">{apiView.spec.specFormat}</Tag>}
              {apiView && apiView.pendingDestructive > 0 && <Tag color="red">{t('docKnowledge.apiPending', { count: apiView.pendingDestructive })}</Tag>}
            </div>
            <Table rowKey="id" size="small" pagination={false} dataSource={apiView?.operations ?? []}
              style={{ marginBottom: 12 }}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.apiNoSpecs')} /> }}
              columns={[
                { title: 'Method', dataIndex: 'method', width: 90, render: (value: string) => <Tag>{value}</Tag> },
                { title: 'Path', dataIndex: 'path', ellipsis: true },
                { title: t('docKnowledge.apiSummary'), dataIndex: 'summary', ellipsis: true },
                { title: t('docKnowledge.apiDeprecated'), dataIndex: 'deprecated', width: 90, render: (value: boolean) => value ? <Tag color="orange">deprecated</Tag> : '—' },
              ]} />
            <Table rowKey="id" size="small" pagination={false} dataSource={apiView?.changes ?? []}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.apiNoChanges')} /> }}
              columns={[
                { title: t('docKnowledge.apiChangeType'), dataIndex: 'changeType', width: 100, render: (value: number) => <Tag color={value === 3 || value === 2 ? 'red' : value === 1 ? 'green' : 'default'}>{value}</Tag> },
                { title: 'Operation', dataIndex: 'operationKey', ellipsis: true },
                { title: t('docKnowledge.apiChangeDetail'), dataIndex: 'detail', ellipsis: true },
                { title: t('docKnowledge.apiChangeState'), width: 150, render: (_, row) => row.acknowledgedBy
                  ? <Tag color="green">{t('docKnowledge.apiAcked')}</Tag>
                  : (row.changeType === 2 || row.changeType === 3)
                    ? <Button size="small" onClick={() => void handleAckApiChange(row.id)}>{t('docKnowledge.apiAck')}</Button>
                    : <Tag>{t('docKnowledge.apiPendingAck')}</Tag> },
              ]} />
          </>
        )}
      </Modal>

      <Modal
        open={archiveOpen}
        title={t('docKnowledge.archiveTitle')}
        onCancel={() => setArchiveOpen(false)}
        onOk={handleArchive}
        confirmLoading={archiveSaving}
        okText={t('docKnowledge.confirm')}
        cancelText={t('docKnowledge.cancel')}
        className="custom-confirm-modal"
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('docKnowledge.archiveHint')} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{t('docKnowledge.retentionYears')}</div>
            <InputNumber min={1} max={100} value={archiveYears} onChange={value => setArchiveYears(value ?? 10)} style={{ width: '100%' }} />
          </div>
          <div>
            <div style={{ fontSize: 13, color: '#595959', marginBottom: 6 }}>{t('docKnowledge.archiveStart')}</div>
            <DatePicker value={dayjs(archiveStart)} onChange={date => setArchiveStart(date ? date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'))} style={{ width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
          <Switch checked={archiveHold} onChange={setArchiveHold} />
          <span>{t('docKnowledge.archiveLegalHold')}</span>
        </div>
      </Modal>
    </div>
  )
}
