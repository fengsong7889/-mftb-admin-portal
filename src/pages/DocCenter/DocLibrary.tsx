/**
 * 文檔庫（列表頁）：左側空間樹 + 右側 搜索區 → 統計卡 → 操作區 → 表格
 *
 * 統計卡位置遵循 §E.8：必須在 .search-section 之後、.action-section 之前，
 * 且口徑跟隨搜索條件（fetchDocStats 與列表共用同一份 filters）。
 * 權限口徑：菜單級統一（doc-library:edit 決定登記/編輯/刪除入口）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Modal, Select, Space, Table, Tag, Tree, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined, ExportOutlined, FileTextOutlined, CheckCircleOutlined, HistoryOutlined, LinkOutlined, FolderOpenOutlined, ClusterOutlined } from '@ant-design/icons'
import {
  fetchDocSpaces, fetchDocNodes, fetchDocStats, deleteDoc,
  DOC_TYPE_VALUES, DOC_STATUS_VALUES, DOC_STATUS_COLOR,
  type DocSpace, type DocNode, type DocQuery, type DocStats, type DocStatus, type DocType,
} from '@/api/docCenter'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { useAuth } from '@/contexts/AuthContext'
import MeetingStatCards, { type StatItem } from '@/pages/MeetingManagement/MeetingStatCards'
import '@/styles/components.css'
import './index.css'

interface FilterValues {
  keyword?: string
  status?: DocStatus | ''
  docType?: DocType | ''
}

export default function DocLibrary() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  // 菜單級統一權限口徑：持有 doc-library:edit 才可登記/編輯/刪除；後端仍有服务端校验
  const canEdit = hasPermission('doc-library:edit')
  const [form] = Form.useForm<FilterValues>()
  const [spaces, setSpaces] = useState<DocSpace[]>([])
  const [spaceId, setSpaceId] = useState<number | null>(null)
  const [rows, setRows] = useState<DocNode[]>([])
  const [stats, setStats] = useState<DocStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(['all'])

  const buildQuery = useCallback((): DocQuery => {
    const v = form.getFieldsValue()
    return { keyword: v.keyword, spaceId, status: v.status ?? '', docType: v.docType ?? '' }
  }, [form, spaceId])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const q = buildQuery()
      const [list, s] = await Promise.all([fetchDocNodes(q), fetchDocStats(q)])
      setRows(list)
      setStats(s)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [buildQuery, t])

  useEffect(() => {
    fetchDocSpaces().then(setSpaces).catch(() => setSpaces([]))
  }, [])

  /**
   * 空間是異步加載的：首屏渲染時樹只有根節點，defaultExpandAll 在那一刻已失效，
   * 所以必須受控展開——數據到達後把根節點展開（已手動收起的狀態不被覆蓋）。
   */
  useEffect(() => {
    if (spaces.length > 0) {
      setExpandedKeys(prev => (prev.includes('all') ? prev : [...prev, 'all']))
    }
  }, [spaces])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleReset = () => {
    form.resetFields()
    setSpaceId(null)
    setTimeout(loadData, 0)
  }

  const handleExport = () => {
    if (!rows.length) {
      message.warning(t('doc.exportEmpty'))
      return
    }
    message.success(t('doc.exportPlaceholder'))
  }

  /** 刪除的是系統內索引；正文在騰訊文檔側不受影響，文案必須講清楚避免誤會丢文件 */
  const handleDelete = (r: DocNode) => {
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('doc.deleteTitle'),
      content: t('doc.deleteContent', { title: r.title }),
      okText: t('doc.del'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteDoc(r.id)
          message.success(t('doc.deleted'))
          void loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('doc.deleteFailed'))
        }
      },
    })
  }

  /* ===== 左側空間樹（節點渲染對齊「部門架構」組織樹：圖標 + 單行省略名稱） ===== */
  const treeData = useMemo(() => ([
    {
      key: 'all',
      title: (
        <span className="doc-tree-node" title={t('doc.allDocs')}>
          <FolderOpenOutlined className="doc-tree-node-icon doc-tree-node-icon-root" />
          <span className="doc-tree-node-name">{t('doc.allDocs')}</span>
        </span>
      ),
      children: spaces.map(s => ({
        key: String(s.id),
        title: (
          <span className="doc-tree-node" title={s.name}>
            <span className="doc-tree-node-icon">{s.icon}</span>
            <span className="doc-tree-node-name">{s.name}</span>
          </span>
        ),
      })),
    },
  ]), [spaces, t])

  const handleTreeSelect = (keys: React.Key[]) => {
    const k = keys[0]
    setSpaceId(k == null || k === 'all' ? null : Number(k))
  }

  /* ===== 列定義（列配置門禁：操作列鎖定尾部） ===== */
  const allColumnMeta = useMemo(() => ([
    { key: 'title', title: t('doc.colTitle') },
    { key: 'spaceName', title: t('doc.colSpace') },
    { key: 'category', title: t('doc.colCategory') },
    { key: 'docType', title: t('doc.colType') },
    { key: 'status', title: t('doc.colStatus') },
    { key: 'tags', title: t('doc.colTags') },
    { key: 'bizLabel', title: t('doc.colBiz') },
    { key: 'ownerName', title: t('doc.colOwner') },
    { key: 'updatedAt', title: t('doc.colUpdated') },
    { key: 'action', title: t('doc.colAction') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('doc-center-library', allColumnMeta, [
    { key: 'action', locked: 'tail' },
  ])

  const rawColumns: TableColumnsType<DocNode> = [
    {
      title: t('doc.colTitle'), dataIndex: 'title', key: 'title', ellipsis: true, width: 300,
      render: (v: string, r) => (
        <a onClick={() => navigate(`/doc-center/detail?id=${r.id}`)}>{v}</a>
      ),
    },
    { title: t('doc.colSpace'), dataIndex: 'spaceName', key: 'spaceName', width: 110 },
    { title: t('doc.colCategory'), dataIndex: 'category', key: 'category', width: 110, ellipsis: true },
    {
      title: t('doc.colType'), dataIndex: 'docType', key: 'docType', width: 100,
      render: (v: DocType) => <Tag>{t(`doc.type.${v}`)}</Tag>,
    },
    {
      title: t('doc.colStatus'), dataIndex: 'status', key: 'status', width: 90,
      render: (v: DocStatus) => <Tag color={DOC_STATUS_COLOR[v]}>{t(`doc.status.${v}`)}</Tag>,
    },
    {
      title: t('doc.colTags'), dataIndex: 'tags', key: 'tags', width: 150,
      render: (v: string[]) => (
        <Space size={4} wrap>{v.map(tag => <Tag key={tag} color="blue">{tag}</Tag>)}</Space>
      ),
    },
    {
      title: t('doc.colBiz'), dataIndex: 'bizLabel', key: 'bizLabel', width: 160, ellipsis: true,
      render: (v: string | undefined, r) => (
        r.bizType === 'REQ' && r.bizId
          ? <a onClick={() => navigate(`/rdm-detail?id=${r.bizId}`)}>{v}</a>
          : '-'
      ),
    },
    { title: t('doc.colOwner'), dataIndex: 'ownerName', key: 'ownerName', width: 100 },
    { title: t('doc.colUpdated'), dataIndex: 'updatedAt', key: 'updatedAt', width: 150 },
    {
      title: t('doc.colAction'), key: 'action', width: 230, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => navigate(`/doc-center/detail?id=${r.id}`)}>{t('doc.view')}</Button>
          <Button type="link" size="small" onClick={() => window.open(r.tencentUrl, '_blank', 'noopener')}>{t('doc.openDoc')}</Button>
          {canEdit && (
            <Button type="link" size="small" onClick={() => navigate(`/doc-center/edit?id=${r.id}`)}>{t('doc.edit')}</Button>
          )}
          {canEdit && (
            <Button type="link" size="small" danger onClick={() => handleDelete(r)}>{t('doc.del')}</Button>
          )}
        </Space>
      ),
    },
  ]

  const columns = applyConfig(rawColumns)
  const pagination = { showSizeChanger: true, showQuickJumper: true, pageSize: 20, showTotal: (n: number) => t('doc.total', { n }) }
  // 口徑快照：條件變更時重新觸發統計卡計數動畫
  const statsKey = JSON.stringify(buildQuery())

  const statItems: StatItem[] = [
    { icon: <FileTextOutlined />, color: '#1890FF', bg: '#E6F7FF', value: stats?.total ?? 0, label: t('doc.statTotal'), hint: t('doc.statTotalHint') },
    { icon: <CheckCircleOutlined />, color: '#52C41A', bg: '#F6FFED', value: stats?.published ?? 0, label: t('doc.statPublished'), hint: t('doc.statPublishedHint') },
    { icon: <HistoryOutlined />, color: '#E8720C', bg: '#FFF7E6', value: stats?.updatedThisMonth ?? 0, label: t('doc.statUpdated'), hint: t('doc.statUpdatedHint') },
    { icon: <LinkOutlined />, color: '#722ED1', bg: '#F9F0FF', value: stats?.linkedReq ?? 0, label: t('doc.statLinked'), hint: t('doc.statLinkedHint') },
  ]

  const statusOptions = DOC_STATUS_VALUES.map(v => ({ value: v, label: t(`doc.status.${v}`) }))
  const typeOptions = DOC_TYPE_VALUES.map(v => ({ value: v, label: t(`doc.type.${v}`) }))

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      <div className="doc-container">
        {/* 左側：空間樹面板（樣式對齊部門架構/分類庫） */}
        <div className="doc-tree-panel">
          <h3 className="doc-tree-panel-title">
            <ClusterOutlined className="doc-tree-panel-title-icon" />
            {t('doc.spaceTree')}
          </h3>
          <Tree
            treeData={treeData}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys)}
            selectedKeys={spaceId == null ? ['all'] : [String(spaceId)]}
            onSelect={handleTreeSelect}
          />
        </div>

        {/* 右側主區 */}
        <div className="doc-main">
          {/* 搜索區（統計卡必須在其下方） */}
          <div className="search-section">
            <Form form={form} layout="inline">
              <Form.Item label={t('doc.keyword')} name="keyword">
                <Input placeholder={t('doc.keywordPlaceholder')} allowClear style={{ width: 220 }} onPressEnter={loadData} />
              </Form.Item>
              <Form.Item label={t('doc.statusLabel')} name="status">
                <Select placeholder={t('doc.all')} allowClear style={{ width: 120 }} options={statusOptions} />
              </Form.Item>
              <Form.Item label={t('doc.typeLabel')} name="docType">
                <Select placeholder={t('doc.all')} allowClear style={{ width: 130 }} options={typeOptions} />
              </Form.Item>
              <Form.Item>
                <div className="search-actions">
                  <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>{t('doc.search')}</Button>
                  <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('doc.reset')}</Button>
                </div>
              </Form.Item>
            </Form>
          </div>

          {/* 統計卡（§E.8 位於搜索區之後；§B.7：antd 圖標 + 加載占位「—」+ 計數動畫） */}
          <div key={statsKey}>
            <MeetingStatCards loading={loading} items={statItems} />
          </div>

          <div className="action-section">
            <div className="action-section-left">
              <Space>
                <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>{t('doc.export')}</Button>
                <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('doc.gatewayHint')}</span>
              </Space>
            </div>
            <div className="action-section-right">
              {canEdit && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/doc-center/register')}>{t('doc.registerDoc')}</Button>
              )}
              {configComponent}
            </div>
          </div>

          <Table<DocNode>
            rowKey="id"
            columns={columns}
            dataSource={rows}
            loading={loading}
            scroll={{ x: 1400 }}
            pagination={pagination}
            size="middle"
          />
        </div>
      </div>
    </div>
  )
}
