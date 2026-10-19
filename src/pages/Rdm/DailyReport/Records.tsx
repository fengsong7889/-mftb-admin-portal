import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { fetchDailyReportRecords, type DailyReportRecord } from '../../../api/rdmDailyReport'
import '../index.css'

/**
 * 進度日報 > 發送記錄（只读）。
 *
 * <p>只展示事实：哪天哪档、由哪条规则/哪个项目（哪个迭代）发出、推了几次、谁触发的。
 * 「查看日報」直接跳移动端日报页（/rdm-daily?date&type）——那页读的就是同一份快照，
 * 因此记录与内容永远一致，不需要在这里再实现一套快照渲染。
 *
 * <p>为什么 pushCount 会大于 1：手动补发写的是 report_type='manual' 行，同一天重复补发
 * 会累加次数并覆盖同一行（同一范围），既不会被定时幂等拦住，也不会产生多份互相矛盾的快照。
 */
export default function DailyReportRecords() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rows, setRows] = useState<DailyReportRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setRows(await fetchDailyReportRecords(120))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const columns: TableColumnsType<DailyReportRecord> = [
    { title: t('rdm.dailyRecord.colDate'), dataIndex: 'reportDate', key: 'reportDate', width: 115 },
    {
      title: t('rdm.dailyRecord.colType'), dataIndex: 'reportType', key: 'reportType', width: 100,
      render: (v: string) => <Tag color={v === 'manual' ? 'blue' : v === 'evening' ? 'purple' : 'gold'}>
        {v === 'manual' ? t('rdm.dailyRecord.typeManual')
          : v === 'evening' ? t('rdm.dailyRecord.typeEvening') : t('rdm.dailyRecord.typeMorning')}
      </Tag>,
    },
    {
      title: t('rdm.dailyRecord.colRule'), key: 'rule', width: 160,
      render: (_, r) => r.ruleName
        ? <span>{r.ruleName}</span>
        : <span style={{ color: '#bfbfbf' }}>{t('rdm.dailyRecord.noRule')}</span>,
    },
    {
      title: t('rdm.dailyRecord.colTarget'), key: 'target', width: 260,
      render: (_, r) => (
        <Space size={4} wrap>
          <span style={{ fontSize: 12 }}>
            {r.projectNo ? `${r.projectNo} ` : ''}{r.projectName ?? (r.projectId ? `#${r.projectId}` : '—')}
          </span>
          <Tag color={r.iterationCode ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
            {r.iterationCode || t('rdm.dailyRecord.allIterations')}
          </Tag>
        </Space>
      ),
    },
    {
      title: t('rdm.dailyRecord.colProjectCount'), dataIndex: 'projectCount', key: 'projectCount', width: 90,
      render: (v: number | null) => v ?? '—',
    },
    {
      title: t('rdm.dailyRecord.colPersonalCount'), dataIndex: 'personalCount', key: 'personalCount', width: 100,
      render: (v: number | null) => v ?? '—',
    },
    {
      title: t('rdm.dailyRecord.colPushCount'), dataIndex: 'pushCount', key: 'pushCount', width: 100,
      render: (v: number | null) => (v && v > 1
        ? <Tag color="orange">{t('rdm.dailyRecord.pushTimes', { count: v })}</Tag>
        : (v ?? '—')),
    },
    {
      title: t('rdm.dailyRecord.colTrigger'), key: 'trigger', width: 150,
      render: (_, r) => (
        <Space size={4}>
          <Tag color={r.triggerType === 'manual' ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
            {r.triggerType === 'manual' ? t('rdm.dailyRecord.triggerManual') : t('rdm.dailyRecord.triggerSchedule')}
          </Tag>
          {r.triggerBy && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{r.triggerBy}</span>}
        </Space>
      ),
    },
    {
      title: t('rdm.dailyRecord.colLastPushAt'), dataIndex: 'lastPushAt', key: 'lastPushAt', width: 165,
      render: (v: string | null) => v ?? '—',
    },
    {
      title: t('rdm.dailyRecord.colActions'), key: 'actions', width: 110, fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" icon={<EyeOutlined />}
          // 带上 projectId：同一天同一档位可能有多份快照，不带会打开别的项目的日报
          onClick={() => navigate(`/rdm-daily?date=${r.reportDate}&type=${r.reportType}`
            + (r.projectId == null ? '' : `&projectId=${r.projectId}`))}>
          {t('rdm.dailyRecord.viewReport')}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {error && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message={t('rdm.dailyRecord.loadFailed')}
          description={error} action={<Button size="small" onClick={() => void load()}>{t('rdm.dailyRecord.retry')}</Button>} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('rdm.dailyRecord.hint')}</span>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          {t('rdm.dailyRecord.refresh')}
        </Button>
      </div>
      <Table rowKey="id" size="small" loading={loading} columns={columns} dataSource={rows}
        scroll={{ x: 1300 }}
        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: total => t('rdm.dailyRecord.totalRows', { total }) }} />
    </div>
  )
}
