/**
 * 假勤工作台（考勤假勤系统首页）
 *
 * 定位：只展示口径真实的指标与待办提醒，所有跳转指向本系统的功能页或流程中心，
 * 不在本页复制任何审批操作区（遵守「流程入口统一」原则）。
 *
 * 数据口径：
 * - 指标全部来自服务端已落库的结论表，不在前端重算；
 * - `stats.calculated === false` 表示当日还没跑过日汇总，界面必须显式提示，
 *   否则「应出勤 0 人」会被读成"今天没人上班"而不是"还没算"；
 * - 预警是后端下发的结构化数据（key + level + path + params），句子由 i18n 模板拼，
 *   这样五种语言都覆盖得到。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Select, Space, Table, Tag, TreeSelect } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  AimOutlined, CheckCircleOutlined, ClockCircleOutlined, ReloadOutlined, SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import {
  EXCEPTION_STATUS, fetchExceptions, fetchWorkbenchOverview,
  type ExceptionVO, type WorkbenchAlert, type WorkbenchOverview,
} from '../../api/attendance'
import {
  EXCEPTION_STATUS_LABEL_KEY, EXCEPTION_STATUS_TAG_COLOR, EXCEPTION_TYPE_LABEL_KEY,
  EXCEPTION_TYPE_TAG_COLOR, WORKBENCH_ALERT_KEY,
} from './meta'
import { useAttendanceOptions } from './useAttendanceOptions'
import '@/styles/components.css'

/** 待办异常只取最近 N 条：工作台是导航页，不是异常列表页，全量渲染会盖过指标 */
const PENDING_LIMIT = 10

interface FilterValues {
  date?: Dayjs
  deptId?: number
  groupId?: number
}

