/**
 * 文档库（P0 知识库列表）：空间/分类树 + 搜索区 → 统计卡 → 操作区 → 表格。
 *
 * 口径：
 * - 列表与统计共用同一份筛选条件，走 /api/doc/v3/search 与 /search/stats；
 * - 权限、密级、ACL 过滤全部在后端 SQL 内完成，前端不做“先取全量再裁剪”；
 * - 上传走原始字节流，避免放大全局 multipart 2MB 限制。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button, Form, Input, Modal, Progress, Select, Space, Table, Tag, Tree, Upload, message,
} from 'antd'
import type { TableColumnsType, UploadFile } from 'antd'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined, FileTextOutlined, CheckCircleOutlined,
  HistoryOutlined, FolderOpenOutlined, ClusterOutlined, CloudUploadOutlined, SafetyCertificateOutlined,
  BookOutlined,
} from '@ant-design/icons'
import {
  DOC_CONFIDENTIALITY_COLOR, DOC_CONFIDENTIALITY_VALUES, DOC_CONTENT_KIND_VALUES,
  createDocKnowledgeDocument, fetchDocCategoryTree,
  fetchDocKnowledgeSpaces, fetchDocKnowledgeStats, fetchDocTags, formatDocKnowledgeTime,
  newDocKnowledgeKey, rebuildDocKnowledgeIndex, searchDocKnowledge, splitDocTags, uploadDocAsset,
  type DocCategoryNode, type DocConfidentiality, type DocContentKind, type DocKnowledgeSpace,
  type DocSearchQuery, type DocSearchRow, type DocKnowledgeStats, type DocWritePayload,
  type DocTag,
} from '@/api/docKnowledge'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { useAuth } from '@/contexts/AuthContext'
import MeetingStatCards, { type StatItem } from '@/pages/MeetingManagement/MeetingStatCards'
import '@/styles/components.css'
import './index.css'

interface FilterValues {
  keyword?: string
  contentKind?: DocContentKind | ''
  confidentiality?: DocConfidentiality | ''
  status?: number | ''
}

interface UploadValues {
  spaceId: number
  categoryId?: number | null
  title: string
  summary?: string
  confidentiality: DocConfidentiality
  tags?: string[]
}

const STATUS_COLOR: Record<number, string> = {
  1: 'default', 2: 'processing', 3: 'success', 4: 'purple', 5: 'default', 6: 'warning', 7: 'error',
}
const STATUS_KEY: Record<number, string> = {
  1: 'draft', 2: 'reviewing', 3: 'effective', 4: 'archived', 5: 'superseded', 6: 'pendingDisposal', 7: 'destroyed',
}
const KIND_KEY: Record<DocContentKind, string> = {
  1: 'markdown', 2: 'pdf', 3: 'office', 4: 'link', 5: 'openapi',
}
const CONFIDENTIALITY_KEY: Record<DocConfidentiality, string> = {
  1: 'public', 2: 'internal', 3: 'sensitive', 4: 'restricted',
}

function flattenCategories(nodes: DocCategoryNode[], depth = 0): { value: number; label: string }[] {
  return nodes.flatMap(node => [
    { value: node.id, label: `${'　'.repeat(depth)}${node.name}` },
    ...flattenCategories(node.children ?? [], depth + 1),
  ])
}

export default function DocLibrary() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('doc-library:edit')
  const [form] = Form.useForm<FilterValues>()
  const [uploadForm] = Form.useForm<UploadValues>()

  const [spaces, setSpaces] = useState<DocKnowledgeSpace[]>([])
  const [spaceId, setSpaceId] = useState<number | null>(null)
  const [categoryId, setCategoryId] = useState<number | null>(null)
  const [categoryMap, setCategoryMap] = useState<Record<number, DocCategoryNode[]>>({})
  const [rows, setRows] = useState<DocSearchRow[]>([])
  const [stats, setStats] = useState<DocKnowledgeStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [resetToken, setResetToken] = useState(0)
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['all'])

  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadCategories, setUploadCategories] = useState<DocCategoryNode[]>([])
  const [uploadTags, setUploadTags] = useState<DocTag[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const sourceSessionKeyRef = useRef(newDocKnowledgeKey('session'))
  const idempotencyKeyRef = useRef(newDocKnowledgeKey('knowledge'))

  const buildQuery = useCallback((targetPage = page): DocSearchQuery => {
    const values = form.getFieldsValue()
    return {
      keyword: values.keyword,
      spaceId,
      categoryId,
      contentKind: values.contentKind ?? '',
      confidentiality: values.confidentiality ?? '',
      status: values.status ?? '',
      page: targetPage,
      size,
    }
  }, [form, spaceId, categoryId, page, size])

  const loadData = useCallback(async (targetPage = page) => {
    setLoading(true)
    try {
      const query = buildQuery(targetPage)
      const [result, stat] = await Promise.all([
        searchDocKnowledge(query),
        fetchDocKnowledgeStats(query),
      ])
      setRows(result.records)
      setTotal(result.total)
      setStats(stat)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [buildQuery, page, t])

  const loadCategories = useCallback(async (targetSpaceId: number) => {
    try {
      const tree = await fetchDocCategoryTree(targetSpaceId)
      setCategoryMap(prev => ({ ...prev, [targetSpaceId]: tree }))
    } catch {
      setCategoryMap(prev => ({ ...prev, [targetSpaceId]: [] }))
    }
  }, [])

  useEffect(() => {
    fetchDocKnowledgeSpaces()
      .then(rows => {
        setSpaces(rows)
        if (rows.length > 0) {
          setExpandedKeys(prev => (prev.includes('all') ? prev : [...prev, 'all']))
        }
      })
      .catch(() => setSpaces([]))
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData, resetToken])

  useEffect(() => {
    if (spaceId != null && !categoryMap[spaceId]) void loadCategories(spaceId)
  }, [spaceId, categoryMap, loadCategories])

  const handleTreeSelect = (keys: React.Key[]) => {
    const key = String(keys[0] ?? 'all')
    setPage(1)
    if (key === 'all') {
      setSpaceId(null)
      setCategoryId(null)
      return
    }
    if (key.startsWith('space:')) {
      const id = Number(key.slice(6))
      setSpaceId(id)
      setCategoryId(null)
      setExpandedKeys(prev => (prev.includes(key) ? prev : [...prev, key]))
      return
    }
    if (key.startsWith('cat:')) {
      const id = Number(key.slice(4))
      setCategoryId(id)
      for (const [candidateSpaceId, nodes] of Object.entries(categoryMap)) {
        if (flattenCategories(nodes).some(item => item.value === id)) {
          setSpaceId(Number(candidateSpaceId))
          break
        }
      }
    }
  }

  const handleReset = () => {
    form.resetFields()
    setSpaceId(null)
    setCategoryId(null)
    setPage(1)
    setResetToken(value => value + 1)
  }

  const handleSearch = () => {
    setPage(1)
    void loadData(1)
  }

  const openUpload = () => {
    const managedSpaces = spaces.filter(space => space.managed)
    if (spaceId != null && !managedSpaces.some(space => space.id === spaceId)) {
      message.warning(t('docKnowledge.legacySpaceReadOnly'))
      return
    }
    const defaultSpace = spaceId ?? managedSpaces[0]?.id ?? null
    if (defaultSpace == null) {
      message.warning(t('docKnowledge.noManagedSpace'))
      return
    }
    setFile(null)
    setProgress(0)
    setUploadOpen(true)
    sourceSessionKeyRef.current = newDocKnowledgeKey('session')
    idempotencyKeyRef.current = newDocKnowledgeKey('knowledge')
    uploadForm.resetFields()
    uploadForm.setFieldsValue({
      spaceId: defaultSpace ?? undefined,
      confidentiality: 2,
      tags: [],
    })
    if (defaultSpace != null) {
      void fetchDocCategoryTree(defaultSpace).then(setUploadCategories).catch(() => setUploadCategories([]))
      void fetchDocTags(defaultSpace).then(setUploadTags).catch(() => setUploadTags([]))
    }
  }

  const handleUploadSpaceChange = (value: number) => {
    uploadForm.setFieldValue('categoryId', undefined)
    setUploadCategories([])
    void fetchDocCategoryTree(value).then(setUploadCategories).catch(() => setUploadCategories([]))
    void fetchDocTags(value).then(setUploadTags).catch(() => setUploadTags([]))
  }

  const handleFileChange = (next: UploadFile) => {
    idempotencyKeyRef.current = newDocKnowledgeKey('knowledge')
    setFile(next.originFileObj ?? null)
    if (!uploadForm.getFieldValue('title')) {
      const name = next.name.replace(/\.[^.]+$/, '')
      uploadForm.setFieldValue('title', name.slice(0, 200))
    }
  }

  const handleUpload = async () => {
    let values: UploadValues
    try {
      values = await uploadForm.validateFields()
    } catch {
      return
    }
    if (!file) {
      message.warning(t('docKnowledge.fileRequired'))
      return
    }
    setUploading(true)
    setProgress(0)
    try {
      const lower = file.name.toLowerCase()
      let payload: DocWritePayload
      if (lower.endsWith('.md')) {
        const markdown = await file.text()
        payload = {
          spaceId: values.spaceId,
          categoryId: values.categoryId ?? null,
          title: values.title.trim(),
          summary: values.summary?.trim(),
          contentKind: 1,
          confidentiality: values.confidentiality,
          downloadPolicy: values.confidentiality >= 3 ? 2 : 1,
          tags: values.tags ?? [],
          markdown,
          originalFilename: file.name,
          changeReason: t('docKnowledge.uploadReason'),
          sourceSessionKey: sourceSessionKeyRef.current,
        }
      } else {
        const kind: DocContentKind = lower.endsWith('.pdf') ? 2 : 3
        const asset = await uploadDocAsset(values.spaceId, file, setProgress)
        payload = {
          spaceId: values.spaceId,
          categoryId: values.categoryId ?? null,
          title: values.title.trim(),
          summary: values.summary?.trim(),
          contentKind: kind,
          confidentiality: values.confidentiality,
          downloadPolicy: values.confidentiality >= 3 ? 2 : 1,
          tags: values.tags ?? [],
          originalFilename: file.name,
          assetIds: [asset.id],
          changeReason: t('docKnowledge.uploadReason'),
          sourceSessionKey: sourceSessionKeyRef.current,
        }
      }
      const receipt = await createDocKnowledgeDocument(payload, idempotencyKeyRef.current)
      message.success(t('docKnowledge.uploadSuccess'))
      setUploadOpen(false)
      idempotencyKeyRef.current = newDocKnowledgeKey('knowledge')
      navigate(`/doc-center/knowledge?id=${receipt.documentId}&revision=${receipt.revisionId}`)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const handleRebuildIndex = () => {
    Modal.confirm({
      title: t('docKnowledge.rebuildTitle'),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      content: t('docKnowledge.rebuildHint'),
      okText: t('docKnowledge.rebuild'),
      cancelText: t('docKnowledge.cancel'),
      onOk: async () => {
        try {
          await rebuildDocKnowledgeIndex()
          message.success(t('docKnowledge.rebuildSuccess'))
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('docKnowledge.operationFailed'))
        }
      },
    })
  }

  const treeData = useMemo(() => {
    interface CategoryTreeNode { key: string; title: React.ReactNode; children: CategoryTreeNode[] }
    const renderCategory = (node: DocCategoryNode): CategoryTreeNode => ({
      key: `cat:${node.id}`,
      title: `${node.name}${node.docCount > 0 ? ` (${node.docCount})` : ''}`,
      children: (node.children ?? []).map(renderCategory),
    })
    return [{
      key: 'all',
      title: (
        <span className="doc-tree-node" title={t('docKnowledge.allDocs')}>
          <FolderOpenOutlined className="doc-tree-node-icon doc-tree-node-icon-root" />
          <span className="doc-tree-node-name">{t('docKnowledge.allDocs')}</span>
        </span>
      ),
      children: spaces.map(space => ({
        key: `space:${space.id}`,
        title: (
          <span className="doc-tree-node" title={space.name}>
            <ClusterOutlined className="doc-tree-node-icon" />
            <span className="doc-tree-node-name">{space.name}</span>
          </span>
        ),
        children: (categoryMap[space.id] ?? []).map(renderCategory),
      })),
    }]
  }, [spaces, categoryMap, t])

  const selectedKeys = categoryId != null ? [`cat:${categoryId}`] : spaceId != null ? [`space:${spaceId}`] : ['all']

  const allColumnMeta = useMemo(() => ([
    { key: 'title', title: t('docKnowledge.colTitle') },
    { key: 'spaceName', title: t('docKnowledge.colSpace') },
    { key: 'categoryName', title: t('docKnowledge.colCategory') },
    { key: 'contentKind', title: t('docKnowledge.colKind') },
    { key: 'confidentiality', title: t('docKnowledge.colConfidentiality') },
    { key: 'status', title: t('docKnowledge.colStatus') },
    { key: 'tags', title: t('docKnowledge.colTags') },
    { key: 'ownerName', title: t('docKnowledge.colOwner') },
    { key: 'updatedAt', title: t('docKnowledge.colUpdated') },
    { key: 'action', title: t('docKnowledge.colAction') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('doc-knowledge-library', allColumnMeta, [
    { key: 'action', locked: 'tail' },
  ])

  const rawColumns: TableColumnsType<DocSearchRow> = [
    {
      title: t('docKnowledge.colTitle'), dataIndex: 'title', key: 'title', ellipsis: true, width: 300,
      render: (value: string, row) => (
        <a onClick={() => navigate(row.nativeDoc
          ? `/doc-center/knowledge?id=${row.nodeId}`
          : `/doc-center/detail?id=${row.nodeId}`)}>{value}</a>
      ),
    },
    { title: t('docKnowledge.colSpace'), dataIndex: 'spaceName', key: 'spaceName', width: 110 },
    {
      title: t('docKnowledge.colCategory'), dataIndex: 'categoryName', key: 'categoryName', width: 130,
      ellipsis: true, render: (value?: string | null) => value || '—',
    },
    {
      title: t('docKnowledge.colKind'), dataIndex: 'contentKind', key: 'contentKind', width: 110,
      render: (value: DocContentKind) => <Tag>{t(`docKnowledge.kind.${KIND_KEY[value]}`)}</Tag>,
    },
    {
      title: t('docKnowledge.colConfidentiality'), dataIndex: 'confidentiality', key: 'confidentiality', width: 100,
      render: (value: DocConfidentiality) => (
        <Tag color={DOC_CONFIDENTIALITY_COLOR[value]}>{t(`docKnowledge.confidentiality.${CONFIDENTIALITY_KEY[value]}`)}</Tag>
      ),
    },
    {
      title: t('docKnowledge.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (value: number) => <Tag color={STATUS_COLOR[value]}>{t(`docKnowledge.status.${STATUS_KEY[value] ?? 'draft'}`)}</Tag>,
    },
    {
      title: t('docKnowledge.colTags'), dataIndex: 'tags', key: 'tags', width: 170,
      render: (value: string) => (
        <Space size={4} wrap>{splitDocTags(value).map(tag => <Tag key={tag} color="blue">{tag}</Tag>)}</Space>
      ),
    },
    { title: t('docKnowledge.colOwner'), dataIndex: 'ownerName', key: 'ownerName', width: 100 },
    {
      title: t('docKnowledge.colUpdated'), dataIndex: 'updatedAt', key: 'updatedAt', width: 160,
      render: (value: string | number) => formatDocKnowledgeTime(value),
    },
    {
      title: t('docKnowledge.colAction'), key: 'action', width: 100, fixed: 'right',
      render: (_, row) => (
        <Button type="link" size="small" onClick={() => navigate(row.nativeDoc
          ? `/doc-center/knowledge?id=${row.nodeId}`
          : `/doc-center/detail?id=${row.nodeId}`)}>{t('docKnowledge.view')}</Button>
      ),
    },
  ]

  const columns = applyConfig(rawColumns)
  const statItems: StatItem[] = [
    { icon: <FileTextOutlined />, color: '#1890FF', bg: '#E6F7FF', value: stats?.total ?? 0, label: t('docKnowledge.statTotal'), hint: t('docKnowledge.statTotalHint') },
    { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED', value: stats?.effective ?? 0, label: t('docKnowledge.statEffective'), hint: t('docKnowledge.statEffectiveHint') },
    { icon: <HistoryOutlined />, color: '#E8720C', bg: '#FFF7E6', value: stats?.updatedThisMonth ?? 0, label: t('docKnowledge.statUpdated'), hint: t('docKnowledge.statUpdatedHint') },
    { icon: <SafetyCertificateOutlined />, color: '#722ED1', bg: '#F9F0FF', value: stats?.files ?? 0, label: t('docKnowledge.statFiles'), hint: t('docKnowledge.statFilesHint') },
  ]
  const statsKey = JSON.stringify(buildQuery())
  const kindOptions = DOC_CONTENT_KIND_VALUES.map(value => ({ value, label: t(`docKnowledge.kind.${KIND_KEY[value]}`) }))
  const confidentialityOptions = DOC_CONFIDENTIALITY_VALUES.map(value => ({
    value, label: t(`docKnowledge.confidentiality.${CONFIDENTIALITY_KEY[value]}`),
  }))
  const uploadCategoryOptions = flattenCategories(uploadCategories)

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      <div className="doc-container">
        <div className="doc-tree-panel">
          <h3 className="doc-tree-panel-title">
            <ClusterOutlined className="doc-tree-panel-title-icon" />
            {t('docKnowledge.spaceTree')}
          </h3>
          <Tree
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={keys => setExpandedKeys(keys)}
            selectedKeys={selectedKeys}
            onSelect={handleTreeSelect}
          />
        </div>

        <div className="doc-main">
          <div className="search-section">
            <Form form={form} layout="inline">
              <Form.Item label={t('docKnowledge.keyword')} name="keyword">
                <Input placeholder={t('docKnowledge.keywordPlaceholder')} allowClear style={{ width: 220 }} onPressEnter={handleSearch} />
              </Form.Item>
              <Form.Item label={t('docKnowledge.kindLabel')} name="contentKind">
                <Select placeholder={t('docKnowledge.all')} allowClear style={{ width: 130 }} options={kindOptions} />
              </Form.Item>
              <Form.Item label={t('docKnowledge.confidentialityLabel')} name="confidentiality">
                <Select placeholder={t('docKnowledge.all')} allowClear style={{ width: 130 }} options={confidentialityOptions} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('docKnowledge.search')}</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('docKnowledge.reset')}</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          <div key={statsKey}>
            <MeetingStatCards loading={loading} items={statItems} />
          </div>

          <div className="action-section">
            <div className="action-section-left">
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('docKnowledge.scopeHint')}</span>
            </div>
            <div className="action-section-right">
              <Button icon={<BookOutlined />} onClick={() => navigate('/doc-books')}>{t('docKnowledge.booksTitle')}</Button>
              <Button icon={<FolderOpenOutlined />} onClick={() => navigate('/doc-archives')}>{t('docKnowledge.archivesTitle')}</Button>
              <Button onClick={() => navigate('/doc-center/my-acks')}>{t('docKnowledge.myAcks')}</Button>
              {canEdit && <Button icon={<ReloadOutlined />} onClick={handleRebuildIndex}>{t('docKnowledge.rebuild')}</Button>}
              {canEdit && <Button onClick={() => navigate('/doc-center/register')}>{t('docKnowledge.registerLink')}</Button>}
              {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openUpload}>{t('docKnowledge.upload')}</Button>}
              {configComponent}
            </div>
          </div>

          <Table<DocSearchRow>
            rowKey="nodeId"
            columns={columns}
            dataSource={rows}
            loading={loading}
            scroll={{ x: 1500 }}
            size="middle"
            pagination={{
              current: page,
              pageSize: size,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: count => t('docKnowledge.total', { n: count }),
              onChange: (nextPage, nextSize) => {
                setPage(nextPage)
                setSize(nextSize)
              },
            }}
          />
        </div>
      </div>

      <Modal
        open={uploadOpen}
        title={t('docKnowledge.uploadTitle')}
        width={640}
        onCancel={() => { if (!uploading) setUploadOpen(false) }}
        onOk={handleUpload}
        okText={t('docKnowledge.upload')}
        cancelText={t('docKnowledge.cancel')}
        confirmLoading={uploading}
        maskClosable={false}
      >
        <Form form={uploadForm} layout="vertical" initialValues={{ confidentiality: 2 }}
          onValuesChange={() => { idempotencyKeyRef.current = newDocKnowledgeKey('knowledge') }}>
          <Form.Item name="spaceId" label={t('docKnowledge.fieldSpace')} rules={[{ required: true, message: t('docKnowledge.spaceRequired') }]}>
            <Select
              options={spaces.filter(space => space.managed).map(space => ({ value: space.id, label: space.name }))}
              onChange={handleUploadSpaceChange}
              placeholder={t('docKnowledge.selectSpace')}
            />
          </Form.Item>
          <Form.Item name="categoryId" label={t('docKnowledge.fieldCategory')}>
            <Select allowClear placeholder={t('docKnowledge.selectCategory')} options={uploadCategoryOptions} />
          </Form.Item>
          <Form.Item name="title" label={t('docKnowledge.fieldTitle')} rules={[{ required: true, whitespace: true, max: 200 }]}>
            <Input maxLength={200} placeholder={t('docKnowledge.titlePlaceholder')} />
          </Form.Item>
          <Form.Item name="summary" label={t('docKnowledge.fieldSummary')} rules={[{ max: 1000 }]}>
            <Input.TextArea rows={2} maxLength={1000} placeholder={t('docKnowledge.summaryPlaceholder')} />
          </Form.Item>
          <Form.Item name="confidentiality" label={t('docKnowledge.fieldConfidentiality')} rules={[{ required: true }]}>
            <Select options={confidentialityOptions} />
          </Form.Item>
          <Form.Item name="tags" label={t('docKnowledge.fieldTags')}>
            <Select
              mode="tags"
              maxCount={20}
              placeholder={t('docKnowledge.tagsPlaceholder')}
              options={uploadTags.map(tag => ({ value: tag.name, label: tag.name }))}
            />
          </Form.Item>
          <Form.Item label={t('docKnowledge.fieldFile')} required>
            <Upload
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.md"
              maxCount={1}
              beforeUpload={() => false}
              fileList={file ? [{ uid: file.name, name: file.name, status: 'done' } as UploadFile] : []}
              onChange={({ fileList }) => {
                const next = fileList[fileList.length - 1]
                if (next) handleFileChange(next)
                else setFile(null)
              }}
              onRemove={() => { setFile(null); return true }}
            >
              <Button icon={<CloudUploadOutlined />}>{t('docKnowledge.selectFile')}</Button>
            </Upload>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 6 }}>{t('docKnowledge.fileHint')}</div>
          </Form.Item>
          {uploading && progress > 0 && <Progress percent={progress} size="small" />}
        </Form>
      </Modal>
    </div>
  )
}
