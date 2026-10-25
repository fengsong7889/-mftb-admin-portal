/**
 * 我的待签收（P1a）：只返回后端 SQL 内已按 ACL/密级过滤的待签收制度。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, Space, Table, Tag, message } from 'antd'
import dayjs from 'dayjs'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  DOC_CONFIDENTIALITY_COLOR, fetchPendingAcks, formatDocKnowledgeTime,
  type DocPendingAck,
} from '@/api/docKnowledge'
import { DocPlanSectionTitle } from './docPlanUi'
import { docPlanCardStyle } from './docPlanStyle'

const CONFIDENTIALITY_KEY: Record<number, string> = {
  1: 'public', 2: 'internal', 3: 'sensitive', 4: 'restricted',
}

export default function DocMyAcks() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<DocPendingAck[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(20)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (targetPage = page) => {
    setLoading(true)
    try {
      const result = await fetchPendingAcks(targetPage, size)
      setRows(result.records)
      setTotal(result.total)
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('docKnowledge.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, size, t])

  useEffect(() => { void load() }, [load])

  const columns: ColumnsType<DocPendingAck> = [
    {
      title: t('docKnowledge.colTitle'), dataIndex: 'title', ellipsis: true,
      render: (value: string, row) => (
        <a onClick={() => navigate(`/doc-center/knowledge?id=${row.nodeId}${row.revisionId ? `&revision=${row.revisionId}` : ''}`)}>
          {value}
        </a>
      ),
    },
    { title: t('docKnowledge.colSpace'), dataIndex: 'spaceName', width: 140 },
    {
      title: t('docKnowledge.colConfidentiality'), dataIndex: 'confidentiality', width: 110,
      render: (value: number) => (
        <Tag color={DOC_CONFIDENTIALITY_COLOR[value as 1 | 2 | 3 | 4]}>
          {t(`docKnowledge.confidentiality.${CONFIDENTIALITY_KEY[value] ?? 'internal'}`)}
        </Tag>
      ),
    },
    {
      title: t('docKnowledge.myAcksDue'), dataIndex: 'dueAt', width: 180,
      render: (value?: string | null) => value ? (
        <Space size={4}>
          <span>{value}</span>
          {dayjs(value).isBefore(dayjs(), 'day') && <Tag color="red">{t('docKnowledge.ackOverdue')}</Tag>}
        </Space>
      ) : t('docKnowledge.ackNoDue'),
    },
    {
      title: t('docKnowledge.myAcksUpdated'), dataIndex: 'updatedAt', width: 170,
      render: (value: string | number) => formatDocKnowledgeTime(value),
    },
    {
      title: t('docKnowledge.colAction'), width: 90,
      render: (_, row) => (
        <Button type="link" size="small"
          onClick={() => navigate(`/doc-center/knowledge?id=${row.nodeId}${row.revisionId ? `&revision=${row.revisionId}` : ''}`)}>
          {t('docKnowledge.view')}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message={t('docKnowledge.myAcksTitle')} description={t('docKnowledge.myAcksHint')} />
      <div style={docPlanCardStyle}>
        <DocPlanSectionTitle icon={<ReloadOutlined />} title={t('docKnowledge.myAcksTitle')} />
        <Space style={{ marginBottom: 12 }}>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>{t('docKnowledge.reload')}</Button>
        </Space>
        <Table rowKey="nodeId" size="middle" dataSource={rows} columns={columns} loading={loading}
          scroll={{ x: 900 }}
          pagination={{
            current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
            onChange: (nextPage, nextSize) => { setPage(nextPage); setSize(nextSize) },
          }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('docKnowledge.myAcksEmpty')} /> }} />
      </div>
    </div>
  )
}
