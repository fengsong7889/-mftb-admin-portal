import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Select, Table, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import dayjs from 'dayjs'
import { ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchDepartments } from '../../api/department'
import type { DepartmentItem } from '../../api/department'
import { fetchLoginLogs, forceLogout, deleteLoginLog } from '../../api/loginLog'
import type { LoginLogRecord } from '../../api/loginLog'
import { exportToCSV } from '../../utils/exportCSV'
import { useAuth } from '../../contexts/AuthContext'

const { RangePicker } = DatePicker

/** 狀態枚舉 */
const LOGIN_STATUS = {
  ONLINE: 'online',
  OFFLINE_MANUAL: 'manual',
  OFFLINE_TIMEOUT: 'timeout',
  OFFLINE_FORCED: 'forced',
} as const

const LOGIN_STATUS_TAG: Record<string, { color: string }> = {
  [LOGIN_STATUS.ONLINE]: { color: 'success' },
  [LOGIN_STATUS.OFFLINE_MANUAL]: { color: 'default' },
  [LOGIN_STATUS.OFFLINE_TIMEOUT]: { color: 'warning' },
  [LOGIN_STATUS.OFFLINE_FORCED]: { color: 'error' },
}

/** 計算在線時長展示文本 */
function formatDuration(seconds: number | null, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (seconds == null) return '-'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return t('loginLog.durationHour', { h: hours, m: minutes })
  }
  if (minutes > 0) {
    return t('loginLog.durationMinute', { m: minutes, s: secs })
  }
  return t('loginLog.durationSecond', { s: secs })
}

