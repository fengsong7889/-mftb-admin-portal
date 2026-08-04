import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Form, Input, Modal, Select, Table, Tag, TreeSelect, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ExportOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useColumnConfig } from '../../hooks/useColumnConfig'
import { fetchDepartments } from '../../api/department'
import type { DepartmentItem } from '../../api/department'
import { fetchLoginLogs, forceLogout, deleteLoginLog } from '../../api/loginLog'
import type { LoginLogRecord } from '../../api/loginLog'

const { RangePicker } = DatePicker

/** 狀態枚舉 */
const LOGIN_STATUS = {
  ONLINE: 'online',
  OFFLINE_MANUAL: 'manual',
  OFFLINE_TIMEOUT: 'timeout',
  OFFLINE_FORCED: 'forced',
} as const

const LOGIN_STATUS_LABEL: Record<string, string> = {
  [LOGIN_STATUS.ONLINE]: '在線',
  [LOGIN_STATUS.OFFLINE_MANUAL]: '離線-主動退出',
  [LOGIN_STATUS.OFFLINE_TIMEOUT]: '離線-超時退出',
  [LOGIN_STATUS.OFFLINE_FORCED]: '離線-強制下線',
}

const LOGIN_STATUS_TAG: Record<string, { color: string }> = {
  [LOGIN_STATUS.ONLINE]: { color: 'success' },
  [LOGIN_STATUS.OFFLINE_MANUAL]: { color: 'default' },
  [LOGIN_STATUS.OFFLINE_TIMEOUT]: { color: 'warning' },
  [LOGIN_STATUS.OFFLINE_FORCED]: { color: 'error' },
}

const STATUS_OPTIONS = [
  { value: LOGIN_STATUS.ONLINE, label: '在線' },
  { value: LOGIN_STATUS.OFFLINE_MANUAL, label: '離線-主動退出' },
  { value: LOGIN_STATUS.OFFLINE_TIMEOUT, label: '離線-超時退出' },
  { value: LOGIN_STATUS.OFFLINE_FORCED, label: '離線-強制下線' },
]

/** 計算在線時長展示文本 */
function formatDuration(seconds: number | null): string {
  if (seconds == null) return '-'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) {
    return `${hours}小時${minutes}分鐘`
  }
  if (minutes > 0) {
    return `${minutes}分鐘${secs}秒`
  }
  return `${secs}秒`
}

/** 員工動態頁面 */
export default function LoginLog() {
  const [searchForm] = Form.useForm()
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<LoginLogRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [now, setNow] = useState(new Date()) // 用於實時更新在線時長

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

  /** 每分鐘更新當前時間（用於在線時長計算） */
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
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
      message.error('加載登錄日志失敗')
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

  /** 導出 */
  const handleExport = () => {
    // TODO: 對接後端導出接口
    message.info('導出功能開發中')
  }

  /** 強制下線 */
  const handleForceLogout = (record: LoginLogRecord) => {
    Modal.confirm({
      title: '確認下線',
      content: `確定要將「${record.employeeName}」強制下線嗎？`,
      okText: '確定',
      cancelText: '取消',
      onOk: async () => {
        try {
          await forceLogout(record.id)
          message.success(`已將「${record.employeeName}」強制下線`)
          fetchList()
        } catch {
          message.error('操作失敗，請重試')
        }
      },
    })
  }

  /** 刪除日志 */
  const handleDelete = (record: LoginLogRecord) => {
    Modal.confirm({
      title: '確認刪除',
      content: `確定要刪除「${record.employeeName}」的登錄日志嗎？刪除後不可恢復。`,
      okText: '確定',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteLoginLog(record.id)
          message.success('刪除成功')
          fetchList()
        } catch {
          message.error('刪除失敗，請重試')
        }
      },
    })
  }

  /** 表格列定義 */
  const columns: TableColumnsType<LoginLogRecord> = [
    {
      title: '員工工號',
      dataIndex: 'empId',
      key: 'empId',
      width: 110,
    },
    {
      title: '員工姓名',
      dataIndex: 'employeeName',
      key: 'employeeName',
      width: 100,
    },
    {
      title: '所屬部門',
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 220,
    },
    {
      title: '登錄時間',
      dataIndex: 'loginTime',
      key: 'loginTime',
      width: 180,
      sorter: (a, b) => a.loginTime.localeCompare(b.loginTime),
      defaultSortOrder: 'descend',
    },
    {
      title: '退出時間',
      dataIndex: 'logoutTime',
      key: 'logoutTime',
      width: 180,
      render: (val: string | null) => val || '-',
    },
    {
      title: '在線時長',
      dataIndex: 'duration',
      key: 'duration',
      width: 130,
      render: (val: number | null, record: LoginLogRecord) => {
        // 已退出：使用記錄的 duration
        if (record.logoutTime != null && val != null) {
          return formatDuration(val)
        }
        // 在線中：從登錄時間計算到當前時間（使用 now 狀態觸發重新渲染）
        const loginMs = new Date(record.loginTime).getTime()
        const nowMs = now.getTime()
        const seconds = Math.floor((nowMs - loginMs) / 1000)
        return seconds > 0 ? formatDuration(seconds) : '-'
      },
      sorter: (a, b) => {
        const getDuration = (item: LoginLogRecord) => {
          if (item.logoutTime != null && item.duration != null) return item.duration
          const loginMs = new Date(item.loginTime).getTime()
          return Math.floor((now.getTime() - loginMs) / 1000)
        }
        return getDuration(a) - getDuration(b)
      },
    },
    {
      title: '狀態',
      dataIndex: 'logoutReason',
      key: 'status',
      width: 140,
      render: (_: unknown, record: LoginLogRecord) => {
        if (record.logoutTime == null) {
          return <Tag color={LOGIN_STATUS_TAG[LOGIN_STATUS.ONLINE].color}>{LOGIN_STATUS_LABEL[LOGIN_STATUS.ONLINE]}</Tag>
        }
        const statusKey = record.logoutReason === 'timeout'
          ? LOGIN_STATUS.OFFLINE_TIMEOUT
          : record.logoutReason === 'forced'
            ? LOGIN_STATUS.OFFLINE_FORCED
            : LOGIN_STATUS.OFFLINE_MANUAL
        const config = LOGIN_STATUS_TAG[statusKey]
        return <Tag color={config?.color}>{LOGIN_STATUS_LABEL[statusKey]}</Tag>
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_: unknown, record: LoginLogRecord) => (
        <>
          {record.logoutTime == null && (
            <Button type="link" danger size="small" onClick={() => handleForceLogout(record)}>
              下線
            </Button>
          )}
          <Button type="link" danger size="small" onClick={() => handleDelete(record)}>
            刪除
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
          <Form.Item label="員工" name="keyword">
            <Input placeholder="請輸入工號/姓名" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="所屬部門" name="department">
            <TreeSelect
              placeholder="全部"
              allowClear
              treeData={deptTreeData}
              treeDefaultExpandAll
              showSearch
              treeNodeFilterProp="title"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item label="登錄日期" name="dateRange">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                查詢
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                重置
              </Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区：导出在左 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>
            導出
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
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條數據`,
          onChange: (p, s) => {
            setPage(s !== pageSize ? 1 : p)
            setPageSize(s)
          },
        }}
      />
    </div>
  )
}
