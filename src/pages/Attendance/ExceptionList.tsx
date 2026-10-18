/**
 * 考勤异常处理 —— 列表页
 *
 * 边界：本页只做「发现异常 + 指派处理方式 + 回显处理结果」，
 * 补卡/请假/加班等申请一律跳转流程中心发起，审核进度在流程事项查看，
 * 本页不复制审批操作区（遵守流程入口统一原则）。
 *
 * 数据口径：
 * - 列表与统计都走服务端并共用同一套 filters（§E.8）；统计按处理状态分档，
 *   「已抵扣」= 已请假抵扣 + 已加班抵扣两档之和；
 * - 「确认异常无误」是会直接影响薪酬扣减的状态变更，必须二次确认并要求填写说明，
 *   说明落到 att_exception.handle_remark（与引擎写入的判定明细 detail 分列）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, DatePicker, Form, Modal, Select, Space, Table, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, ExportOutlined, ReloadOutlined, SearchOutlined,
  SolutionOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import StatCards from '../../components/StatCards'
import RemarkTextArea from '../../components/RemarkTextArea'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import { useServerSort } from '../../hooks/useServerSort'
import {
  EXCEPTION_STATUS, EXCEPTION_TYPE, confirmExceptions, fetchExceptionStats, fetchExceptions,
  type ExceptionVO,
} from '../../api/attendance'
import { EXCEPTION_STATUS_LABEL_KEY, EXCEPTION_STATUS_TAG_COLOR, EXCEPTION_TYPE_LABEL_KEY, EXCEPTION_TYPE_TAG_COLOR } from './meta'
import { useAttendanceOptions } from './useAttendanceOptions'
import { exportToCSV } from '../../utils/exportCSV'
import '@/styles/components.css'
import OrgScopeNotice from '../../components/OrgScopeNotice'

/** 列 key → i18n key：列标题唯一来源，表格与列配置面板共用 */
const COL_KEY: Record<string, string> = {
  workDate: 'attendance.colWorkDate',
  empNo: 'attendance.colEmpNo',
  empName: 'attendance.colEmpName',
  deptName: 'attendance.colDept',
  groupName: 'attendance.colGroup',
  exceptionType: 'attendance.colExceptionType',
  detail: 'attendance.colExceptionDetail',
  status: 'attendance.colHandleStatus',
  flowNo: 'common.colFlowNo',
  handler: 'attendance.colHandler',
  handledAt: 'attendance.colHandledAt',
  action: 'common.colAction',
}

const { RangePicker } = DatePicker

interface FilterValues {
  range?: [Dayjs, Dayjs] | null
  deptId?: number
  groupId?: number
  exceptionType?: number
  status?: number
}

/** 已选中的行缓存：确认弹窗需要展示考勤日与异常类型，翻页后仍要能取到 */
interface ConfirmState {
  open: boolean
  ids: number[]
  /** 弹窗里回显的摘要行（最多前 3 条，避免长列表把确认框撑爆） */
  preview: ExceptionVO[]
  remark: string
}