export default function AttendanceWorkbench() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { groupOptions, deptTree } = useAttendanceOptions()

  const [form] = Form.useForm<FilterValues>()
  const [overview, setOverview] = useState<WorkbenchOverview | null>(null)
  const [pending, setPending] = useState<ExceptionVO[]>([])
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({ date: dayjs() })

  const load = useCallback(async () => {
    setLoading(true)
    const date = (filters.date ?? dayjs()).format('YYYY-MM-DD')
    try {
      const [summary, exceptions] = await Promise.all([
        fetchWorkbenchOverview({ date, rangeFrom: dayjs(date).startOf('month').format('YYYY-MM-DD'), rangeTo: date }),
        fetchExceptions({
          page: 1,
          size: PENDING_LIMIT,
          from: dayjs(date).startOf('month').format('YYYY-MM-DD'),
          to: date,
          deptId: filters.deptId,
          groupId: filters.groupId,
          status: EXCEPTION_STATUS.PENDING,
        }),
      ])
      setOverview(summary)
      setPending(exceptions.records ?? [])
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
      setOverview(null)
      setPending([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleSearch = () => setFilters(form.getFieldsValue())
  const handleReset = () => {
    form.resetFields()
    form.setFieldValue('date', dayjs())
    setFilters({ date: dayjs() })
  }

  /** 预警文案：后端只给 params，句子在这里按 i18n 模板拼 */
  const alertText = (alert: WorkbenchAlert) => {
    const key = WORKBENCH_ALERT_KEY[alert.key]
    return key ? t(key, alert.params) : alert.key
  }

  const stats = overview?.stats
  const statsKey = useMemo(
    () => `${overview?.date ?? ''}-${filters.deptId ?? ''}-${filters.groupId ?? ''}`,
    [overview?.date, filters.deptId, filters.groupId],
  )

  const columns: TableColumnsType<ExceptionVO> = [
    { title: t('attendance.colWorkDate'), dataIndex: 'workDate', key: 'workDate', width: 120 },
    { title: t('attendance.colEmpNo'), dataIndex: 'empNo', key: 'empNo', width: 110 },
    { title: t('attendance.colEmpName'), dataIndex: 'empName', key: 'empName', width: 100 },
    { title: t('attendance.colDept'), dataIndex: 'deptName', key: 'deptName', width: 140, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t('attendance.colGroup'), dataIndex: 'groupName', key: 'groupName', width: 180, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t('attendance.colExceptionType'), dataIndex: 'exceptionType', key: 'exceptionType', width: 110,
      render: (v: number) => {
        const key = EXCEPTION_TYPE_LABEL_KEY[v]
        return <Tag color={EXCEPTION_TYPE_TAG_COLOR[v] ?? 'default'}>{key ? t(key) : v}</Tag>
      },
    },
    { title: t('attendance.colExceptionDetail'), dataIndex: 'detail', key: 'detail', ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t('attendance.colHandleStatus'), dataIndex: 'status', key: 'status', width: 120,
      render: (v: number) => {
        const key = EXCEPTION_STATUS_LABEL_KEY[v]
        return <Tag color={EXCEPTION_STATUS_TAG_COLOR[v] ?? 'default'}>{key ? t(key) : v}</Tag>
      },
    },
    {
      title: t('common.colAction'), key: 'action', width: 100, fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" onClick={() => navigate(`/attendance-exception-handle?id=${record.id}`)}>
          {t('attendance.handleAction')}
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          message={t('common.loadFailed')}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={load}>{t('common.reset')}</Button>}
        />
      )}
      {/* 未重算时必须显式说明：0 人应出勤与"还没算"是两件事，混在一起会让人以为今天全员休息 */}
      {stats && stats.calculated === false && (
        <Alert
          type="warning"
          showIcon
          message={t('attendance.notCalculatedHint', { date: overview?.date ?? '' })}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" type="primary" onClick={() => navigate('/attendance-daily')}>
              {t('attendance.goRecalculate')}
            </Button>
          }
        />
      )}

      <div className="search-section">
        <Form form={form} layout="inline" initialValues={{ date: dayjs() }}>
          <Form.Item label={t('attendance.workbenchDate')} name="date">
            <DatePicker allowClear={false} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label={t('attendance.colDept')} name="deptId">
            <TreeSelect
              treeData={deptTree}
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder={t('common.all')}
              style={{ width: 180 }}
            />
          </Form.Item>
          <Form.Item label={t('attendance.colGroup')} name="groupId">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 200 }}
              options={groupOptions}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>{t('common.search')}</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>{t('common.reset')}</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 统计卡片：搜索区之后、操作区之前（规范 §E.8） */}
      <div style={{ marginBottom: 16 }}>
        <StatCards
          animationKey={statsKey}
          items={[
            { key: 'should', icon: <AimOutlined />, color: 'info', value: stats?.shouldAttend ?? 0, label: t('attendance.statWbShould') },
            { key: 'punched', icon: <CheckCircleOutlined />, color: 'success', value: stats?.punched ?? 0, label: t('attendance.statWbPunched') },
            { key: 'pending', icon: <WarningOutlined />, color: 'brand', value: stats?.pendingExceptions ?? 0, label: t('attendance.statWbPending') },
            { key: 'range', icon: <ClockCircleOutlined />, color: 'system', value: stats?.rangeExceptions ?? 0, label: t('attendance.statWbRange') },
          ]}
        />
      </div>

      {/* 预警区：level=warn 用 warning 横幅，info 用普通横幅；点按钮直接跳到能处理它的页面 */}
      {(overview?.alerts ?? []).length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            {(overview?.alerts ?? []).map(alert => (
              <Alert
                key={alert.key}
                type={alert.level === 'warn' ? 'warning' : 'info'}
                showIcon
                message={alertText(alert)}
                action={
                  <Button size="small" type="link" onClick={() => navigate(alert.path)}>
                    {t('attendance.alertGoHandle')}
                  </Button>
                }
              />
            ))}
          </Space>
        </div>
      )}

      <div className="action-section">
        <div className="action-section-left">
          <b>{t('attendance.workbenchPendingTitle')}</b>
          <span style={{ marginLeft: 8, fontSize: 12, color: '#8C8C8C' }}>
            {t('attendance.workbenchPendingHint', { date: overview?.date ?? dayjs().format('YYYY-MM-DD') })}
          </span>
        </div>
        <div className="action-section-right">
          <Button type="link" onClick={() => navigate('/attendance-exception')}>
            {t('attendance.workbenchViewAll')}
          </Button>
        </div>
      </div>

      <Table<ExceptionVO>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={pending}
        scroll={{ x: 1200 }}
        size="middle"
        pagination={false}
        locale={{ emptyText: t('attendance.workbenchNoPending') }}
      />
    </div>
  )
}
