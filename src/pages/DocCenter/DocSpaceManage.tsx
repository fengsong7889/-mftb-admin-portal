/**
 * 空間管理（doc-space 菜單）：知識空間維護 + 騰訊文檔目錄同步與配額查看。
 *
 * 口徑：空間是文檔的知識域分組（需求/人事/行政/制度/培訓…）；
 * 刪除僅影響本系統索引，不觸碰騰訊文檔側正文。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, Modal, Space, Table, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { PlusOutlined, SyncOutlined, DashboardOutlined } from '@ant-design/icons'
import {
  fetchDocSpaces, deleteSpace, syncTencentDocs, fetchTencentQuota,
  type DocSpace,
} from '@/api/docCenter'
import { useAuth } from '@/contexts/AuthContext'
import '@/styles/components.css'

export default function DocSpaceManage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('doc-space:edit')
  const [rows, setRows] = useState<DocSpace[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      setRows(await fetchDocSpaces())
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleDelete = (r: DocSpace) => {
    Modal.confirm({
      title: t('doc.deleteSpaceTitle', { name: r.name }),
      content: t('doc.deleteSpaceContent'),
      okText: t('doc.del'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteSpace(r.id)
          message.success(t('doc.deleted'))
          void loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('doc.deleteFailed'))
        }
      },
    })
  }

  /** 手動同步騰訊文檔目錄：個人開發者 2000 次/天配額，入口保持手動，定時化在 P1 */
  const handleSync = async () => {
    setSyncing(true)
    try {
      const r = await syncTencentDocs()
      message.success(t('doc.syncDone', { created: r.created, updated: r.updated, skipped: r.skipped }))
      void loadData()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.syncFailed'))
    } finally {
      setSyncing(false)
    }
  }

  const handleQuota = async () => {
    try {
      const q = await fetchTencentQuota()
      Modal.info({
        title: t('doc.quotaTitle'),
        width: 560,
        content: <pre style={{ maxHeight: 320, overflow: 'auto', margin: 0 }}>{JSON.stringify(q, null, 2)}</pre>,
      })
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('doc.quotaFailed'))
    }
  }

  const columns: TableColumnsType<DocSpace> = [
    { title: t('doc.colIcon'), dataIndex: 'icon', key: 'icon', width: 70, align: 'center' },
    { title: t('doc.colName'), dataIndex: 'name', key: 'name', width: 200 },
    { title: t('doc.colSort'), dataIndex: 'sort', key: 'sort', width: 80, align: 'right' },
    { title: t('doc.colDesc'), dataIndex: 'description', key: 'description', ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t('doc.colAction'), key: 'action', width: 130,
      render: (_, r) => canEdit ? (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => navigate(`/doc-space/form?id=${r.id}`)}>{t('doc.edit')}</Button>
          <Button type="link" size="small" danger onClick={() => handleDelete(r)}>{t('doc.del')}</Button>
        </Space>
      ) : '-',
    },
  ]

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      <div className="action-section">
        <div className="action-section-left">
          <Space>
            {canEdit && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/doc-space/form')}>{t('doc.newSpace')}</Button>
            )}
            {canEdit && (
              <Button icon={<SyncOutlined spin={syncing} />} loading={syncing} onClick={handleSync}>{t('doc.syncTencent')}</Button>
            )}
            <Button icon={<DashboardOutlined />} onClick={handleQuota}>{t('doc.quotaBtn')}</Button>
          </Space>
        </div>
        <div className="action-section-right">
          <span style={{ fontSize: 12, color: '#8C8C8C' }}>
            {t('doc.syncHint')}
          </span>
        </div>
      </div>

      <Table<DocSpace>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        size="middle"
      />
    </div>
  )
}
