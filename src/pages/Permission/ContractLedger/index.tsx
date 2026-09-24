import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Select, Space, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { ExportOutlined, ReloadOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchContractLedger, type ContractLedgerItem, type ContractLedgerQuery } from '../../../api/employee'
import { fetchHrDictOptions, HR_DICT_TYPE } from '../../../api/hrDict'
import { exportToCSV } from '../../../utils/exportCSV'

/** 合同类型回退选项（HR 字典 CONTRACT_TYPE 不可用时） */
const DEFAULT_CONTRACT_TYPE_OPTIONS = ['劳动合同', '劳务合同', '实习协议', '竞业协议'].map(v => ({ value: v, label: v }))
/** 合同状态选项 */
const CONTRACT_STATUS_OPTIONS = ['生效中', '已终止', '已过期'].map(v => ({ value: v, label: v }))

export default function ContractLedger() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission('employee-management:edit')

  const [dataSource, setDataSource] = useState<ContractLedgerItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(10)
  // 已生效查询条件
  const [keyword, setKeyword] = useState<string>()
  const [company, setCompany] = useState<string>()
  const [contractType, setContractType] = useState<string>()
  const [status, setStatus] = useState<string>()
  const [searchForm] = Form.useForm()

  // 签约主体 / 合同类型 下拉（HR 字典，值=名称，与存储一致）
  const [companyOptions, setCompanyOptions] = useState<{ value: string; label: string }[]>([])
  const [contractTypeOptions, setContractTypeOptions] = useState<{ value: string; label: string }[]>([])
  useEffect(() => {
    fetchHrDictOptions(HR_DICT_TYPE.EMPLOYER_COMPANY)
      .then(list => setCompanyOptions(list.map(c => ({ value: c.name, label: c.name }))))
      .catch(() => setCompanyOptions([]))
    fetchHrDictOptions(HR_DICT_TYPE.CONTRACT_TYPE)
      .then(list => setContractTypeOptions(list.length ? list.map(c => ({ value: c.name, label: c.name })) : DEFAULT_CONTRACT_TYPE_OPTIONS))
      .catch(() => setContractTypeOptions(DEFAULT_CONTRACT_TYPE_OPTIONS))
  }, [])

  const baseQuery = useMemo<Omit<ContractLedgerQuery, 'page' | 'size'>>(
    () => ({ keyword, company, contractType, status }),
    [keyword, company, contractType, status],
  )

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchContractLedger({ page, size, ...baseQuery })
      setDataSource(res.records)
      setTotal(res.total)
    } catch {
      // 错误提示由请求层统一处理
    } finally {
      setLoading(false)
    }
  }, [page, size, baseQuery])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  const handleSearch = () => {
    const v = searchForm.getFieldsValue()
    setKeyword(v.keyword?.trim() || undefined)
    setCompany(v.company || undefined)
    setContractType(v.contractType || undefined)
    setStatus(v.status || undefined)
    setPage(1)
  }

  const handleReset = () => {
    searchForm.resetFields()
    setKeyword(undefined)
    setCompany(undefined)
    setContractType(undefined)
    setStatus(undefined)
    setPage(1)
  }

  /** 导出全部符合筛选条件的记录（逐页拉取） */
  const handleExport = async () => {
    setLoading(true)
    let all: ContractLedgerItem[] = []
    try {
      let p = 1
      for (;;) {
        const res = await fetchContractLedger({ page: p, size: 200, ...baseQuery })
        all = all.concat(res.records)
        if (res.records.length === 0 || all.length >= res.total || p >= 50) break
        p += 1
      }
    } catch {
      message.warning('導出失敗，請重試')
      return
    } finally {
      setLoading(false)
    }
    if (all.length === 0) {
      message.warning('暫無可導出數據')
      return
    }
    const exportColumns = [
      { title: '工號', dataIndex: 'empId' },
      { title: '姓名', dataIndex: 'employeeName' },
      { title: '部門', dataIndex: 'department' },
      { title: '合同編號', dataIndex: 'contractNo' },
      { title: '合同類型', dataIndex: 'contractType' },
      { title: '簽約主體', dataIndex: 'company' },
      { title: '開始日期', dataIndex: 'startDate' },
      { title: '結束日期', dataIndex: 'endDate' },
      { title: '簽訂日期', dataIndex: 'signDate' },
      { title: '狀態', dataIndex: 'status' },
      { title: '最後更新人', dataIndex: 'updatedBy' },
    ]
    exportToCSV('合同台賬', exportColumns, all)
  }

  const columns: TableColumnsType<ContractLedgerItem> = [
    {
      title: '員工', key: 'employee', width: 160, fixed: 'left',
      render: (_, r) => (
        <Space size={4}>
          <span>{r.employeeName || '-'}</span>
          <span style={{ color: '#8C8C8C' }}>({r.empId || '-'})</span>
        </Space>
      ),
    },
    { title: '部門', dataIndex: 'department', key: 'department', width: 140, render: (v: string) => v || '-' },
    { title: '合同編號', dataIndex: 'contractNo', key: 'contractNo', width: 160 },
    { title: '合同類型', dataIndex: 'contractType', key: 'contractType', width: 120, render: (v: string) => v || '-' },
    { title: '簽約主體', dataIndex: 'company', key: 'company', width: 200, render: (v: string) => v || '-' },
    { title: '開始日期', dataIndex: 'startDate', key: 'startDate', width: 120, render: (v: string) => v || '-' },
    { title: '結束日期', dataIndex: 'endDate', key: 'endDate', width: 120, render: (v: string) => v || '-' },
    { title: '簽訂日期', dataIndex: 'signDate', key: 'signDate', width: 120, render: (v: string) => v || '-' },
    {
      title: '狀態', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={v === '生效中' ? 'green' : 'default'}>{v || '-'}</Tag>,
    },
    { title: '最後更新人', dataIndex: 'updatedBy', key: 'updatedBy', width: 130, render: (v: string) => v || '-' },
    {
      title: '最後更新時間', dataIndex: 'updatedAt', key: 'updatedAt', width: 180,
      render: (v: string) => (v ? <span style={{ whiteSpace: 'nowrap' }}>{dayjs(v).format('YYYY-MM-DD HH:mm:ss')}</span> : '-'),
    },
    {
      title: '操作', key: 'action', width: 100, fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" icon={<UserOutlined />} onClick={() => navigate(`/employee-detail?id=${r.userId}`)}>
          查看員工
        </Button>
      ),
    },
  ]

  return (
    <div className="content-area">
      {/* 搜索区 */}
      <div className="search-section">
        <Form form={searchForm} layout="inline">
          <Form.Item label="關鍵詞" name="keyword">
            <Input placeholder="姓名 / 工號 / 合同編號" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item label="簽約主體" name="company">
            <Select placeholder="全部" allowClear style={{ width: 200 }} options={companyOptions} showSearch optionFilterProp="label" />
          </Form.Item>
          <Form.Item label="合同類型" name="contractType">
            <Select placeholder="全部" allowClear style={{ width: 140 }} options={contractTypeOptions} />
          </Form.Item>
          <Form.Item label="狀態" name="status">
            <Select placeholder="全部" allowClear style={{ width: 120 }} options={CONTRACT_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item>
            <div className="search-actions">
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查詢</Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
            </div>
          </Form.Item>
        </Form>
      </div>

      {/* 操作区 */}
      <div className="action-section">
        <div className="action-section-left">
          <Button className="btn-export" icon={<ExportOutlined />} onClick={handleExport}>導出</Button>
        </div>
        <div className="action-section-right">
          {canEdit && (
            <Button type="primary" onClick={() => navigate('/employee-management')}>
              到員工詳情維護合同
            </Button>
          )}
        </div>
      </div>

      <Table<ContractLedgerItem>
        className="nowrap-table"
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: page,
          pageSize: size,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 條`,
          onChange: (p, s) => {
            setPage(s !== size ? 1 : p)
            setSize(s)
          },
        }}
      />
    </div>
  )
}
