import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Table, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { fetchEmploymentPeriods } from '@/api/hrEmployment'
import type { EmploymentPeriodItem } from '@/api/hrEmployment'

interface Props {
  userId: number
}

/**
 * 雇佣期间（员工档案「雇佣与任职」的第一块）。
 *
 * 它回答的是「这是他第几次被雇佣、这一段从哪天到哪天、什么时候转正」——
 * 这些信息在账号快照与逐条异动记录里都拿不到（离职再入职会被连成一段连续任职）。
 *
 * 双轨期间这里可能是空的，空不是错误：雇佣期间只能由任职事实派生并经 HR 在
 * 「雇佣數據核對」清单确认后登记，所以空态直接把下一步写清楚，而不是显示一句「暂无数据」。
 */
export default function EmploymentPeriods({ userId }: Props) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<EmploymentPeriodItem[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      setRows(await fetchEmploymentPeriods(userId))
    } catch {
      setFailed(true)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const columns: TableColumnsType<EmploymentPeriodItem> = [
    { title: t('hrEmployment.periodSeq'), dataIndex: 'periodSeq', key: 'periodSeq', width: 90 },
    {
      title: t('common.colStatus'),
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => (v === 'ACTIVE'
        ? <Tag color="success">{t('hrEmployment.periodActive')}</Tag>
        : <Tag>{t('hrEmployment.periodEnded')}</Tag>),
    },
    {
      title: t('hrEmployment.periodStart'),
      dataIndex: 'startDate',
      key: 'startDate',
      width: 170,
      render: (v: string | null, r) => (v
        ? <span style={{ whiteSpace: 'nowrap' }}>{v}<Tag style={{ marginLeft: 6 }}>{t(`hrEmployment.source.${r.startDateSource}`)}</Tag></span>
        : <Tag color="warning">{t('hrEmployment.startUnknown')}</Tag>),
    },
    { title: t('hrEmployment.periodRegular'), dataIndex: 'regularDate', key: 'regularDate', width: 120, render: (v: string) => v || '-' },
    { title: t('hrEmployment.periodEnd'), dataIndex: 'endDate', key: 'endDate', width: 120, render: (v: string) => v || '-' },
    { title: t('employee.colEmployerCompany'), dataIndex: 'employerCompany', key: 'employerCompany', render: (v: string) => v || '-' },
    { title: t('employee.colWorkLocation'), dataIndex: 'workLocation', key: 'workLocation', width: 110, render: (v: string) => v || '-' },
    { title: t('employee.colEmployeeCategory'), dataIndex: 'employeeCategory', key: 'employeeCategory', width: 110, render: (v: string) => v || '-' },
  ]

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text strong>{t('hrEmployment.periodSectionTitle')}</Typography.Text>
        <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
          {t('hrEmployment.refresh')}
        </Button>
      </div>

      {failed && (
        <Alert
          type="error"
          showIcon
          message={t('hrEmployment.periodLoadFailed')}
          action={<Button size="small" onClick={() => void load()}>{t('hrEmployment.retry')}</Button>}
          style={{ marginBottom: 8 }}
        />
      )}
      {!failed && rows.length === 0 && !loading && (
        <Alert type="info" showIcon message={t('hrEmployment.periodEmpty')} style={{ marginBottom: 8 }} />
      )}

      <Table
        size="small"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        scroll={{ x: 'max-content' }}
        pagination={false}
      />
    </div>
  )
}
