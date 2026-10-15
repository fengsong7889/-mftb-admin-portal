/**
 * 學習路徑（doc-learning 菜單）：新人入職包/培訓清單的策展列表。
 *
 * 口徑：路徑 = 有序文檔集合；「我的完成度」= 本人已讀條目數（該文檔存在你的打開留痕）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Form, Input, Modal, Progress, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, ReloadOutlined, PlusOutlined } from '@ant-design/icons'
import { fetchLearningPaths, deleteLearningPath, type DocLearningPathRow } from '@/api/docCenter'
import { useColumnConfig } from '@/hooks/useColumnConfig'
import { useAuth } from '@/contexts/AuthContext'
import '@/styles/components.css'

interface FilterValues {
  keyword?: string
}

export default function DocLearning() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('doc-learning:edit')
  const [form] = Form.useForm<FilterValues>()
  const [rows, setRows] = useState<DocLearningPathRow[]>([])
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const v = form.getFieldsValue()
      setRows(await fetchLearningPaths(v.keyword))
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [form, t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleReset = () => {
    form.resetFields()
    setTimeout(loadData, 0)
  }

  const handleDelete = (r: DocLearningPathRow) => {
    Modal.confirm({
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      title: t('doc.deletePathTitle', { name: r.name }),
      content: t('doc.deletePathContent'),
      okText: t('doc.del'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteLearningPath(r.id)
          message.success(t('doc.deleted'))
          void loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('doc.deleteFailed'))
        }
      },
    })
  }

  /* ===== 列定義 ===== */
  const allColumnMeta = useMemo(() => ([
    { key: 'name', title: t('doc.learnColName') },
    { key: 'description', title: t('doc.colDesc') },
    { key: 'itemCount', title: t('doc.learnColItems') },
    { key: 'myProgress', title: t('doc.learnColMyProgress') },
    { key: 'status', title: t('doc.colStatus') },
    { key: 'updatedAt', title: t('doc.colUpdated') },
    { key: 'action', title: t('doc.colAction') },
  ]), [t])

  const { configComponent, applyConfig } = useColumnConfig('doc-learning', allColumnMeta, [
    { key: 'action', locked: 'tail' },
  ])

  const rawColumns: TableColumnsType<DocLearningPathRow> = [
    {
      title: t('doc.learnColName'), dataIndex: 'name', key: 'name', width: 240, ellipsis: true,
      render: (v: string, r) => (
        <a onClick={() => navigate(`/doc-learning/detail?id=${r.id}`)}>{v}</a>
      ),
    },
    { title: t('doc.colDesc'), dataIndex: 'description', key: 'description', ellipsis: true, render: (v?: string) => v || '-' },
    { title: t('doc.learnColItems'), dataIndex: 'itemCount', key: 'itemCount', width: 100, align: 'right' },
    {
      title: t('doc.learnColMyProgress'), key: 'myProgress', width: 200,
      render: (_, r) => {
        const percent = r.itemCount === 0 ? 0 : Math.round((r.myReadCount / r.itemCount) * 100)
        return (
          <Space size={8} style={{ width: '100%' }}>
            <Progress percent={percent} size="small" strokeColor="#E8720C" style={{ width: 110, margin: 0 }} />
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{r.myReadCount}/{r.itemCount}</span>
          </Space>
        )
      },
    },
    {
      title: t('doc.colStatus'), dataIndex: 'status', key: 'status', width: 90,
      render: (v: number) => (v === 1
        ? <Tag color="green">{t('doc.statusOn')}</Tag>
        : <Tag>{t('doc.statusOff')}</Tag>),
    },
    { title: t('doc.colUpdated'), dataIndex: 'updatedAt', key: 'updatedAt', width: 160 },
    {
      title: t('doc.colAction'), key: 'action', width: 180, fixed: 'right',
      render: (_, r) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => navigate(`/doc-learning/detail?id=${r.id}`)}>{t('doc.view')}</Button>
          {canEdit && (
            <Button type="link" size="small" onClick={() => navigate(`/doc-learning/form?id=${r.id}`)}>{t('doc.edit')}</Button>
          )}
          {canEdit && (
            <Button type="link" size="small" danger onClick={() => handleDelete(r)}>{t('doc.del')}</Button>
          )}
        </Space>
      ),
    },
  ]

  const columns = applyConfig(rawColumns)
  const pagination = {
    showSizeChanger: true, showQuickJumper: true, pageSize: 20,
    pageSizeOptions: ['10', '20', '50', '100'],
    showTotal: (n: number) => t('doc.total', { n }),
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {/* 搜索區 */}
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('doc.keyword')} name="keyword">
            <Input placeholder={t('doc.learnKeywordPlaceholder')} allowClear style={{ width: 240 }} onPressEnter={loadData} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={loadData}>{t('doc.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('doc.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Space>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('doc.progressHint')}</span>
          </Space>
        </div>
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/doc-learning/form')}>{t('doc.addPath')}</Button>
          )}
          {configComponent}
        </div>
      </div>

      <Table<DocLearningPathRow>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 1150 }}
        pagination={pagination}
        size="middle"
      />
    </div>
  )
}
