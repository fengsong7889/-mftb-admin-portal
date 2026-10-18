import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Select, Space, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { fetchHrAudit } from '@/api/hrAudit'
import type { HrAuditItem } from '@/api/hrAudit'
import { HR_AUDIT_ACTION_LABEL_KEY } from './hrAuditMeta'

interface Props {
  userId: number
}

/**
 * 员工档案的「人事操作記錄」。
 *
 * 它是审计唯一的按人入口：花名册看的是「这个人现在是什么」，这里看的是
 * 「这个人被动过什么、谁动的、哪张单子批的」（方案 §5.5 要求与账号登录日志分开）。
 * 值已在服务端写入时脱敏，界面不提供任何「显示原文」的开关。
 */
export default function HrAuditTrail({ userId }: Props) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<HrAuditItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [action, setAction] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const data = await fetchHrAudit({ userId, action, page, pageSize })
      setRows(data.records ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setFailed(true)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [userId, action, page, pageSize])

  useEffect(() => {
    void load()
  }, [load])

  const columns: TableColumnsType<HrAuditItem> = [
    {
      title: t('hrAudit.colOccurred'),
      dataIndex: 'occurredAt',
      key: 'occurredAt',
      width: 165,
      render: (v?: string | null) =>
        v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : <Typography.Text type="warning">{t('hrAudit.timeMissing')}</Typography.Text>,
    },
    {
      title: t('hrAudit.colAction'),
      dataIndex: 'action',
      key: 'action',
      width: 150,
      render: (v: string, r) => (
        <Space size={4}>
          <Tag color={r.sensitive === 1 ? 'orange' : 'default'}>
            {t(HR_AUDIT_ACTION_LABEL_KEY[v] ?? 'hrAudit.action.UNKNOWN')}
          </Tag>
        </Space>
      ),
    },
    {
      title: t('hrAudit.colField'),
      dataIndex: 'fieldName',
      key: 'fieldName',
      width: 150,
      render: (v?: string | null) => (v ? <Typography.Text code>{v}</Typography.Text> : '-'),
    },
    {
      title: t('hrAudit.colChange'),
      key: 'change',
      render: (_: unknown, r) => {
        if (!r.fieldName) return r.detail || '-'
        const before = r.beforeValue ?? '-'
        const after = r.afterValue ?? '-'
        return (
          <Typography.Text>
            {before}
            {' → '}
            {after}
          </Typography.Text>
        )
      },
    },
    {
      title: t('hrAudit.colEffective'),
      dataIndex: 'effectiveDate',
      key: 'effectiveDate',
      width: 120,
      render: (v?: string | null) => v || '-',
    },
    {
      title: t('hrAudit.colSource'),
      dataIndex: 'sourceReqNo',
      key: 'sourceReqNo',
      width: 130,
      render: (v?: string | null) => v || '-',
    },
    {
      title: t('hrAudit.colReason'),
      dataIndex: 'reason',
      key: 'reason',
      width: 160,
      render: (v?: string | null) => v || '-',
    },
    {
      title: t('hrAudit.colOperator'),
      dataIndex: 'operator',
      key: 'operator',
      width: 120,
      render: (v?: string | null) => v || '-',
    },
  ]

  return (
    <div>
      <Space size={8} wrap style={{ marginBottom: 12 }}>
        <Select
          allowClear
          style={{ width: 190 }}
          placeholder={t('hrAudit.actionPlaceholder')}
          value={action}
          onChange={value => {
            setAction(value)
            // 换筛选条件必须回到第一页，否则会停在旧页码上看到「没有数据」
            setPage(1)
          }}
          options={Object.entries(HR_AUDIT_ACTION_LABEL_KEY)
            .filter(([key]) => key !== 'UNKNOWN')
            .map(([key, labelKey]) => ({ value: key, label: t(labelKey) }))}
        />
        <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          {t('hrAudit.refresh')}
        </Button>
      </Space>

      {failed && (
        <Alert
          type="error"
          showIcon
          message={t('hrAudit.loadFailed')}
          action={<Button size="small" onClick={() => void load()}>{t('hrAudit.retry')}</Button>}
          style={{ marginBottom: 12 }}
        />
      )}

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        // 失败时表体只给「暂无数据」，错误文案靠上方 Alert：同一段字写两遍会让读的人
        // 以为是两条不同信息，也让测试无法唯一定位
        locale={{ emptyText: failed ? t('common.noData') : t('hrAudit.empty') }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count) => t('common.total', { count }),
          onChange: (nextPage, nextSize) => {
            setPage(nextPage)
            setPageSize(nextSize ?? 10)
          },
        }}
      />
    </div>
  )
}