export default function AttendanceExceptionList() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('attendance-exception:edit')
  const canExport = hasPermission('attendance-exception:export')
  const { groupOptions, deptTree } = useAttendanceOptions()

  const [form] = Form.useForm<FilterValues>()
  const [rows, setRows] = useState<ExceptionVO[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({})
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const { sort, applySorter } = useServerSort()
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState>({ open: false, ids: [], preview: [], remark: '' })
  const [confirming, setConfirming] = useState(false)

  /** 把表单里的区间拆成后端要的 from/to（后端只认 yyyy-MM-dd） */
  const queryParams = useCallback((values: FilterValues) => ({
    from: values.range?.[0]?.format('YYYY-MM-DD'),
    to: values.range?.[1]?.format('YYYY-MM-DD'),
    deptId: values.deptId,
    groupId: values.groupId,
    exceptionType: values.exceptionType,
    status: values.status,
  }), [])

  const statsKey = useMemo(() => JSON.stringify(queryParams(filters)), [filters, queryParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchExceptions({ ...queryParams(filters), page: pagination.page, size: pagination.size, sortField: sort.field, sortOrder: sort.order })
      setRows(res.records ?? [])
      setTotal(res.total ?? 0)
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filters, pagination.page, pagination.size, queryParams, sort.field, sort.order])

  const loadStats = useCallback(() => {
    fetchExceptionStats(queryParams(filters)).then(setStats).catch(() => setStats({}))
  }, [filters, queryParams])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadStats() }, [loadStats])

  const refresh = useCallback(() => { load(); loadStats() }, [load, loadStats])

  const handleSearch = () => {
    setFilters(form.getFieldsValue())
    setPagination(p => ({ ...p, page: 1 }))
    setSelectedKeys([])
  }

  const handleReset = () => {
    form.resetFields()
    setFilters({})
    setPagination(p => ({ ...p, page: 1 }))
    setSelectedKeys([])
  }

  /** 打开确认弹窗：单行与批量共用，ids 决定影响范围 */
  const openConfirm = (targets: ExceptionVO[]) => {
    if (targets.length === 0) {
      message.warning(t('attendance.confirmNothingSelected'))
      return
    }
    setConfirmState({ open: true, ids: targets.map(r => r.id), preview: targets.slice(0, 3), remark: '' })
  }

  const submitConfirm = async () => {
    setConfirming(true)
    try {
      const result = await confirmExceptions(confirmState.ids, confirmState.remark.trim() || undefined)
      // 后端只推进「待处理」行，skipped 必须如实告诉用户，否则他以为全部确认了
      message.success(result.skipped
        ? t('attendance.confirmedWithSkipped', { affected: result.affected ?? 0, skipped: result.skipped ?? 0 })
        : t('attendance.confirmedSuccess', { affected: result.affected ?? 0 }))
      setConfirmState({ open: false, ids: [], preview: [], remark: '' })
      setSelectedKeys([])
      refresh()
    } catch {
      // 请求层已统一提示
    } finally {
      setConfirming(false)
    }
  }

  const typeLabel = (code?: number | null) => {
    const key = code == null ? undefined : EXCEPTION_TYPE_LABEL_KEY[code]
    return key ? t(key) : String(code ?? '-')
  }
  const statusLabel = (code?: number | null) => {
    const key = code == null ? undefined : EXCEPTION_STATUS_LABEL_KEY[code]
    return key ? t(key) : String(code ?? '-')
  }

  const handleExport = () => {
    const selected = selectedKeys.length > 0 ? rows.filter(r => selectedKeys.includes(r.id)) : rows
    if (selected.length === 0) {
      message.warning(t('common.noDataToExport'))
      return
    }
    exportToCSV(
      `${t('attendance.exceptionTitle')}_${dayjs().format('YYYY-MM-DD')}`,
      [
        { title: t('attendance.colWorkDate'), dataIndex: 'workDate' },
        { title: t('attendance.colEmpNo'), dataIndex: 'empNo', render: v => v ?? '-' },
        { title: t('attendance.colEmpName'), dataIndex: 'empName', render: v => v ?? '-' },
        { title: t('attendance.colDept'), dataIndex: 'deptName', render: v => v ?? '-' },
        { title: t('attendance.colGroup'), dataIndex: 'groupName', render: v => v ?? '-' },
        { title: t('attendance.colExceptionType'), dataIndex: 'exceptionType', render: v => typeLabel(v as number) },
        { title: t('attendance.colExceptionDetail'), dataIndex: 'detail', render: v => v ?? '-' },
        { title: t('attendance.colHandleStatus'), dataIndex: 'status', render: v => statusLabel(v as number) },
        { title: t('common.colFlowNo'), dataIndex: 'flowNo', render: v => v ?? '-' },
        { title: t('attendance.colHandler'), dataIndex: 'handler', render: v => v ?? '-' },
        { title: t('attendance.colHandledAt'), dataIndex: 'handledAt', render: v => v ?? '-' },
        { title: t('attendance.colHandleRemark'), dataIndex: 'handleRemark', render: v => v ?? '-' },
      ],
      selected,
    )
    message.success(t('common.exportSuccess'))
  }

  const columns: TableColumnsType<ExceptionVO> = [
    { title: t(COL_KEY.workDate), dataIndex: 'workDate', key: 'workDate', width: 120, sorter: true },
    { title: t(COL_KEY.empNo), dataIndex: 'empNo', key: 'empNo', width: 110 },
    { title: t(COL_KEY.empName), dataIndex: 'empName', key: 'empName', width: 100 },
    { title: t(COL_KEY.deptName), dataIndex: 'deptName', key: 'deptName', width: 140, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.groupName), dataIndex: 'groupName', key: 'groupName', width: 200, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.exceptionType), dataIndex: 'exceptionType', key: 'exceptionType', width: 110,
      render: (v: number) => <Tag color={EXCEPTION_TYPE_TAG_COLOR[v] ?? 'default'}>{typeLabel(v)}</Tag>,
    },
    { title: t(COL_KEY.detail), dataIndex: 'detail', key: 'detail', width: 180, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.status), dataIndex: 'status', key: 'status', width: 130,
      render: (v: number) => <Tag color={EXCEPTION_STATUS_TAG_COLOR[v] ?? 'default'}>{statusLabel(v)}</Tag>,
    },
    { title: t(COL_KEY.flowNo), dataIndex: 'flowNo', key: 'flowNo', width: 160, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.handler), dataIndex: 'handler', key: 'handler', width: 120, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.handledAt), dataIndex: 'handledAt', key: 'handledAt', width: 170, render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.action), key: 'action', width: 170, fixed: 'right',
      render: (_, record) => {
        const pending = record.status === EXCEPTION_STATUS.PENDING
        return (
          <Space size={0} split={<span className="action-split">|</span>}>
            <Button type="link" size="small" onClick={() => navigate(`/attendance-exception-handle?id=${record.id}`)}>
              {t('attendance.handleAction')}
            </Button>
            {record.flowNo && (
              <Button type="link" size="small" onClick={() => navigate(`/hr-flow-detail?flowNo=${record.flowNo}`)}>
                {t('attendance.flowAction')}
              </Button>
            )}
            {canEdit && pending && (
              <Button type="link" size="small" onClick={() => openConfirm([record])}>
                {t('attendance.confirmAction')}
              </Button>
            )}
          </Space>
        )
      },
    },
  ]

  const columnMeta = useMemo(
    () => Object.entries(COL_KEY).map(([key, i18nKey]) => ({ key, title: t(i18nKey) })),
    [t],
  )

  const { configComponent, applyConfig } = useColumnConfig('attendance-exception', columnMeta, [
    { key: 'workDate', visible: true, locked: 'head' as const },
    { key: 'action', visible: true, locked: 'tail' as const },
  ])

  const deducted = (stats.leave ?? 0) + (stats.overtime ?? 0)

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          message={t('common.loadFailed')}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={refresh}>{t('common.reset')}</Button>}
        />
      )}
      <OrgScopeNotice />
      {/* 页面说明横幅：异常页最容易被误解成"可以在这里审批"，边界必须写在界面上 */}
      <Alert type="info" showIcon message={t('attendance.exceptionPageHint')} style={{ marginBottom: 16 }} />

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('attendance.colWorkDate')} name="range">
            <RangePicker style={{ width: 240 }} />
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
          <Form.Item label={t('attendance.colExceptionType')} name="exceptionType">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 130 }}
              options={[
                EXCEPTION_TYPE.LATE, EXCEPTION_TYPE.EARLY, EXCEPTION_TYPE.MISSING_CARD,
                EXCEPTION_TYPE.ABSENT, EXCEPTION_TYPE.UNSCHEDULED,
              ].map(code => ({ value: code, label: t(EXCEPTION_TYPE_LABEL_KEY[code]) }))}
            />
          </Form.Item>
          <Form.Item label={t('attendance.colHandleStatus')} name="status">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 140 }}
              options={[
                EXCEPTION_STATUS.PENDING, EXCEPTION_STATUS.HANDLED, EXCEPTION_STATUS.LEAVE,
                EXCEPTION_STATUS.OVERTIME, EXCEPTION_STATUS.CONFIRMED,
              ].map(code => ({ value: code, label: t(EXCEPTION_STATUS_LABEL_KEY[code]) }))}
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
            { key: 'pending', icon: <WarningOutlined />, color: 'brand', value: stats.pending ?? 0, label: t('attendance.statExPending') },
            { key: 'handled', icon: <CheckCircleOutlined />, color: 'success', value: stats.reissued ?? 0, label: t('attendance.statExReissued') },
            { key: 'deducted', icon: <SolutionOutlined />, color: 'system', value: deducted, label: t('attendance.statExDeducted') },
            { key: 'total', icon: <ReloadOutlined />, color: 'info', value: stats.total ?? 0, label: t('attendance.statExTotal') },
          ]}
        />
      </div>

      <div className="action-section">
        <div className="action-section-left">
          <Space>
            {canExport && (
              <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
                {t('common.export')}
              </Button>
            )}
            {canEdit && (
              <Button
                icon={<CheckCircleOutlined />}
                disabled={selectedKeys.length === 0}
                onClick={() => openConfirm(rows.filter(r => selectedKeys.includes(r.id) && r.status === EXCEPTION_STATUS.PENDING))}
              >
                {t('attendance.batchConfirm')}
              </Button>
            )}
          </Space>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      <Table<ExceptionVO>
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        scroll={{ x: 1800 }}
        size="middle"
        onChange={(pag, _filters, sorter) => {
          const sortChanged = applySorter(sorter)
          setPagination(p => ({ page: sortChanged ? 1 : (pag.current ?? 1), size: pag.pageSize ?? p.size }))
        }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (count) => t('common.totalRecords', { count }),
        }}
      />

      {/*
        确认弹窗：确认=承认异常真实存在且不抵扣，会直接进入薪酬扣减口径，
        因此必须能填写说明（落到 handle_remark），不能只问"是否确定"。
      */}
      <Modal
        open={confirmState.open}
        title={t('attendance.confirmDialogTitle')}
        className="custom-confirm-modal"
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={confirming}
        onOk={submitConfirm}
        onCancel={() => setConfirmState(prev => ({ ...prev, open: false }))}
      >
        <div className="confirm-info-card">
          <div className="confirm-info-row">
            <span>{t('attendance.confirmCountLabel')}</span>
            <b>{t('common.selectedCount', { count: confirmState.ids.length })}</b>
          </div>
          {confirmState.preview.map(row => (
            <div className="confirm-info-row" key={row.id}>
              <span>{row.workDate}</span>
              <b>{row.empName}（{row.empNo}）· {typeLabel(row.exceptionType)} · {row.detail}</b>
            </div>
          ))}
          {confirmState.ids.length > confirmState.preview.length && (
            <div className="confirm-info-row">
              <span>{t('attendance.confirmMoreRows', { count: confirmState.ids.length - confirmState.preview.length })}</span>
            </div>
          )}
          <div className="confirm-info-row">
            <span>{t('attendance.confirmConsequence')}</span>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <RemarkTextArea
            value={confirmState.remark}
            onChange={e => setConfirmState(prev => ({ ...prev, remark: e.target.value }))}
            placeholder={t('attendance.confirmRemarkPlaceholder')}
          />
        </div>
      </Modal>
    </div>
  )
}
