/**
 * 打卡记录 —— 明细查询页（只读账本）
 *
 * 口径说明：一期只接「钉钉同步」「手工导入」「人工补录」三种来源；原始打卡流水不可编辑，
 * 任何修正都通过异常处理发起补卡/请假流程后由系统重算结论，保证审计链完整——
 * 因此本页没有任何编辑/删除按钮，只有查询、导出、导入与同步。
 *
 * 数据口径：列表与统计走服务端并共用同一套 filters（§E.8）；
 * 「判定結果」列显示的是日汇总引擎回写的结论，不是导入时的原始值。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, TreeSelect, Upload, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  CheckCircleOutlined, DownloadOutlined, ExportOutlined, ImportOutlined, ReloadOutlined,
  SearchOutlined, SyncOutlined, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import StatCards from '../../components/StatCards'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { useAuth } from '../../contexts/AuthContext'
import { useServerSort } from '../../hooks/useServerSort'
import {
  PUNCH_RESULT, PUNCH_SOURCE, fetchPunchStats, fetchPunches, importPunches, syncPunches,
  type PunchImportRow, type PunchVO,
} from '../../api/attendance'
import { PUNCH_RESULT_LABEL_KEY, PUNCH_RESULT_TAG_COLOR, PUNCH_SOURCE_LABEL_KEY, PUNCH_TYPE_LABEL_KEY } from './meta'
import { useAttendanceOptions } from './useAttendanceOptions'
import { generatePunchImportTemplate, parsePunchExcel } from './punchImport'
import { exportToCSV } from '../../utils/exportCSV'
import '@/styles/components.css'

/** 列 key → i18n key：列标题唯一来源，表格与列配置面板共用 */
const COL_KEY: Record<string, string> = {
  punchAt: 'attendance.colPunchAt',
  empNo: 'attendance.colEmpNo',
  empName: 'attendance.colEmpName',
  deptName: 'attendance.colDept',
  groupName: 'attendance.colGroup',
  punchType: 'attendance.colPunchType',
  source: 'attendance.colSource',
  location: 'attendance.colLocation',
  result: 'attendance.colResult',
}

const { RangePicker } = DatePicker

interface FilterValues {
  range?: [Dayjs, Dayjs] | null
  keyword?: string
  deptId?: number
  groupId?: number
  source?: number
  result?: number
}

