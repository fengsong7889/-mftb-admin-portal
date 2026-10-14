/**
 * 學習路徑詳情（/doc-learning/detail?id=）：我的完成度 + 有序學習清單。
 *
 * 「已讀」口徑：該文檔存在本人的打開留痕（詳情頁打開即寫入），與閱讀統計同源；
 * 從文檔詳情返回後本頁重新掛載即刷新狀態，無需額外輪詢。
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Alert, Button, Progress, Space, Spin, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { CheckCircleOutlined, CompassOutlined, FileTextOutlined } from '@ant-design/icons'
import DetailPageHeader from '@/components/DetailPageHeader'
import DocSectionCard from './DocSectionCard'
import { useAuth } from '@/contexts/AuthContext'
import { fetchLearningPathDetail, type DocLearningPathDetail, type DocLearningPathItem } from '@/api/docCenter'
import '@/styles/components.css'

/** 文檔狀態整型 → Tag 顏色（與 docCenter 的字符串枚舉同口徑） */
const STATUS_COLOR_INT: Record<number, string> = { 1: 'default', 2: 'orange', 3: 'green', 4: 'purple' }

/** ID 校驗：僅接受正整數，防無效深鏈打進接口 */
function parseId(raw: string | null): number | undefined {
  if (!raw || !/^[1-9]\d*$/.test(raw)) return undefined
  return Number(raw)
}

export default function DocLearningDetail() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('doc-learning:edit')
  const [params] = useSearchParams()
  const id = parseId(params.get('id'))

  const [detail, setDetail] = useState<DocLearningPathDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      setError(t('doc.pathMissingId'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const d = await fetchLearningPathDetail(id)
      if (!d) {
        setDetail(null)
        setError(t('doc.loadPathFailed'))
        return
      }
      setDetail(d)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t('doc.loadPathFailed'))
    } finally {
      setLoading(false)
    }
  }, [id, t])

  useEffect(() => {
    void load()
  }, [load])

  const columns: TableColumnsType<DocLearningPathItem> = [
    {
      title: t('doc.learnColOrder'), key: 'order', width: 70, align: 'center',
      render: (_, __, index) => <span style={{ fontWeight: 600, color: '#8C8C8C' }}>{index + 1}</span>,
    },
    {
      title: t('doc.colTitle'), dataIndex: 'title', key: 'title', ellipsis: true,
      render: (v: string, r) => (
        <a onClick={() => navigate(`/doc-center/detail?id=${r.nodeId}`)}>{v}</a>
      ),
    },
    { title: t('doc.colSpace'), dataIndex: 'spaceName', key: 'spaceName', width: 120 },
    { title: t('doc.colType'), dataIndex: 'docTypeLabel', key: 'docTypeLabel', width: 110, render: (v?: string) => <Tag>{v ?? '-'}</Tag> },
    {
      title: t('doc.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: number, r) => <Tag color={STATUS_COLOR_INT[v]}>{r.statusLabel ?? '-'}</Tag>,
    },
    {
      title: t('doc.learnColRead'), dataIndex: 'myRead', key: 'myRead', width: 110,
      render: (v: boolean) => (v
        ? <Tag color="green" icon={<CheckCircleOutlined />}>{t('doc.readDone')}</Tag>
        : <Tag>{t('doc.readPending')}</Tag>),
    },
    { title: t('doc.colReaders'), dataIndex: 'readerCount', key: 'readerCount', width: 110, align: 'right' },
  ]

  if (loading) {
    return (
      <div className="content-area" style={{ padding: '20px 24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="content-area" style={{ padding: '20px 24px' }}>
        <Alert
          type="error"
          showIcon
          message={error ?? t('doc.loadPathFailed')}
          action={<Button size="small" onClick={() => navigate('/doc-learning')}>{t('doc.backToLearning')}</Button>}
        />
      </div>
    )
  }

  const total = detail.items.length
  const done = detail.items.filter(i => i.myRead).length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      <DetailPageHeader
        title={detail.name}
        tags={detail.status === 1
          ? <Tag color="green">{t('doc.statusOn')}</Tag>
          : <Tag>{t('doc.statusOff')}</Tag>}
        meta={detail.description || `${t('doc.learnColItems')} ${total} · ${t('doc.colUpdated')} ${detail.updatedAt}`}
        onBack={() => navigate('/doc-learning')}
        extra={canEdit && (
          <Button type="primary" onClick={() => navigate(`/doc-learning/form?id=${detail.id}`)}>{t('doc.edit')}</Button>
        )}
      />

      <DocSectionCard icon={<CompassOutlined />} color="#fa8c16" bg="#fff7e6" title={t('doc.myProgressTitle')}
        hint={t('doc.progressHint')}>
        <Space size={16} style={{ width: '100%' }}>
          <Progress
            percent={percent}
            strokeColor="#E8720C"
            style={{ width: 320, margin: 0 }}
          />
          <span style={{ fontSize: 13, color: '#595959' }}>
            {t('doc.progressText', { done, total })}
          </span>
        </Space>
      </DocSectionCard>

      <DocSectionCard icon={<FileTextOutlined />} color="#1890ff" bg="#e6f7ff" title={t('doc.contentTitle')}
        hint={t('doc.contentHint')}>
        <Table<DocLearningPathItem>
          rowKey="nodeId"
          columns={columns}
          dataSource={detail.items}
          pagination={false}
          size="middle"
        />
      </DocSectionCard>
    </div>
  )
}