/** 員工動態頁面 */
export default function LoginLog() {
  const { t } = useTranslation()
  const { hasPermission } = useAuth()

  /** 狀態標籤（依賴 t，定義在組件內以便響應語言切換） */
  const STATUS_LABEL: Record<string, string> = {
    [LOGIN_STATUS.ONLINE]: t('loginLog.statusOnline'),
    [LOGIN_STATUS.OFFLINE_MANUAL]: t('loginLog.statusManual'),
    [LOGIN_STATUS.OFFLINE_TIMEOUT]: t('loginLog.statusTimeout'),
    [LOGIN_STATUS.OFFLINE_FORCED]: t('loginLog.statusForced'),
  }
  const STATUS_OPTIONS = [
    { value: LOGIN_STATUS.ONLINE, label: t('loginLog.statusOnline') },
    { value: LOGIN_STATUS.OFFLINE_MANUAL, label: t('loginLog.statusManual') },
    { value: LOGIN_STATUS.OFFLINE_TIMEOUT, label: t('loginLog.statusTimeout') },
    { value: LOGIN_STATUS.OFFLINE_FORCED, label: t('loginLog.statusForced') },
  ]
  const [searchForm] = Form.useForm()
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<LoginLogRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  // 全选
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])

  // 搜索條件
  const [keyword, setKeyword] = useState<string | undefined>()
  const [dateRange, setDateRange] = useState<[string, string] | null>(null)
  const [deptFilter, setDeptFilter] = useState<number | undefined>()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()

  /** 加載部門列表 */
  useEffect(() => {
    fetchDepartments().then((depts) => {
      setDepartments(depts)
    }).catch(() => {
      // 部門加載失敗不影響主流程
    })
  }, [])

  /** 加載數據 */
  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, unknown> = {
        page,
        size: pageSize,
      }
      if (keyword) params.keyword = keyword
      if (deptFilter != null) params.departmentId = deptFilter
      if (statusFilter) params.status = statusFilter
      if (dateRange) {
        params.startDate = dateRange[0]
        params.endDate = dateRange[1]
      }
      const res = await fetchLoginLogs(params as Record<string, string | number>)
      setDataSource(res.records)
      setTotal(res.total)
    } catch {
      message.error(t('loginLog.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, keyword, deptFilter, statusFilter, dateRange])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  /** 部門 ID → 部門名稱映射（用於構建全路徑） */
  const deptIdMap = useMemo(() => {
    const map = new Map<number, DepartmentItem>()
    departments.forEach((d) => map.set(d.id, d))
    return map
  }, [departments])

  /** 獲取部門全路徑（跳過頂級部門 MFTB集團，從二級部門開始展示） */
  const _getDeptFullPath = useCallback((deptId?: number): string => {
    if (deptId == null) return '-'
    const path: string[] = []
    let current = deptIdMap.get(deptId)
    const visited = new Set<number>()
    while (current && !visited.has(current.id)) {
      path.unshift(current.name)
      visited.add(current.id)
      if (current.parentId == null) break
      current = deptIdMap.get(current.parentId)
    }
    // 跳過頂級部門（parentId 為 null 的即為頂級）
    if (path.length > 1) {
      let rootId = deptId
      let node = deptIdMap.get(rootId)
      while (node?.parentId != null) {
        rootId = node.parentId
        node = deptIdMap.get(rootId)
      }
      // 如果當前部門就是頂級部門，直接顯示
      if (deptId === rootId) return path[0]
      // 否則移除頂級部門名稱
      path.shift()
    }
    return path.join(' > ')
  }, [deptIdMap])

  /** 部門樹形數據（用於 TreeSelect） */
  interface DeptTreeNode {
    value: number
    title: string
    children?: DeptTreeNode[]
  }

  const deptTreeData = useMemo<DeptTreeNode[]>(() => {
    const nodeMap = new Map<number, DeptTreeNode>()
    departments.forEach(dept => {
      nodeMap.set(dept.id, { value: dept.id, title: dept.name, children: [] })
    })
    const roots: DeptTreeNode[] = []
    departments.forEach(dept => {
      const node = nodeMap.get(dept.id)!
      const parent = dept.parentId != null ? nodeMap.get(dept.parentId) : undefined
      if (parent) {
        parent.children!.push(node)
      } else {
        roots.push(node)
      }
    })
    return roots
  }, [departments])

  /** 查詢 */
  const handleSearch = () => {
    const values = searchForm.getFieldsValue()
    setKeyword(values.keyword?.trim() || undefined)
    setDeptFilter(values.department || undefined)
    setStatusFilter(values.status || undefined)
    if (values.dateRange && values.dateRange.length === 2) {
      const start = values.dateRange[0].format('YYYY-MM-DD')
      const end = values.dateRange[1].format('YYYY-MM-DD')
      setDateRange([start, end])
    } else {
      setDateRange(null)
    }
    setPage(1)
  }

  /** 重置 */
  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setDateRange(null)
    setDeptFilter(undefined)
    setStatusFilter(undefined)
    setPage(1)
  }

  /** 導出當前搜索結果 */
  const handleExport = () => {
    if (dataSource.length === 0) {
      message.warning(t('loginLog.noDataToExport'))
      return
    }
    const exportColumns = [
      { title: t('loginLog.colEmpId'), dataIndex: 'empId' },
      { title: t('loginLog.colEmpName'), dataIndex: 'employeeName' },
      { title: t('loginLog.colDept'), dataIndex: 'departmentName' },
      { title: t('loginLog.colLoginTime'), dataIndex: 'loginTime', render: (v: number | string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '' },
      { title: t('loginLog.colLogoutTime'), dataIndex: 'logoutTime', render: (v: number | string | null) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '' },
      { title: t('loginLog.colDuration'), dataIndex: 'duration', render: (v: number | null) => {
        return v != null ? formatDuration(v, t) : ''
      }},
      { title: t('loginLog.colStatus'), dataIndex: 'logoutReason', render: (_: unknown, record: LoginLogRecord) => {
        if (record.logoutTime == null) return STATUS_LABEL[LOGIN_STATUS.ONLINE]
        return record.logoutReason === 'timeout' ? STATUS_LABEL[LOGIN_STATUS.OFFLINE_TIMEOUT] : record.logoutReason === 'forced' ? STATUS_LABEL[LOGIN_STATUS.OFFLINE_FORCED] : STATUS_LABEL[LOGIN_STATUS.OFFLINE_MANUAL]
      }},
    ]
    exportToCSV(t('loginLog.pageTitle'), exportColumns, dataSource)
  }

  /** 強制下線 */
  const handleForceLogout = (record: LoginLogRecord) => {
    Modal.confirm({
      title: t('loginLog.confirmLogout'),
      content: t('loginLog.confirmLogoutContent', { name: record.employeeName }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await forceLogout(record.id)
          message.success(t('loginLog.logoutSuccess', { name: record.employeeName }))
          fetchList()
        } catch {
          message.error(t('loginLog.logoutFailed'))
        }
      },
    })
  }

  /** 刪除日志 */
  const handleDelete = (record: LoginLogRecord) => {
    Modal.confirm({
      title: t('common.confirmDelete'),
      content: t('loginLog.confirmDeleteContent', { name: record.employeeName }),
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await deleteLoginLog(record.id)
          message.success(t('common.deleteSuccess'))
          fetchList()
        } catch {
          message.error(t('loginLog.deleteFailed'))
        }
      },
    })
  }

  /** 表格列定義 */
  const columns: TableColumnsType<LoginLogRecord> = [
    {
      title: t('loginLog.colEmpId'),
      dataIndex: 'empId',
      key: 'empId',
      width: 110,
    },
    {
      title: t('loginLog.colEmpName'),
      dataIndex: 'employeeName',
      key: 'employeeName',
      width: 100,
    },
    {
      title: t('loginLog.colDept'),
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 220,
    },
    {
      title: t('loginLog.colLoginTime'),
      dataIndex: 'loginTime',
      key: 'loginTime',
      width: 180,
      render: (val: number | string) => dayjs(val).format('YYYY-MM-DD HH:mm:ss'),
      sorter: (a, b) => Number(a.loginTime) - Number(b.loginTime),
      defaultSortOrder: 'descend',
    },
    {
      title: t('loginLog.colLogoutTime'),
      dataIndex: 'logoutTime',
      key: 'logoutTime',
      width: 180,
      render: (val: number | string | null) => val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
    {
      title: t('loginLog.colDuration'),
      dataIndex: 'duration',
      key: 'duration',
      width: 130,
      render: (val: number | null) => {
        return val != null ? formatDuration(val, t) : '-'
      },
      sorter: (a, b) => (a.duration ?? 0) - (b.duration ?? 0),
    },
    {
      title: t('loginLog.colStatus'),
      dataIndex: 'logoutReason',
      key: 'status',
      width: 140,
      render: (_: unknown, record: LoginLogRecord) => {
        if (record.logoutTime == null) {
          return <Tag color={LOGIN_STATUS_TAG[LOGIN_STATUS.ONLINE].color}>{STATUS_LABEL[LOGIN_STATUS.ONLINE]}</Tag>
        }
        const statusKey = record.logoutReason === 'timeout'
          ? LOGIN_STATUS.OFFLINE_TIMEOUT
          : record.logoutReason === 'forced'
            ? LOGIN_STATUS.OFFLINE_FORCED
            : LOGIN_STATUS.OFFLINE_MANUAL
        const config = LOGIN_STATUS_TAG[statusKey]
        return <Tag color={config?.color}>{STATUS_LABEL[statusKey]}</Tag>
      },
    },
    {
      title: t('loginLog.colAction'),
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_: unknown, record: LoginLogRecord) => (
        <>
          {record.logoutTime == null && hasPermission('login-log:forceLogout') && (
            <Button type="link" danger size="small" onClick={() => handleForceLogout(record)}>
              {t('loginLog.btnForceLogout')}
            </Button>
          )}
          <Button type="link" danger size="small" onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </>
      ),
    },
  ]

  /** 列配置 */
  const columnMeta = columns.map((col) => ({ key: col.key as string, title: col.title as string }))
  const { configComponent, applyConfig } = useColumnConfig('login-log', columnMeta, [])

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label={t('loginLog.searchEmployee')} name="keyword">
            <Input placeholder={t('loginLog.empPlaceholder')} allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label={t('loginLog.searchDept')} name="department">
            <TreeSelect
              placeholder={t('common.all')}
              allowClear
              treeData={deptTreeData}
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label={t('loginLog.searchStatus')} name="status">
            <Select placeholder={t('common.all')} allowClear options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label={t('loginLog.searchDate')} name="dateRange">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                {t('common.search')}
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                {t('common.reset')}
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：导出在左 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            {t('common.export')}
          </Button>
        </div>
        <div className="action-section-right">
          {configComponent}
        </div>
      </div>

      <Table
        columns={applyConfig(columns)}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => t('common.total', { count: total }),
          onChange: (p, s) => {
            setPage(s !== pageSize ? 1 : p)
            setPageSize(s)
          },
        }}
      />
    </div>
  )
}