export default function AttendancePunchList() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()
  const canImport = hasPermission('attendance-punch:import')
  const canExport = hasPermission('attendance-punch:export')
  const { groupOptions, deptTree } = useAttendanceOptions()

  const [form] = Form.useForm<FilterValues>()
  const [rows, setRows] = useState<PunchVO[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({})
  const [pagination, setPagination] = useState({ page: 1, size: 20 })
  const { sort, applySorter } = useServerSort()
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])

  // 同步弹窗
  const [syncOpen, setSyncOpen] = useState(false)
  const [syncRange, setSyncRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(1, 'day'), dayjs()])
  const [syncGroupId, setSyncGroupId] = useState<number | undefined>()
  const [syncing, setSyncing] = useState(false)

  // 导入弹窗：解析 → 预览 → 入库，错误行在入库前就指出来
  const [importOpen, setImportOpen] = useState(false)
  const [importRows, setImportRows] = useState<PunchImportRow[]>([])
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [parsing, setParsing] = useState(false)

  const queryParams = useCallback((values: FilterValues) => ({
    from: values.range?.[0]?.format('YYYY-MM-DD'),
    to: values.range?.[1]?.format('YYYY-MM-DD'),
    keyword: values.keyword?.trim() || undefined,
    deptId: values.deptId,
    groupId: values.groupId,
    source: values.source,
    result: values.result,
  }), [])

  const statsKey = useMemo(() => JSON.stringify(queryParams(filters)), [filters, queryParams])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchPunches({ ...queryParams(filters), page: pagination.page, size: pagination.size, sortField: sort.field, sortOrder: sort.order })
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
    fetchPunchStats(queryParams(filters)).then(setStats).catch(() => setStats({}))
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

  const labelOf = (map: Record<number, string>, code?: number | null) => {
    const key = code == null ? undefined : map[code]
    return key ? t(key) : String(code ?? '-')
  }

  const handleSync = async () => {
    const from = syncRange[0].format('YYYY-MM-DD')
    const to = syncRange[1].format('YYYY-MM-DD')
    setSyncing(true)
    try {
      const result = await syncPunches(from, to, syncGroupId)
      // skippedUnbound 必须显示出来：钉钉账号没绑定系统用户时，拉回来的打卡会被丢弃，
      // 不提示的话用户只会看到"同步成功"却发现明细没多
      message.success(t('attendance.syncResult', {
        pulled: result.pulled ?? 0,
        inserted: result.inserted ?? 0,
        duplicated: result.duplicated ?? 0,
        unbound: result.skippedUnbound ?? 0,
      }))
      setSyncOpen(false)
      refresh()
    } catch {
      // 请求层已统一提示（钉钉凭据不可用等）
    } finally {
      setSyncing(false)
    }
  }

  /** Upload 的 beforeUpload 里自己解析，返回 false 阻止组件自动上传 */
  const handleParseFile = async (file: File) => {
    setParsing(true)
    try {
      const parsed = await parsePunchExcel(file)
      setImportRows(parsed.rows)
      setImportErrors(parsed.errors)
      if (parsed.rows.length === 0 && parsed.errors.length === 0) {
        message.warning(t('attendance.importEmptyFile'))
      }
    } catch {
      setImportRows([])
      setImportErrors([t('attendance.importParseFailed')])
    } finally {
      setParsing(false)
    }
    return false
  }

  const handleImport = async () => {
    if (importRows.length === 0) {
      message.warning(t('attendance.importNothingToSubmit'))
      return
    }
    setImporting(true)
    try {
      const result = await importPunches(importRows)
      message.success(t('attendance.importResult', {
        total: result.total ?? 0,
        inserted: result.inserted ?? 0,
        duplicated: result.duplicated ?? 0,
        failed: result.failed ?? 0,
      }))
      setImportOpen(false)
      setImportRows([])
      setImportErrors([])
      refresh()
    } catch {
      // 请求层已统一提示
    } finally {
      setImporting(false)
    }
  }

  const handleExport = () => {
    const selected = selectedKeys.length > 0 ? rows.filter(r => selectedKeys.includes(r.id)) : rows
    if (selected.length === 0) {
      message.warning(t('common.noDataToExport'))
      return
    }
    exportToCSV(
      `${t('attendance.punchTitle')}_${dayjs().format('YYYY-MM-DD')}`,
      [
        { title: t('attendance.colPunchAt'), dataIndex: 'punchAt' },
        { title: t('attendance.colWorkDate'), dataIndex: 'workDate' },
        { title: t('attendance.colEmpNo'), dataIndex: 'empNo', render: v => v ?? '-' },
        { title: t('attendance.colEmpName'), dataIndex: 'empName', render: v => v ?? '-' },
        { title: t('attendance.colDept'), dataIndex: 'deptName', render: v => v ?? '-' },
        { title: t('attendance.colGroup'), dataIndex: 'groupName', render: v => v ?? '-' },
        { title: t('attendance.colPunchType'), dataIndex: 'punchType', render: v => labelOf(PUNCH_TYPE_LABEL_KEY, v as number) },
        { title: t('attendance.colSource'), dataIndex: 'source', render: v => labelOf(PUNCH_SOURCE_LABEL_KEY, v as number) },
        { title: t('attendance.colLocation'), dataIndex: 'location', render: v => v ?? '-' },
        { title: t('attendance.colResult'), dataIndex: 'result', render: v => labelOf(PUNCH_RESULT_LABEL_KEY, v as number) },
      ],
      selected,
    )
    message.success(t('common.exportSuccess'))
  }

  const columns: TableColumnsType<PunchVO> = [
    { title: t(COL_KEY.punchAt), dataIndex: 'punchAt', key: 'punchAt', width: 170, sorter: true },
    { title: t(COL_KEY.empNo), dataIndex: 'empNo', key: 'empNo', width: 110 },
    { title: t(COL_KEY.empName), dataIndex: 'empName', key: 'empName', width: 100 },
    { title: t(COL_KEY.deptName), dataIndex: 'deptName', key: 'deptName', width: 140, ellipsis: true, render: (v?: string) => v || '-' },
    { title: t(COL_KEY.groupName), dataIndex: 'groupName', key: 'groupName', width: 200, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.punchType), dataIndex: 'punchType', key: 'punchType', width: 100, align: 'center',
      render: (v?: number) => labelOf(PUNCH_TYPE_LABEL_KEY, v),
    },
    {
      title: t(COL_KEY.source), dataIndex: 'source', key: 'source', width: 110, align: 'center',
      render: (v?: number) => <Tag>{labelOf(PUNCH_SOURCE_LABEL_KEY, v)}</Tag>,
    },
    { title: t(COL_KEY.location), dataIndex: 'location', key: 'location', width: 200, ellipsis: true, render: (v?: string) => v || '-' },
    {
      title: t(COL_KEY.result), dataIndex: 'result', key: 'result', width: 110, align: 'center',
      render: (v?: number) => (
        <Tag color={v == null ? 'default' : (PUNCH_RESULT_TAG_COLOR[v] ?? 'default')}>
          {labelOf(PUNCH_RESULT_LABEL_KEY, v)}
        </Tag>
      ),
    },
  ]

  const columnMeta = useMemo(
    () => Object.entries(COL_KEY).map(([key, i18nKey]) => ({ key, title: t(i18nKey) })),
    [t],
  )

  const { configComponent, applyConfig } = useColumnConfig('attendance-punch', columnMeta, [
    { key: 'punchAt', visible: true, locked: 'head' as const },
  ])

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
      {/* 只读账本的边界必须写在界面上，否则用户会一直找"编辑打卡"的入口 */}
      <Alert type="info" showIcon message={t('attendance.punchPageHint')} style={{ marginBottom: 16 }} />

      <div className="search-section">
        <Form form={form} layout="inline">
          <Form.Item label={t('attendance.colPunchDate')} name="range">
            <RangePicker style={{ width: 240 }} />
          </Form.Item>
          <Form.Item label={t('attendance.colEmployee')} name="keyword">
            <Input placeholder={t('attendance.punchKeywordPlaceholder')} style={{ width: 200 }} allowClear />
          </Form.Item>
          <Form.Item label={t('attendance.colDept')} name="deptId">
            <TreeSelect
              treeData={deptTree}
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder={t('common.all')}
              style={{ width: 170 }}
            />
          </Form.Item>
          <Form.Item label={t('attendance.colGroup')} name="groupId">
            <Select
              placeholder={t('common.all')}
              allowClear
              showSearch
              optionFilterProp="label"
              style={{ width: 190 }}
              options={groupOptions}
            />
          </Form.Item>
          <Form.Item label={t('attendance.colSource')} name="source">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 130 }}
              options={[PUNCH_SOURCE.DINGTALK, PUNCH_SOURCE.IMPORT, PUNCH_SOURCE.REISSUE].map(code => ({
                value: code,
                label: t(PUNCH_SOURCE_LABEL_KEY[code]),
              }))}
            />
          </Form.Item>
          <Form.Item label={t('attendance.colResult')} name="result">
            <Select
              placeholder={t('common.all')}
              allowClear
              style={{ width: 120 }}
              options={[
                PUNCH_RESULT.NORMAL, PUNCH_RESULT.LATE, PUNCH_RESULT.EARLY,
                PUNCH_RESULT.OUTSIDE, PUNCH_RESULT.INVALID,
              ].map(code => ({ value: code, label: t(PUNCH_RESULT_LABEL_KEY[code]) }))}
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
            { key: 'total', icon: <ThunderboltOutlined />, color: 'info', value: stats.total ?? 0, label: t('attendance.statPunchTotal') },
            { key: 'normal', icon: <CheckCircleOutlined />, color: 'success', value: stats.normal ?? 0, label: t('attendance.statPunchNormal') },
            { key: 'abnormal', icon: <WarningOutlined />, color: 'brand', value: stats.abnormal ?? 0, label: t('attendance.statPunchAbnormal') },
            { key: 'outside', icon: <SearchOutlined />, color: 'system', value: stats.outside ?? 0, label: t('attendance.statPunchOutside') },
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
            {canImport && (
              <>
                <Button
                  className="btn-import"
                  icon={<ImportOutlined />}
                  onClick={() => { setImportRows([]); setImportErrors([]); setImportOpen(true) }}
                >
                  {t('attendance.punchImport')}
                </Button>
                <Button icon={<SyncOutlined />} onClick={() => setSyncOpen(true)}>
                  {t('attendance.punchSync')}
                </Button>
              </>
            )}
          </Space>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      <Table<PunchVO>
        rowKey="id"
        loading={loading}
        columns={applyConfig(columns)}
        dataSource={rows}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: setSelectedKeys }}
        scroll={{ x: 1440 }}
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

      {/* 钉钉同步：区间取「昨天~今天」为默认，因为跨天夜班的下班卡会落在次日凌晨 */}
      <Modal
        open={syncOpen}
        title={t('attendance.syncDialogTitle')}
        className="custom-confirm-modal"
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        confirmLoading={syncing}
        onOk={handleSync}
        onCancel={() => setSyncOpen(false)}
      >
        <Alert type="info" showIcon message={t('attendance.syncDialogHint')} style={{ marginBottom: 16 }} />
        <Form layout="vertical">
          <Form.Item label={t('attendance.colPunchDate')} required>
            <RangePicker
              value={syncRange}
              onChange={value => { if (value?.[0] && value?.[1]) setSyncRange([value[0], value[1]]) }}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('attendance.colGroup')} extra={t('attendance.syncGroupHint')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('attendance.syncAllGroups')}
              value={syncGroupId}
              onChange={setSyncGroupId}
              options={groupOptions}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 导入向导：解析结果先预览，错误行带 Excel 行号，入库前就能改源文件 */}
      <Modal
        open={importOpen}
        title={t('attendance.importDialogTitle')}
        className="custom-confirm-modal"
        width={720}
        okText={t('attendance.importSubmit')}
        cancelText={t('common.cancel')}
        confirmLoading={importing}
        okButtonProps={{ disabled: importRows.length === 0 }}
        onOk={handleImport}
        onCancel={() => setImportOpen(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert type="info" showIcon message={t('attendance.importDialogHint')} />
          <Space>
            <Upload
              accept=".xlsx,.xls"
              maxCount={1}
              showUploadList={false}
              beforeUpload={file => handleParseFile(file as unknown as File)}
            >
              <Button icon={<ImportOutlined />} loading={parsing}>{t('attendance.importChooseFile')}</Button>
            </Upload>
            <Button icon={<DownloadOutlined />} onClick={() => generatePunchImportTemplate()}>
              {t('attendance.importTemplate')}
            </Button>
          </Space>
          {importErrors.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={t('attendance.importErrorTitle', { count: importErrors.length })}
              description={(
                <div style={{ maxHeight: 160, overflow: 'auto' }}>
                  {importErrors.slice(0, 50).map(err => <div key={err}>{err}</div>)}
                </div>
              )}
            />
          )}
          {importRows.length > 0 && (
            <Table<PunchImportRow>
              rowKey={(row, index) => `${row.empNo}-${row.punchAt}-${index}`}
              size="small"
              dataSource={importRows.slice(0, 50)}
              pagination={false}
              scroll={{ y: 220 }}
              columns={[
                { title: t('attendance.colEmpNo'), dataIndex: 'empNo', width: 120 },
                { title: t('attendance.colPunchAt'), dataIndex: 'punchAt', width: 180 },
                {
                  title: t('attendance.colPunchType'), dataIndex: 'punchType', width: 100,
                  render: (v: number) => labelOf(PUNCH_TYPE_LABEL_KEY, v),
                },
                { title: t('attendance.colLocation'), dataIndex: 'location', render: (v?: string) => v || '-' },
              ]}
            />
          )}
          {importRows.length > 50 && (
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {t('attendance.importPreviewTruncated', { shown: 50, total: importRows.length })}
            </span>
          )}
        </Space>
      </Modal>
    </div>
  )
}
