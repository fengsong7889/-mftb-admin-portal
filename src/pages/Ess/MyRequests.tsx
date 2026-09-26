import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Select, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { fetchMyRequestStats, fetchMyRequests } from '../../api/hrEss'
import { HR_LIFECYCLE_TYPE, type HrLifecycleItem, type HrLifecycleType } from '../../api/hrLifecycle'
import { STATUS_LABEL_KEY, STATUS_TAG_COLOR, TYPE_LABEL_KEY, TYPE_TAG_COLOR } from '../Permission/HrLifecycle/meta'

/** 类型下拉顺序（与人事端入转调离四类 + 续签一致） */
const TYPE_ORDER: HrLifecycleType[] = [
  HR_LIFECYCLE_TYPE.ONBOARD, HR_LIFECYCLE_TYPE.REGULAR,
  HR_LIFECYCLE_TYPE.TRANSFER, HR_LIFECYCLE_TYPE.DIMISSION, HR_LIFECYCLE_TYPE.RENEW,
]

/** 单据可提交审批的状态（与后端 EDITABLE_STATUSES 一致） */
const SUBMITTABLE = ['draft', 'rejected', 'cancelled']

/**
 * 員工自助「我的申請單據」：本人入职/转正/调动/离职/续签单据只读视图。
 * <p>
 * 数据范围由服务端固定为登录人；本页不提供新增与编辑（人事异动由公司侧发起），
 * 仅支持查看进度与跳转到审批流程详情。
 */
export default function MyRequests() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [rows, setRows] = useState<HrLifecycleItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  const [type, setType] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [stats, setStats] = useState<Record<string, number>>({})
  const [form] = Form.useForm<{ type?: string; status?: string }>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchMyRequests({ page, size, type, status })
      setRows(res.records || [])
      setTotal(res.total || 0)
    } catch {
      // 请求层已统一提示
    } finally {
      setLoading(false)
    }
  }, [page, size, type, status])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    fetchMyRequestStats().then(setStats).catch(() => setStats({}))
  }, [])

  const fmtDate = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '-')
  const fmtTime = (v?: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-')

  const columns = useMemo<TableColumnsType<HrLifecycleItem>>(() => [
    { title: t('hrLifecycle.reqNo'), dataIndex: 'reqNo', key: 'reqNo', width: 160, fixed: 'left' },
    {
      title: t('hrLifecycle.type'), dataIndex: 'type', key: 'type', width: 110,
      render: (v: HrLifecycleType) => (
        <Tag color={TYPE_TAG_COLOR[v]}>{TYPE_LABEL_KEY[v] ? t(TYPE_LABEL_KEY[v]) : v}</Tag>
      ),
    },
    {
      title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 110,
      render: (v: string) => (
        <Tag color={STATUS_TAG_COLOR[v as keyof typeof STATUS_TAG_COLOR]}>
          {STATUS_LABEL_KEY[v as keyof typeof STATUS_LABEL_KEY]
            ? t(STATUS_LABEL_KEY[v as keyof typeof STATUS_LABEL_KEY]) : v}
        </Tag>
      ),
    },
    {
      title: t('hrLifecycle.effectiveDate'), key: 'effectiveDate', width: 130,
      render: (_, r) => fmtDate(r.effectiveDate),
    },
    { title: t('hrLifecycle.reason'), dataIndex: 'reason', key: 'reason', width: 220, render: (v: string) => v || '-' },
    {
      title: t('common.colCreateTime'), dataIndex: 'createdAt', key: 'createdAt', width: 175,
      render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{fmtTime(v)}</span>,
    },
    {
      title: t('common.colAction'), key: 'action', width: 160, fixed: 'right',
      render: (_, r) => (
        <Space size={0}>
          {r.flowNo ? (
            <Button type="link" size="small"
              onClick={() => navigate(`/hr-flow-detail?flowNo=${encodeURIComponent(r.flowNo!)}&back=${encodeURIComponent('/ess-requests')}`)}>
              {t('hrLeave.gotoFlowDetail')}
            </Button>
          ) : (
            <span style={{ color: '#8C8C8C', fontSize: 12 }}>{t('hrEss.notSubmittedYet')}</span>
          )}
        </Space>
      ),
    },
  ], [t, navigate])

  return (
    <div className="content-area">
      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('hrLifecycle.type')} name="type">
            <Select
              style={{ width: 160 }} allowClear placeholder={t('common.pleaseSelect')}
              options={TYPE_ORDER.map(key => ({ value: key, label: t(TYPE_LABEL_KEY[key]) }))}
            />
          </Form.Item>
          <Form.Item label={t('common.colStatus')} name="status">
            <Select
              style={{ width: 160 }} allowClear placeholder={t('common.pleaseSelect')}
              options={Object.keys(STATUS_LABEL_KEY).map(key => ({
                value: key, label: `${t(STATUS_LABEL_KEY[key as keyof typeof STATUS_LABEL_KEY])} (${stats[key] ?? 0})`,
              }))}
            />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />}
                onClick={() => { setType(form.getFieldValue('type')); setStatus(form.getFieldValue('status')); setPage(1) }}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => { form.resetFields(); setType(undefined); setStatus(undefined); setPage(1) }}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      <Table<HrLifecycleItem>
        className="nowrap-table"
        columns={columns}
        dataSource={rows}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        expandable={{
          // 明细按类型差异较大，用展开行统一呈现，避免为自助端再造五个详情页
          expandedRowRender: (r) => (
            <Space direction="vertical" size={4} style={{ fontSize: 13 }}>
              <span>{t('hrEss.expandTip')}</span>
              {r.type === HR_LIFECYCLE_TYPE.ONBOARD && (
                <span>{t('hrLifecycle.hireDate')}: {fmtDate(r.effectiveDate)} · {t('hrLifecycle.probationMonths')}: {r.probationMonths ?? '-'}</span>
              )}
              {r.type === HR_LIFECYCLE_TYPE.TRANSFER && (
                <span>{t('hrLifecycle.transferFrom')}: {r.oldDeptName || '-'} / {r.oldPositionName || '-'} → {r.deptName || '-'} / {r.positionName || '-'}</span>
              )}
              {r.type === HR_LIFECYCLE_TYPE.DIMISSION && (
                <span>{t('hrLifecycle.dimissionType')}: {r.dimissionType || '-'} · {t('hrLifecycle.lastWorkDate')}: {fmtDate(r.lastWorkDate)}</span>
              )}
              {r.type === HR_LIFECYCLE_TYPE.RENEW && (
                <span>{t('hrLifecycle.contractNo')}: {r.contractNo || '-'} → {t('hrLifecycle.newContractNo')}: {r.newContractNo || '-'}</span>
              )}
              {r.flowNo && <span>{t('hrLeave.flowNo')}: {r.flowNo}</span>}
              {SUBMITTABLE.includes(r.status) && (
                <span style={{ color: '#8C8C8C' }}>{t('hrEss.submitByHrTip')}</span>
              )}
            </Space>
          ),
        }}
        pagination={{
          current: page, pageSize: size, total, showSizeChanger: true, showQuickJumper: true,
          showTotal: (c) => t('common.total', { count: c }),
          onChange: (p, s) => { setPage(s !== size ? 1 : p); setSize(s) },
        }}
      />
    </div>
  )
}
