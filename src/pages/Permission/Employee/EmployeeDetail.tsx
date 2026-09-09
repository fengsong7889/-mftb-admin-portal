import { useEffect, useMemo, useState } from 'react'
import { Button, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Tabs, TreeSelect, message } from 'antd'
import type { TableColumnsType, TabsProps } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  ArrowLeftOutlined, PlusOutlined, EditOutlined, SaveOutlined,
  UserOutlined, IdcardOutlined,
} from '@ant-design/icons'
import { fetchEmployees, createEmployee, type EmployeeItem, type EmployeePayload } from '../../../api/employee'
import { fetchDepartments, DEPT_STATUS, type DepartmentItem } from '../../../api/department'
import { fetchPositions, POSITION_RANK_OPTIONS, type PositionItem } from '../../../api/position'
import { fetchRoles, type RoleItem } from '../../../api/role'

/* ═══════════════════════════════════════════
   类型定义
   ══════════════════════════════════════════ */

/** 职务数据记录 */
interface PositionRecord {
  id: number
  effectiveDate: string
  effectiveSeq: number
  operation: string
  reason: string
  reasonSub?: string
  leaveDate?: string
  serviceDept?: string
  position?: string
  workCountry?: string
  workCity?: string
  officeAddress?: string
  officeArea?: string
  company?: string
  contractLocation?: string
  costCompany?: string
  employeeCategory?: string
  mentor?: string
  workSystem?: string
  jobLevel?: string
  rankEtc?: string
  employmentType?: string
  directSuperior?: string
  costSettlementType?: string
}

/** 费用信息 - 收入项 */
interface SalaryIncomeItem {
  id: number
  name: string
  amount: number
  type: 'fixed' | 'variable'
  remark?: string
}

/** 费用信息 - 扣除项 */
interface SalaryDeductionItem {
  id: number
  name: string
  rate: number
  amount: number
  remark?: string
}

/** 费用信息 - 薪资配置 */
interface SalaryConfig {
  salaryStructure: string
  paymentMethod: string
  payDay: number
  bankName: string
  bankAccount: string
  taxCity: string
}

/** 基础信息 */
interface BasicInfo {
  gender: string
  nationality: string
  ethnicity: string
  birthDate: string
  idType: string
  idNumber: string
  idAddress: string
  maritalStatus: string
  politicalStatus: string
  religion?: string
  householdType: string
  householdLocation: string
  nativePlace: string
  mobile: string
  email: string
  address: string
  emergencyContact: string
  emergencyPhone: string
  emergencyRelation: string
}

/** 统一账号 */
interface UnifiedAccount {
  id: number
  platform: string
  account: string
  email?: string
  status: number
  bindDate: string
}

/** 合同信息 */
interface ContractRecord {
  id: number
  contractNo: string
  contractType: string
  startDate: string
  endDate: string
  signDate: string
  company: string
  status: string
  remark?: string
}

/** 奖惩信息 */
interface RewardPunishRecord {
  id: number
  type: 'reward' | 'punish'
  title: string
  date: string
  reason: string
  level: string
  issuer: string
  remark?: string
}

/* ═══════════════════════════════════════════
   Mock 数据（后端 API 就绪后替换）
   ═══════════════════════════════════════════ */

const MOCK_POSITION_RECORDS: PositionRecord[] = [
  {
    id: 1, effectiveDate: '2024-03-27', effectiveSeq: 0,
    operation: '重新进场', reason: '退场后重新进场',
    serviceDept: 'FTIC（履约与纺织品创新中心）/全球仓储营运部', position: '防损员',
    workCountry: '中国', workCity: '惠州', officeAddress: '仲恺新宜园区安防组',
    officeArea: '华南', company: '小米科技', contractLocation: '惠州',
    costCompany: '小米科技', employeeCategory: '正式员工', mentor: '张三',
    workSystem: '标准工时制', jobLevel: 'O2', rankEtc: 'R3',
    employmentType: '长期', directSuperior: '李四', costSettlementType: '公司结算',
  },
  {
    id: 2, effectiveDate: '2024-01-29', effectiveSeq: 0,
    operation: '离职', reason: '主动离职-交通原因',
    leaveDate: '2024-01-29',
  },
  {
    id: 3, effectiveDate: '2022-02-02', effectiveSeq: 0,
    operation: '重新雇佣', reason: '离职后入职',
    serviceDept: 'FTIC', position: '防损员',
    workCountry: '中国', workCity: '惠州',
    workSystem: '标准工时制', jobLevel: 'O2', rankEtc: 'R3',
    employmentType: '长期',
  },
]

const MOCK_SALARY_INCOME: SalaryIncomeItem[] = [
  { id: 1, name: '基本工资', amount: 8000, type: 'fixed' },
  { id: 2, name: '岗位津贴', amount: 2000, type: 'fixed' },
  { id: 3, name: '绩效奖金', amount: 3000, type: 'variable' },
  { id: 4, name: '交通补贴', amount: 500, type: 'fixed' },
  { id: 5, name: '餐饮补贴', amount: 800, type: 'fixed' },
  { id: 6, name: '通讯补贴', amount: 200, type: 'fixed' },
  { id: 7, name: '加班费', amount: 1500, type: 'variable' },
]

const MOCK_SALARY_DEDUCTION: SalaryDeductionItem[] = [
  { id: 1, name: '养老保险', rate: 8, amount: 640 },
  { id: 2, name: '医疗保险', rate: 2, amount: 160 },
  { id: 3, name: '失业保险', rate: 0.5, amount: 40 },
  { id: 4, name: '工伤保险', rate: 0, amount: 0 },
  { id: 5, name: '生育保险', rate: 0, amount: 0 },
  { id: 6, name: '住房公积金', rate: 12, amount: 960 },
  { id: 7, name: '个人所得税', rate: 0, amount: 350 },
]

const MOCK_SALARY_CONFIG: SalaryConfig = {
  salaryStructure: '岗位工资制',
  paymentMethod: '月结',
  payDay: 15,
  bankName: '中国工商银行',
  bankAccount: '6222 **** **** 1234',
  taxCity: '惠州市',
}

const MOCK_BASIC_INFO: BasicInfo = {
  gender: '男', nationality: '中国', ethnicity: '汉',
  birthDate: '1996-11-11', idType: '身份证',
  idNumber: '110121199611111210', idAddress: '中国',
  maritalStatus: '未婚', politicalStatus: '群众',
  religion: '佛教', householdType: '外地非农业户口',
  householdLocation: '4505-北海市', nativePlace: '广西壮族自治区-北海市',
  mobile: '18899898912', email: 'xiaomi@qq.com',
  address: '广东省肇庆市四会市碧桂园翡翠郡',
  emergencyContact: '小红', emergencyPhone: '13989181423', emergencyRelation: '母亲',
}

const MOCK_ACCOUNTS: UnifiedAccount[] = [
  { id: 1, platform: '企业微信', account: '12345', email: 'Yolanda@qq.com', status: 1, bindDate: '2024-01-15' },
  { id: 2, platform: '公司域账号', account: 'xiaomi', email: 'xiaomi@company.com', status: 1, bindDate: '2024-01-15' },
  { id: 3, platform: 'OA系统', account: 'XM001', status: 1, bindDate: '2024-02-01' },
]

const MOCK_CONTRACTS: ContractRecord[] = [
  {
    id: 1, contractNo: 'HT-2024-001', contractType: '劳动合同',
    startDate: '2024-03-27', endDate: '2027-03-26', signDate: '2024-03-27',
    company: '小米科技', status: '生效中',
  },
  {
    id: 2, contractNo: 'HT-2022-003', contractType: '劳动合同',
    startDate: '2022-02-02', endDate: '2024-01-29', signDate: '2022-02-02',
    company: '小米科技', status: '已终止',
  },
]

const MOCK_REWARDS_PUNISH: RewardPunishRecord[] = [
  {
    id: 1, type: 'reward', title: '年度优秀员工',
    date: '2024-12-31', reason: '年度绩效评定为A',
    level: '公司级', issuer: '人力资源部',
  },
  {
    id: 2, type: 'punish', title: '迟到警告',
    date: '2024-06-15', reason: '月累计迟到3次',
    level: '部门级', issuer: '部门主管',
  },
]

/* ═══════════════════════════════════════════
   主组件
   ═══════════════════════════════════════════ */

export default function EmployeeDetail() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const empId = searchParams.get('id')
  const isEdit = !!empId

  /** 當前是否非繁中語言 */
  const isNonZh = !i18n.language?.startsWith('zh')

  /** 狀態標籤（依賴 t，定義在組件內以便響應語言切換） */
  const statusTag = (status: number) =>
    status === 1
      ? <Tag color="success">{t('employee.statusEnabled')}</Tag>
      : <Tag color="default">{t('employee.statusDisabled')}</Tag>

  /* ── 新增模式表单（工号由后端自动生成） ── */
  const [createForm] = Form.useForm()
  const [creating, setCreating] = useState(false)
  const watchSequence = Form.useWatch('sequence', createForm)
  const watchPositionId = Form.useWatch('positionId', createForm)

  /* ── 员工基本信息 ── */
  const [employee, setEmployee] = useState<EmployeeItem | null>(null)
  const [loading, setLoading] = useState(false)

  /* ── 下拉数据（新增模式） ── */
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [positions, setPositions] = useState<PositionItem[]>([])
  const [roles, setRoles] = useState<RoleItem[]>([])

  /* ── Tab 状态 ── */
  const [activeTab, setActiveTab] = useState('position')

  /* ── 职务数据 ── */
  const [positionRecords, setPositionRecords] = useState<PositionRecord[]>(MOCK_POSITION_RECORDS)
  const [posModalVisible, setPosModalVisible] = useState(false)
  const [editingPos, setEditingPos] = useState<PositionRecord | null>(null)
  const [posForm] = Form.useForm()

  /* ─ 费用信息 ── */
  const [salaryIncome, setSalaryIncome] = useState<SalaryIncomeItem[]>(MOCK_SALARY_INCOME)
  const [salaryDeduction, setSalaryDeduction] = useState<SalaryDeductionItem[]>(MOCK_SALARY_DEDUCTION)
  const [salaryConfig, setSalaryConfig] = useState<SalaryConfig>(MOCK_SALARY_CONFIG)
  const [incomeModalVisible, setIncomeModalVisible] = useState(false)
  const [deductionModalVisible, setDeductionModalVisible] = useState(false)
  const [configModalVisible, setConfigModalVisible] = useState(false)
  const [editingIncome, setEditingIncome] = useState<SalaryIncomeItem | null>(null)
  const [editingDeduction, setEditingDeduction] = useState<SalaryDeductionItem | null>(null)
  const [incomeForm] = Form.useForm()
  const [deductionForm] = Form.useForm()
  const [configForm] = Form.useForm()

  /* ── 基础信息 ── */
  const [basicInfo, setBasicInfo] = useState<BasicInfo>(MOCK_BASIC_INFO)
  const [basicModalVisible, setBasicModalVisible] = useState(false)
  const [basicForm] = Form.useForm()

  /* ── 统一账号 ── */
  const [accounts, setAccounts] = useState<UnifiedAccount[]>(MOCK_ACCOUNTS)
  const [accountModalVisible, setAccountModalVisible] = useState(false)
  const [editingAccount, setEditingAccount] = useState<UnifiedAccount | null>(null)
  const [accountForm] = Form.useForm()

  /* ── 合同信息 ─ */
  const [contracts, setContracts] = useState<ContractRecord[]>(MOCK_CONTRACTS)
  const [contractModalVisible, setContractModalVisible] = useState(false)
  const [editingContract, setEditingContract] = useState<ContractRecord | null>(null)
  const [contractForm] = Form.useForm()

  /* ── 奖惩信息 ── */
  const [rewardsPunish, setRewardsPunish] = useState<RewardPunishRecord[]>(MOCK_REWARDS_PUNISH)
  const [rpModalVisible, setRpModalVisible] = useState(false)
  const [editingRp, setEditingRp] = useState<RewardPunishRecord | null>(null)
  const [rpForm] = Form.useForm()

  /* ─ 加载员工数据（编辑模式）── */
  useEffect(() => {
    if (!empId) return
    let cancelled = false
    setLoading(true)
    // 无 getById 接口，取较大分页后按 id 匹配
    fetchEmployees({ page: 1, size: 500 })
      .then((result) => {
        if (cancelled) return
        const emp = result.records.find(e => e.id === Number(empId))
        if (emp) setEmployee(emp)
        else message.error(t('employeeDetail.notFound'))
      })
      .catch(() => { if (!cancelled) message.error(t('employeeDetail.loadFailed')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- t 为翻译函数，语言切换无需重新拉取员工数据
  }, [empId])

  /* ── 加载下拉数据（新增模式）── */
  useEffect(() => {
    if (isEdit) return
    fetchDepartments().then(setDepartments).catch(() => { /* 静默 */ })
    fetchPositions().then(setPositions).catch(() => { /* 静默 */ })
    fetchRoles().then(setRoles).catch(() => { /* 静默 */ })
  }, [isEdit])

  /** 部门树数据（新增模式，停用部门不可选） */
  const deptTreeData = useMemo(() => {
    interface DeptTreeOption {
      value: number
      title: string
      disabled?: boolean
      children?: DeptTreeOption[]
    }
    const nodeMap = new Map<number, DeptTreeOption>()
    departments.forEach(dept => {
      nodeMap.set(dept.id, {
        value: dept.id,
        title: isNonZh ? (dept.nameEn || dept.name) : dept.name,
        disabled: dept.status !== DEPT_STATUS.ENABLED,
        children: [],
      })
    })
    const roots: DeptTreeOption[] = []
    departments.forEach(dept => {
      const node = nodeMap.get(dept.id)!
      const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
      if (parent) parent.children!.push(node)
      else roots.push(node)
    })
    return roots
  }, [departments, isNonZh])

  /** 按序列过滤职位选项 */
  const filteredPositions = useMemo(
    () => (watchSequence ? positions.filter(p => p.sequence === watchSequence) : positions),
    [positions, watchSequence],
  )

  /** 职等选项：仅展示职位管理中已配置的职等 */
  const availableRankOptions = useMemo(() => {
    const configuredRanks = new Set(positions.map(p => p.rank).filter(Boolean))
    return POSITION_RANK_OPTIONS.filter(opt => configuredRanks.has(opt.value))
  }, [positions])

  /** 切换序列时清空职位与职等 */
  const handleSequenceChange = () => {
    createForm.setFieldValue('positionId', undefined)
    createForm.setFieldValue('rank', undefined)
  }

  /** 切换职位时自动带出职等 */
  const handlePositionChange = (positionId: number | undefined) => {
    const pos = positions.find(p => p.id === positionId)
    createForm.setFieldValue('rank', positionId != null ? (pos?.rank ?? undefined) : undefined)
  }

  /** 提交新增员工 */
  const handleCreate = async () => {
    const values = await createForm.validateFields()
    const payload: EmployeePayload = {
      name: values.name.trim(),
      password: values.password,
      departmentId: values.departmentId ?? null,
      positionId: values.positionId ?? null,
      rank: values.rank ?? null,
      functionRoleIds: values.functionRoleIds ?? [],
    }
    setCreating(true)
    try {
      const created = await createEmployee(payload)
      message.success(t('employee.createSuccess', { empId: created.empId }))
      // 创建成功后跳转到详情页
      navigate(`/employee-detail?id=${created.id}`, { replace: true })
    } finally {
      setCreating(false)
    }
  }

  const handleBack = () => navigate('/employee-management')

  /* ══════════════════════════════════════════
     （tabItems 已移至「頁面渲染」前統一組裝求值，此處僅存說明）
     ═══════════════════════════════════════════ */

  /* ═══════════════════════════════════════════
     3.1 職務數據 Tab
     ═══════════════════════════════════════════ */

  const posColumns: TableColumnsType<PositionRecord> = [
    { title: t('employeeDetail.colEffectiveDate'), dataIndex: 'effectiveDate', key: 'effectiveDate', width: 120 },
    { title: t('employeeDetail.colEffectiveSeq'), dataIndex: 'effectiveSeq', key: 'effectiveSeq', width: 90 },
    { title: t('employeeDetail.colOperation'), dataIndex: 'operation', key: 'operation', width: 120,
      render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: t('common.colReason'), dataIndex: 'reason', key: 'reason', width: 180 },
    { title: t('employeeDetail.colServiceDept'), dataIndex: 'serviceDept', key: 'serviceDept', width: 200, render: (v: string) => v || '-' },
    { title: t('employee.positionLabel'), dataIndex: 'position', key: 'position', width: 120, render: (v: string) => v || '-' },
    { title: t('employeeDetail.colWorkSystem'), dataIndex: 'workSystem', key: 'workSystem', width: 120, render: (v: string) => v || '-' },
    { title: t('employeeDetail.colJobLevel2'), dataIndex: 'jobLevel', key: 'jobLevel', width: 80, render: (v: string) => v || '-' },
    { title: t('employeeDetail.colEmploymentType'), dataIndex: 'employmentType', key: 'employmentType', width: 100, render: (v: string) => v || '-' },
    { title: t('employeeDetail.colCostSettlement'), dataIndex: 'costSettlementType', key: 'costSettlementType', width: 120, render: (v: string) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 120, fixed: 'right',
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEditPos(record)}>{t('common.edit')}</Button>
          <Popconfirm title={t('common.confirmDelete')} description={t('employeeDetail.deletePosConfirm')} onConfirm={() => handleDeletePos(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Button type="link" size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleAddPos = () => {
    setEditingPos(null)
    posForm.resetFields()
    setPosModalVisible(true)
  }

  const handleEditPos = (record: PositionRecord) => {
    setEditingPos(record)
    posForm.setFieldsValue(record)
    setPosModalVisible(true)
  }

  const handleSavePos = async () => {
    const values = await posForm.validateFields()
    if (editingPos) {
      setPositionRecords(prev => prev.map(r => r.id === editingPos.id ? { ...r, ...values } : r))
      message.success(t('employeeDetail.posUpdated'))
    } else {
      setPositionRecords(prev => [{ ...values, id: Date.now(), effectiveSeq: 0 }, ...prev])
      message.success(t('employeeDetail.posAdded'))
    }
    setPosModalVisible(false)
  }

  const handleDeletePos = (id: number) => {
    setPositionRecords(prev => prev.filter(r => r.id !== id))
    message.success(t('employeeDetail.posDeleted'))
  }

  /* ═══════════════════════════════════════════
     3.2 費用信息 Tab
     ═══════════════════════════════════════════ */

  const totalIncome = useMemo(() => salaryIncome.reduce((s, i) => s + i.amount, 0), [salaryIncome])
  const totalDeduction = useMemo(() => salaryDeduction.reduce((s, i) => s + i.amount, 0), [salaryDeduction])
  const netSalary = totalIncome - totalDeduction

  const incomeColumns: TableColumnsType<SalaryIncomeItem> = [
    { title: t('employeeDetail.colIncomeName'), dataIndex: 'name', key: 'name' },
    { title: t('common.colType'), dataIndex: 'type', key: 'type', width: 100,
      render: (v: string) => <Tag color={v === 'fixed' ? 'blue' : 'orange'}>{v === 'fixed' ? t('employeeDetail.colFixed') : t('employeeDetail.colVariable')}</Tag> },
    { title: t('employeeDetail.colAmountCny'), dataIndex: 'amount', key: 'amount', width: 140,
      render: (v: number) => <span style={{ fontWeight: 600 }}>¥{v.toLocaleString()}</span> },
    { title: t('employeeDetail.colRemark'), dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 120,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEditIncome(record)}>{t('common.edit')}</Button>
          <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDeleteIncome(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Button type="link" size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const deductionColumns: TableColumnsType<SalaryDeductionItem> = [
    { title: t('employeeDetail.colDeductionName'), dataIndex: 'name', key: 'name' },
    { title: t('employeeDetail.colRate'), dataIndex: 'rate', key: 'rate', width: 100,
      render: (v: number) => v > 0 ? `${v}%` : '-' },
    { title: t('employeeDetail.colAmountCny'), dataIndex: 'amount', key: 'amount', width: 140,
      render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f', fontWeight: 600 }}>¥{v.toLocaleString()}</span> : '-' },
    { title: t('employeeDetail.colRemark'), dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 120,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEditDeduction(record)}>{t('common.edit')}</Button>
          <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDeleteDeduction(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Button type="link" size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleAddIncome = () => {
    setEditingIncome(null)
    incomeForm.resetFields()
    incomeForm.setFieldsValue({ type: 'fixed' })
    setIncomeModalVisible(true)
  }

  const handleEditIncome = (record: SalaryIncomeItem) => {
    setEditingIncome(record)
    incomeForm.setFieldsValue(record)
    setIncomeModalVisible(true)
  }

  const handleSaveIncome = async () => {
    const values = await incomeForm.validateFields()
    if (editingIncome) {
      setSalaryIncome(prev => prev.map(r => r.id === editingIncome.id ? { ...r, ...values } : r))
      message.success(t('employeeDetail.incomeUpdated'))
    } else {
      setSalaryIncome(prev => [...prev, { ...values, id: Date.now() }])
      message.success(t('employeeDetail.incomeAdded'))
    }
    setIncomeModalVisible(false)
  }

  const handleDeleteIncome = (id: number) => {
    setSalaryIncome(prev => prev.filter(r => r.id !== id))
    message.success(t('employeeDetail.incomeDeleted'))
  }

  const handleAddDeduction = () => {
    setEditingDeduction(null)
    deductionForm.resetFields()
    setDeductionModalVisible(true)
  }

  const handleEditDeduction = (record: SalaryDeductionItem) => {
    setEditingDeduction(record)
    deductionForm.setFieldsValue(record)
    setDeductionModalVisible(true)
  }

  const handleSaveDeduction = async () => {
    const values = await deductionForm.validateFields()
    if (editingDeduction) {
      setSalaryDeduction(prev => prev.map(r => r.id === editingDeduction.id ? { ...r, ...values } : r))
      message.success(t('employeeDetail.deductionUpdated'))
    } else {
      setSalaryDeduction(prev => [...prev, { ...values, id: Date.now() }])
      message.success(t('employeeDetail.deductionAdded'))
    }
    setDeductionModalVisible(false)
  }

  const handleDeleteDeduction = (id: number) => {
    setSalaryDeduction(prev => prev.filter(r => r.id !== id))
    message.success(t('employeeDetail.deductionDeleted'))
  }

  const handleEditConfig = () => {
    configForm.setFieldsValue(salaryConfig)
    setConfigModalVisible(true)
  }

  const handleSaveConfig = async () => {
    const values = await configForm.validateFields()
    setSalaryConfig(values)
    message.success(t('employeeDetail.configUpdated'))
    setConfigModalVisible(false)
  }

  /* ═══════════════════════════════════════════
     3.3 基礎信息 Tab
     ═══════════════════════════════════════════ */

  const handleEditBasic = () => {
    basicForm.setFieldsValue(basicInfo)
    setBasicModalVisible(true)
  }

  const handleSaveBasic = async () => {
    const values = await basicForm.validateFields()
    setBasicInfo(values)
    message.success(t('employeeDetail.basicUpdated'))
    setBasicModalVisible(false)
  }

  /* ═══════════════════════════════════════════
     3.4 統一賬號管理 Tab
     ═══════════════════════════════════════════ */

  const accountColumns: TableColumnsType<UnifiedAccount> = [
    { title: t('employeeDetail.colPlatform'), dataIndex: 'platform', key: 'platform', width: 140 },
    { title: t('employeeDetail.colAccount'), dataIndex: 'account', key: 'account', width: 160 },
    { title: t('employeeDetail.colEmail'), dataIndex: 'email', key: 'email', render: (v: string) => v || '-' },
    { title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 90, render: (v: number) => statusTag(v) },
    { title: t('employeeDetail.colBindDate'), dataIndex: 'bindDate', key: 'bindDate', width: 120 },
    {
      title: t('common.colAction'), key: 'action', width: 120,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEditAccount(record)}>{t('common.edit')}</Button>
          <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDeleteAccount(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Button type="link" size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleAddAccount = () => {
    setEditingAccount(null)
    accountForm.resetFields()
    accountForm.setFieldsValue({ status: 1 })
    setAccountModalVisible(true)
  }

  const handleEditAccount = (record: UnifiedAccount) => {
    setEditingAccount(record)
    accountForm.setFieldsValue(record)
    setAccountModalVisible(true)
  }

  const handleSaveAccount = async () => {
    const values = await accountForm.validateFields()
    if (editingAccount) {
      setAccounts(prev => prev.map(r => r.id === editingAccount.id ? { ...r, ...values } : r))
      message.success(t('employeeDetail.accountUpdated'))
    } else {
      setAccounts(prev => [...prev, { ...values, id: Date.now(), bindDate: dayjs().format('YYYY-MM-DD') }])
      message.success(t('employeeDetail.accountAdded'))
    }
    setAccountModalVisible(false)
  }

  const handleDeleteAccount = (id: number) => {
    setAccounts(prev => prev.filter(r => r.id !== id))
    message.success(t('employeeDetail.accountDeleted'))
  }

  /* ═══════════════════════════════════════════
     3.5 合同信息 Tab
     ═══════════════════════════════════════════ */

  const contractColumns: TableColumnsType<ContractRecord> = [
    { title: t('employeeDetail.colContractNo'), dataIndex: 'contractNo', key: 'contractNo', width: 140 },
    { title: t('employeeDetail.colContractType'), dataIndex: 'contractType', key: 'contractType', width: 120 },
    { title: t('employeeDetail.colStartDate'), dataIndex: 'startDate', key: 'startDate', width: 120 },
    { title: t('employeeDetail.colEndDate'), dataIndex: 'endDate', key: 'endDate', width: 120 },
    { title: t('employeeDetail.colSignDate'), dataIndex: 'signDate', key: 'signDate', width: 120 },
    { title: t('employeeDetail.colCompany'), dataIndex: 'company', key: 'company', width: 140 },
    { title: t('common.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={v === '生效中' ? 'green' : 'default'}>{v}</Tag> },
    { title: t('employeeDetail.colRemark'), dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 120,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEditContract(record)}>{t('common.edit')}</Button>
          <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDeleteContract(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Button type="link" size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleAddContract = () => {
    setEditingContract(null)
    contractForm.resetFields()
    setContractModalVisible(true)
  }

  const handleEditContract = (record: ContractRecord) => {
    setEditingContract(record)
    contractForm.setFieldsValue(record)
    setContractModalVisible(true)
  }

  const handleSaveContract = async () => {
    const values = await contractForm.validateFields()
    if (editingContract) {
      setContracts(prev => prev.map(r => r.id === editingContract.id ? { ...r, ...values } : r))
      message.success(t('employeeDetail.contractUpdated'))
    } else {
      setContracts(prev => [...prev, { ...values, id: Date.now() }])
      message.success(t('employeeDetail.contractAdded'))
    }
    setContractModalVisible(false)
  }

  const handleDeleteContract = (id: number) => {
    setContracts(prev => prev.filter(r => r.id !== id))
    message.success(t('employeeDetail.contractDeleted'))
  }

  /* ═══════════════════════════════════════════
     3.6 獎懲信息 Tab
     ═══════════════════════════════════════════ */

  const rpColumns: TableColumnsType<RewardPunishRecord> = [
    { title: t('common.colType'), dataIndex: 'type', key: 'type', width: 90,
      render: (v: string) => <Tag color={v === 'reward' ? 'green' : 'red'}>{v === 'reward' ? t('employeeDetail.typeReward') : t('employeeDetail.typePunish')}</Tag> },
    { title: t('employeeDetail.colTitle'), dataIndex: 'title', key: 'title' },
    { title: t('employeeDetail.colDate'), dataIndex: 'date', key: 'date', width: 120 },
    { title: t('common.colReason'), dataIndex: 'reason', key: 'reason' },
    { title: t('employeeDetail.colLevel'), dataIndex: 'level', key: 'level', width: 100 },
    { title: t('employeeDetail.colIssuer'), dataIndex: 'issuer', key: 'issuer', width: 120 },
    { title: t('employeeDetail.colRemark'), dataIndex: 'remark', key: 'remark', render: (v: string) => v || '-' },
    {
      title: t('common.colAction'), key: 'action', width: 120,
      render: (_, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          <Button type="link" size="small" onClick={() => handleEditRp(record)}>{t('common.edit')}</Button>
          <Popconfirm title={t('common.confirmDelete')} onConfirm={() => handleDeleteRp(record.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
            <Button type="link" size="small" danger>{t('common.delete')}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const handleAddRp = () => {
    setEditingRp(null)
    rpForm.resetFields()
    rpForm.setFieldsValue({ type: 'reward' })
    setRpModalVisible(true)
  }

  const handleEditRp = (record: RewardPunishRecord) => {
    setEditingRp(record)
    rpForm.setFieldsValue(record)
    setRpModalVisible(true)
  }

  const handleSaveRp = async () => {
    const values = await rpForm.validateFields()
    if (editingRp) {
      setRewardsPunish(prev => prev.map(r => r.id === editingRp.id ? { ...r, ...values } : r))
      message.success(t('employeeDetail.rpUpdated'))
    } else {
      setRewardsPunish(prev => [...prev, { ...values, id: Date.now() }])
      message.success(t('employeeDetail.rpAdded'))
    }
    setRpModalVisible(false)
  }

  const handleDeleteRp = (id: number) => {
    setRewardsPunish(prev => prev.filter(r => r.id !== id))
    message.success(t('employeeDetail.rpDeleted'))
  }

  /* ═══════════════════════════════════════════
     渲染 Tab 內容
     ═══════════════════════════════════════════ */

  function renderPositionTab() {
    return (
      <div>
        <Table
          columns={posColumns}
          dataSource={positionRecords}
          rowKey="id"
          pagination={false}
          scroll={{ x: 'max-content' }}
          size="middle"
        />
        {/* Tab 下方操作按鈕 */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddPos}>{t('employeeDetail.addPos')}</Button>
        </div>
      </div>
    )
  }

  function renderSalaryTab() {
    return (
      <div>
        {/* 薪資概覽卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          <div style={{ padding: 20, borderRadius: 8, background: '#F6FFED', border: '1px solid #D9F7BE' }}>
            <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 8 }}>{t('employeeDetail.grossSalary')}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#52C41A' }}>¥{totalIncome.toLocaleString()}</div>
          </div>
          <div style={{ padding: 20, borderRadius: 8, background: '#FFF2F0', border: '1px solid #FFCCC7' }}>
            <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 8 }}>{t('employeeDetail.totalDeduction')}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#FF4D4F' }}>¥{totalDeduction.toLocaleString()}</div>
          </div>
          <div style={{ padding: 20, borderRadius: 8, background: '#E6F7FF', border: '1px solid #91D5FF' }}>
            <div style={{ fontSize: 13, color: '#8C8C8C', marginBottom: 8 }}>{t('employeeDetail.netSalary')}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#1890FF' }}>¥{netSalary.toLocaleString()}</div>
          </div>
        </div>

        {/* 收入項目 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14, color: '#52c41a' }}>💰</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.incomeTitle')}</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddIncome}>{t('employeeDetail.addIncome')}</Button>
          </div>
          <Table columns={incomeColumns} dataSource={salaryIncome} rowKey="id" pagination={false} size="small" />
        </div>

        {/* 扣除項目 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff2f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14, color: '#ff4d4f' }}>📉</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.deductionTitle')}</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddDeduction}>{t('employeeDetail.addDeduction')}</Button>
          </div>
          <Table columns={deductionColumns} dataSource={salaryDeduction} rowKey="id" pagination={false} size="small" />
        </div>

        {/* 薪資配置 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14, color: '#fa8c16' }}>️</span>
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.configTitle')}</span>
              <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            </div>
            <Button icon={<EditOutlined />} onClick={handleEditConfig}>{t('employeeDetail.editConfig')}</Button>
          </div>
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label={t('employeeDetail.labelSalaryStructure')}>{salaryConfig.salaryStructure}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelPaymentMethod')}>{salaryConfig.paymentMethod}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelPayDay')}>{t('employeeDetail.payDayFormat', { day: salaryConfig.payDay })}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelBankName')}>{salaryConfig.bankName}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelBankAccount')}>{salaryConfig.bankAccount}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelTaxCity')}>{salaryConfig.taxCity}</Descriptions.Item>
          </Descriptions>
        </div>
      </div>
    )
  }

  function renderBasicTab() {
    return (
      <div>
        {/* 個人信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.personalInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label={t('employee.nameLabel')}>{employee?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelGender')}>{basicInfo.gender}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelNationality')}>{basicInfo.nationality}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelEthnicity')}>{basicInfo.ethnicity}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelBirthDate')}>{basicInfo.birthDate}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelMaritalStatus')}>{basicInfo.maritalStatus}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelPoliticalStatus')}>{basicInfo.politicalStatus}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelReligion')}>{basicInfo.religion || '-'}</Descriptions.Item>
          </Descriptions>
        </div>

        {/* 證件信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IdcardOutlined style={{ fontSize: 14, color: '#722ed1' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.idInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label={t('employeeDetail.labelIdType')}>{basicInfo.idType}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelIdNumber')}>{basicInfo.idNumber}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelIdAddress')}>{basicInfo.idAddress}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelHouseholdType')}>{basicInfo.householdType}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelHouseholdLocation')}>{basicInfo.householdLocation}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelNativePlace')}>{basicInfo.nativePlace}</Descriptions.Item>
          </Descriptions>
        </div>

        {/* 通訊信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6fffb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#13c2c2' }}></span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.contactInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label={t('employeeDetail.labelMobile')}>{basicInfo.mobile}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelEmail')}>{basicInfo.email}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelAddress')} span={3}>{basicInfo.address}</Descriptions.Item>
          </Descriptions>
        </div>

        {/* 緊急聯繫人 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#fa8c16' }}>🚨</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.emergencyInfo')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label={t('employee.nameLabel')}>{basicInfo.emergencyContact}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelEmergencyPhone')}>{basicInfo.emergencyPhone}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelRelation')}>{basicInfo.emergencyRelation}</Descriptions.Item>
          </Descriptions>
        </div>

        {/* Tab 下方操作按鈕 */}
        <div style={{ marginTop: 8 }}>
          <Button icon={<EditOutlined />} onClick={handleEditBasic}>{t('employeeDetail.editBasic')}</Button>
        </div>
      </div>
    )
  }

  function renderAccountTab() {
    return (
      <div>
        <Table
          columns={accountColumns}
          dataSource={accounts}
          rowKey="id"
          pagination={false}
          size="middle"
        />
        {/* Tab 下方操作按鈕 */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddAccount}>{t('employeeDetail.addAccount')}</Button>
        </div>
      </div>
    )
  }

  function renderContractTab() {
    return (
      <div>
        <Table
          columns={contractColumns}
          dataSource={contracts}
          rowKey="id"
          pagination={false}
          scroll={{ x: 'max-content' }}
          size="middle"
        />
        {/* Tab 下方操作按鈕 */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddContract}>{t('employeeDetail.addContract')}</Button>
        </div>
      </div>
    )
  }

  function renderRewardTab() {
    return (
      <div>
        <Table
          columns={rpColumns}
          dataSource={rewardsPunish}
          rowKey="id"
          pagination={false}
          scroll={{ x: 'max-content' }}
          size="middle"
        />
        {/* Tab 下方操作按鈕 */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRp}>{t('employeeDetail.addRp')}</Button>
        </div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════
     頁面渲染
     ═══════════════════════════════════════════ */

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <div style={{ fontSize: 16, color: '#8C8C8C' }}>{t('common.loading')}</div>
      </div>
    )
  }

  /* ═══════════════════════════════════════════
     Tab 配置（依賴上方 renderXxxTab 與 columns 定義，須在其後求值，避免 TDZ 報錯）
     ═══════════════════════════════════════════ */

  const tabItems: TabsProps['items'] = [
    { key: 'position', label: t('employeeDetail.tabPosition'), children: renderPositionTab(), disabled: !isEdit },
    { key: 'salary', label: t('employeeDetail.tabSalary'), children: renderSalaryTab(), disabled: !isEdit },
    { key: 'basic', label: t('employeeDetail.tabBasic'), children: renderBasicTab(), disabled: !isEdit },
    { key: 'account', label: t('employeeDetail.tabAccount'), children: renderAccountTab(), disabled: !isEdit },
    { key: 'contract', label: t('employeeDetail.tabContract'), children: renderContractTab(), disabled: !isEdit },
    { key: 'reward', label: t('employeeDetail.tabReward'), children: renderRewardTab(), disabled: !isEdit },
  ]

  return (
    <div className="content-area">
      {/* ═══ 頁面頭部（全局統一風格） ═══ */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? `${t('employeeDetail.pageTitleEdit')} - ${employee?.name || ''}` : t('employee.addTitle')}
            </h2>
          </div>
          {employee && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#8C8C8C' }}>{t('employeeDetail.empIdColon', { empId: employee.empId })}</span>
              {statusTag(employee.status)}
            </div>
          )}
        </div>
      </div>

      {/* ══ 員工基礎信息卡片 ═══ */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.baseInfoTitle')}</span>
          {!isEdit && <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>{t('employeeDetail.newTag')}</Tag>}
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        {isEdit ? (
          employee ? (
            <Descriptions column={4} size="small" bordered>
              <Descriptions.Item label={t('employee.nameLabel')}>{employee.name}</Descriptions.Item>
              <Descriptions.Item label={t('employee.empIdLabel')}>{employee.empId}</Descriptions.Item>
              <Descriptions.Item label={t('employee.deptLabel')}>{employee.department || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.positionLabel')}>{employee.position || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.sequenceLabel')}>{employee.sequence || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.colJobLevel')}>{employee.jobLevel || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.rankLabel')}>{employee.rank || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('common.colStatus')}>{statusTag(employee.status)}</Descriptions.Item>
              <Descriptions.Item label={t('employee.roleAuthLabel')} span={2}>
                {employee.functionRoleIds?.length
                  ? employee.functionRoleIds.map(id => <Tag key={id} color="blue">{t('employeeDetail.roleTag', { id })}</Tag>)
                  : <span style={{ color: '#8C8C8C' }}>{t('employee.notBound')}</span>}
              </Descriptions.Item>
              <Descriptions.Item label={t('employee.colUpdatedBy')}>{employee.updatedBy || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.colUpdatedAt')}>
                {employee.updatedAt ? dayjs(employee.updatedAt).format('YYYY-MM-DD HH:mm:ss') : '-'}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#8C8C8C' }}>
              {t('employeeDetail.notFoundHint')}
            </div>
          )
        ) : (
          /* 新增模式：頂部為可編輯表單，工號由後端自動生成 */
          <Form form={createForm} layout="vertical" autoComplete="off">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 16px' }}>
              <Form.Item name="name" label={t('employee.nameLabel')} rules={[{ required: true, message: t('employee.nameRequired') }]}>
                <Input placeholder={t('employee.namePlaceholder')} allowClear />
              </Form.Item>
              <Form.Item name="empId" label={t('employee.empIdLabel')} extra={t('employee.empIdExtraCreate')}>
                <Input placeholder={t('employee.empIdPlaceholder')} disabled />
              </Form.Item>
              <Form.Item
                name="password"
                label={t('employee.passwordLabel')}
                rules={[
                  { required: true, message: t('employee.passwordRequired') },
                  { min: 6, max: 32, message: t('employee.passwordLength') },
                ]}
              >
                <Input.Password placeholder={t('employee.passwordPlaceholder')} autoComplete="new-password" />
              </Form.Item>
              <Form.Item name="departmentId" label={t('employee.deptLabel')} extra={t('employee.deptExtra')}>
                <TreeSelect
                  treeData={deptTreeData}
                  placeholder={t('employee.deptPlaceholder')}
                  allowClear
                  treeDefaultExpandAll
                  showSearch
                  treeNodeFilterProp="title"
                />
              </Form.Item>
              <Form.Item name="sequence" label={t('employee.sequenceLabel')} extra={t('employee.sequenceExtra')}>
                <Select
                  placeholder={t('employee.sequencePlaceholder')}
                  allowClear
                  options={[
                    { value: 'M', label: t('employeeDetail.seqM') },
                    { value: 'T', label: t('employeeDetail.seqT') },
                    { value: 'P', label: t('employeeDetail.seqP') },
                  ]}
                  onChange={handleSequenceChange}
                />
              </Form.Item>
              <Form.Item name="positionId" label={t('employee.positionLabel')} extra={t('employee.positionExtra')}>
                <Select
                  placeholder={watchSequence ? t('employee.positionPlaceholder') : t('employee.positionPlaceholderSeq')}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  options={filteredPositions.map(p => ({ value: p.id, label: `${isNonZh ? (p.nameEn || p.name) : p.name}（${p.jobLevel}）` }))}
                  onChange={handlePositionChange}
                />
              </Form.Item>
              <Form.Item name="rank" label={t('employee.rankLabel')} extra={watchPositionId ? t('employee.rankAutoExtra') : t('employee.rankConfigExtra')}>
                <Select
                  placeholder={watchPositionId ? t('employee.rankAutoPlaceholder') : t('employee.rankSelectPlaceholder')}
                  disabled={!watchPositionId}
                  allowClear={!watchPositionId}
                  options={availableRankOptions}
                />
              </Form.Item>
              <Form.Item name="functionRoleIds" label={t('employee.roleAuthLabel')} extra={t('employee.roleAuthExtra')}>
                <Select
                  mode="multiple"
                  placeholder={t('employee.roleAuthPlaceholder')}
                  allowClear
                  optionFilterProp="label"
                  options={roles.map(r => ({ value: r.id, label: r.name, disabled: r.status !== 1 }))}
                  maxTagCount="responsive"
                />
              </Form.Item>
            </div>
          </Form>
        )}
      </div>

      {/* ══ Tab 欄目（新增模式下禁用） ═══ */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        style={{ marginBottom: 16 }}
      />

      {/* ══ 底部操作按鈕（僅新增模式顯示，全局統一 form-footer） ═══ */}
      {!isEdit && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={creating} onClick={handleCreate}>
            {t('common.save')}
          </Button>
        </div>
      )}

      {/* ═══════════════════════════════════════════
         彈窗：職務數據
         ═══════════════════════════════════════════ */}
      <Modal
        title={editingPos ? t('employeeDetail.editPosTitle') : t('employeeDetail.addPosTitle')}
        open={posModalVisible}
        onOk={handleSavePos}
        onCancel={() => setPosModalVisible(false)}
        width={720}
        destroyOnClose
      >
        <Form form={posForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="effectiveDate" label={t('employeeDetail.colEffectiveDate')} rules={[{ required: true, message: t('employeeDetail.effectiveDateRequired') }]}>
              <Input placeholder={t('employeeDetail.effectiveDatePh')} />
            </Form.Item>
            <Form.Item name="operation" label={t('employeeDetail.colOperation')} rules={[{ required: true, message: t('employeeDetail.operationRequired') }]}>
              <Select options={[
                { value: '雇佣', label: '雇佣' },
                { value: '重新雇佣', label: '重新雇佣' },
                { value: '重新进场', label: '重新进场' },
                { value: '离职', label: '离职' },
                { value: '调岗', label: '调岗' },
              ]} />
            </Form.Item>
          </div>
          <Form.Item name="reason" label={t('common.colReason')} rules={[{ required: true, message: t('employeeDetail.reasonRequired') }]}>
            <Input placeholder={t('employeeDetail.reasonRequired')} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="serviceDept" label={t('employeeDetail.colServiceDept')}>
              <Input placeholder={t('employeeDetail.colServiceDept')} />
            </Form.Item>
            <Form.Item name="position" label={t('employee.positionLabel')}>
              <Input placeholder={t('employee.positionLabel')} />
            </Form.Item>
            <Form.Item name="workSystem" label={t('employeeDetail.colWorkSystem')}>
              <Select options={[
                { value: '标准工时制', label: '标准工时制' },
                { value: '综合工时制', label: '综合工时制' },
                { value: '不定时工时制', label: '不定时工时制' },
              ]} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="jobLevel" label={t('employeeDetail.colJobLevel2')}>
              <Input placeholder={t('employeeDetail.colJobLevel2')} />
            </Form.Item>
            <Form.Item name="employmentType" label={t('employeeDetail.colEmploymentType')}>
              <Select options={[
                { value: '长期', label: '长期' },
                { value: '临时', label: '临时' },
              ]} />
            </Form.Item>
            <Form.Item name="costSettlementType" label={t('employeeDetail.colCostSettlement')}>
              <Select options={[
                { value: '公司结算', label: '公司结算' },
                { value: '部门结算', label: '部门结算' },
              ]} />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：收入項目
         ═══════════════════════════════════════════ */}
      <Modal
        title={editingIncome ? t('employeeDetail.editIncomeTitle') : t('employeeDetail.addIncomeTitle')}
        open={incomeModalVisible}
        onOk={handleSaveIncome}
        onCancel={() => setIncomeModalVisible(false)}
        width={480}
        destroyOnClose
      >
        <Form form={incomeForm} layout="vertical">
          <Form.Item name="name" label={t('employeeDetail.labelItemName')} rules={[{ required: true, message: t('employeeDetail.itemNameRequired') }]}>
            <Input placeholder={t('employeeDetail.itemNameIncomePh')} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="type" label={t('common.colType')} rules={[{ required: true }]}>
              <Select options={[
                { value: 'fixed', label: t('employeeDetail.colFixed') },
                { value: 'variable', label: t('employeeDetail.colVariable') },
              ]} />
            </Form.Item>
            <Form.Item name="amount" label={t('employeeDetail.colAmountCny')} rules={[{ required: true, message: t('employeeDetail.amountRequired') }]}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
          </div>
          <Form.Item name="remark" label={t('employeeDetail.colRemark')}>
            <Input.TextArea rows={2} placeholder={t('employeeDetail.remarkOptionalPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：扣除項目
         ═══════════════════════════════════════════ */}
      <Modal
        title={editingDeduction ? t('employeeDetail.editDeductionTitle') : t('employeeDetail.addDeductionTitle')}
        open={deductionModalVisible}
        onOk={handleSaveDeduction}
        onCancel={() => setDeductionModalVisible(false)}
        width={480}
        destroyOnClose
      >
        <Form form={deductionForm} layout="vertical">
          <Form.Item name="name" label={t('employeeDetail.labelItemName')} rules={[{ required: true, message: t('employeeDetail.itemNameRequired') }]}>
            <Input placeholder={t('employeeDetail.itemNameDeductionPh')} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="rate" label={t('employeeDetail.colRate')} rules={[{ required: true, message: t('employeeDetail.rateRequired') }]}>
              <InputNumber min={0} max={100} step={0.1} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
            <Form.Item name="amount" label={t('employeeDetail.colAmountCny')} rules={[{ required: true, message: t('employeeDetail.amountRequired') }]}>
              <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
          </div>
          <Form.Item name="remark" label={t('employeeDetail.colRemark')}>
            <Input.TextArea rows={2} placeholder={t('employeeDetail.remarkOptionalPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：薪資配置
         ═══════════════════════════════════════════ */}
      <Modal
        title={t('employeeDetail.editConfigTitle')}
        open={configModalVisible}
        onOk={handleSaveConfig}
        onCancel={() => setConfigModalVisible(false)}
        width={560}
        destroyOnClose
      >
        <Form form={configForm} layout="vertical" initialValues={salaryConfig}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="salaryStructure" label={t('employeeDetail.labelSalaryStructure')} rules={[{ required: true }]}>
              <Select options={[
                { value: '岗位工资制', label: '岗位工资制' },
                { value: '绩效工资制', label: '绩效工资制' },
                { value: '年薪制', label: '年薪制' },
                { value: '计件工资制', label: '计件工资制' },
              ]} />
            </Form.Item>
            <Form.Item name="paymentMethod" label={t('employeeDetail.labelPaymentMethod')} rules={[{ required: true }]}>
              <Select options={[
                { value: '月结', label: '月结' },
                { value: '周结', label: '周结' },
                { value: '日结', label: '日结' },
              ]} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="payDay" label={t('employeeDetail.labelPayDay')} rules={[{ required: true }]}>
              <InputNumber min={1} max={31} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="taxCity" label={t('employeeDetail.labelTaxCity')}>
              <Input placeholder={t('employeeDetail.taxCityPh')} />
            </Form.Item>
          </div>
          <Form.Item name="bankName" label={t('employeeDetail.labelBankName')}>
            <Input placeholder={t('employeeDetail.bankNamePh')} />
          </Form.Item>
          <Form.Item name="bankAccount" label={t('employeeDetail.labelBankAccount')}>
            <Input placeholder={t('employeeDetail.bankAccountPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：基礎信息
         ═══════════════════════════════════════════ */}
      <Modal
        title={t('employeeDetail.editBasic')}
        open={basicModalVisible}
        onOk={handleSaveBasic}
        onCancel={() => setBasicModalVisible(false)}
        width={720}
        destroyOnClose
      >
        <Form form={basicForm} layout="vertical" initialValues={basicInfo}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="gender" label={t('employeeDetail.labelGender')}>
              <Select options={[{ value: '男', label: '男' }, { value: '女', label: '女' }]} />
            </Form.Item>
            <Form.Item name="nationality" label={t('employeeDetail.labelNationality')}>
              <Input />
            </Form.Item>
            <Form.Item name="ethnicity" label={t('employeeDetail.labelEthnicity')}>
              <Input />
            </Form.Item>
            <Form.Item name="birthDate" label={t('employeeDetail.labelBirthDate')}>
              <Input placeholder={t('employeeDetail.datePh')} />
            </Form.Item>
            <Form.Item name="maritalStatus" label={t('employeeDetail.labelMaritalStatus')}>
              <Select options={[
                { value: '未婚', label: '未婚' },
                { value: '已婚', label: '已婚' },
                { value: '离异', label: '离异' },
              ]} />
            </Form.Item>
            <Form.Item name="politicalStatus" label={t('employeeDetail.labelPoliticalStatus')}>
              <Select options={[
                { value: '群众', label: '群众' },
                { value: '党员', label: '党员' },
                { value: '团员', label: '团员' },
              ]} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="idType" label={t('employeeDetail.labelIdType')}>
              <Select options={[{ value: '身份证', label: '身份证' }, { value: '护照', label: '护照' }]} />
            </Form.Item>
            <Form.Item name="idNumber" label={t('employeeDetail.labelIdNumber')}>
              <Input />
            </Form.Item>
            <Form.Item name="idAddress" label={t('employeeDetail.labelIdAddress')}>
              <Input />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="mobile" label={t('employeeDetail.labelMobile')}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label={t('employeeDetail.labelEmail')}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="address" label={t('employeeDetail.labelAddress')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="emergencyContact" label={t('employeeDetail.labelEmergencyContact')}>
              <Input />
            </Form.Item>
            <Form.Item name="emergencyPhone" label={t('employeeDetail.labelEmergencyPhone')}>
              <Input />
            </Form.Item>
            <Form.Item name="emergencyRelation" label={t('employeeDetail.labelRelation')}>
              <Input />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：統一賬號
         ═══════════════════════════════════════════ */}
      <Modal
        title={editingAccount ? t('employeeDetail.editAccountTitle') : t('employeeDetail.addAccountTitle')}
        open={accountModalVisible}
        onOk={handleSaveAccount}
        onCancel={() => setAccountModalVisible(false)}
        width={480}
        destroyOnClose
      >
        <Form form={accountForm} layout="vertical">
          <Form.Item name="platform" label={t('employeeDetail.colPlatform')} rules={[{ required: true, message: t('employeeDetail.platformRequired') }]}>
            <Input placeholder={t('employeeDetail.platformPh')} />
          </Form.Item>
          <Form.Item name="account" label={t('employeeDetail.colAccount')} rules={[{ required: true, message: t('employeeDetail.accountRequired') }]}>
            <Input placeholder={t('employeeDetail.accountPh')} />
          </Form.Item>
          <Form.Item name="email" label={t('employeeDetail.colEmail')}>
            <Input placeholder={t('employeeDetail.emailOptionalPh')} />
          </Form.Item>
          <Form.Item name="status" label={t('common.colStatus')} valuePropName="checked"
            getValueFromEvent={(checked) => checked ? 1 : 0}
            getValueProps={(value) => ({ checked: value === 1 })}>
            <Switch checkedChildren={t('employee.statusEnabled')} unCheckedChildren={t('employee.statusDisabled')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：合同信息
         ═══════════════════════════════════════════ */}
      <Modal
        title={editingContract ? t('employeeDetail.editContractTitle') : t('employeeDetail.addContractTitle')}
        open={contractModalVisible}
        onOk={handleSaveContract}
        onCancel={() => setContractModalVisible(false)}
        width={640}
        destroyOnClose
      >
        <Form form={contractForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="contractNo" label={t('employeeDetail.colContractNo')} rules={[{ required: true, message: t('employeeDetail.contractNoRequired') }]}>
              <Input placeholder={t('employeeDetail.contractNoPh')} />
            </Form.Item>
            <Form.Item name="contractType" label={t('employeeDetail.colContractType')} rules={[{ required: true }]}>
              <Select options={[
                { value: '劳动合同', label: '劳动合同' },
                { value: '劳务合同', label: '劳务合同' },
                { value: '实习协议', label: '实习协议' },
                { value: '竞业协议', label: '竞业协议' },
              ]} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="startDate" label={t('employeeDetail.colStartDate')} rules={[{ required: true }]}>
              <Input placeholder={t('employeeDetail.datePh')} />
            </Form.Item>
            <Form.Item name="endDate" label={t('employeeDetail.colEndDate')} rules={[{ required: true }]}>
              <Input placeholder={t('employeeDetail.datePh')} />
            </Form.Item>
            <Form.Item name="signDate" label={t('employeeDetail.colSignDate')} rules={[{ required: true }]}>
              <Input placeholder={t('employeeDetail.datePh')} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="company" label={t('employeeDetail.colCompany')} rules={[{ required: true }]}>
              <Input placeholder={t('employeeDetail.colCompany')} />
            </Form.Item>
            <Form.Item name="status" label={t('common.colStatus')}>
              <Select options={[
                { value: '生效中', label: '生效中' },
                { value: '已终止', label: '已终止' },
                { value: '已过期', label: '已过期' },
              ]} />
            </Form.Item>
          </div>
          <Form.Item name="remark" label={t('employeeDetail.colRemark')}>
            <Input.TextArea rows={2} placeholder={t('employeeDetail.remarkOptionalPh')} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：獎懲信息
         ═══════════════════════════════════════════ */}
      <Modal
        title={editingRp ? t('employeeDetail.editRpTitle') : t('employeeDetail.addRpTitle')}
        open={rpModalVisible}
        onOk={handleSaveRp}
        onCancel={() => setRpModalVisible(false)}
        width={560}
        destroyOnClose
      >
        <Form form={rpForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="type" label={t('common.colType')} rules={[{ required: true }]}>
              <Select options={[
                { value: 'reward', label: t('employeeDetail.typeReward') },
                { value: 'punish', label: t('employeeDetail.typePunish') },
              ]} />
            </Form.Item>
            <Form.Item name="level" label={t('employeeDetail.colLevel')} rules={[{ required: true }]}>
              <Select options={[
                { value: '公司级', label: '公司级' },
                { value: '部门级', label: '部门级' },
                { value: '团队级', label: '团队级' },
              ]} />
            </Form.Item>
          </div>
          <Form.Item name="title" label={t('employeeDetail.colTitle')} rules={[{ required: true, message: t('employeeDetail.titleRequired') }]}>
            <Input placeholder={t('employeeDetail.titlePh')} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="date" label={t('employeeDetail.colDate')} rules={[{ required: true }]}>
              <Input placeholder={t('employeeDetail.datePh')} />
            </Form.Item>
            <Form.Item name="issuer" label={t('employeeDetail.colIssuer')} rules={[{ required: true }]}>
              <Input placeholder={t('employeeDetail.colIssuer')} />
            </Form.Item>
          </div>
          <Form.Item name="reason" label={t('common.colReason')} rules={[{ required: true, message: t('employeeDetail.reasonRequired') }]}>
            <Input.TextArea rows={2} placeholder={t('employeeDetail.reasonRequired')} />
          </Form.Item>
          <Form.Item name="remark" label={t('employeeDetail.colRemark')}>
            <Input.TextArea rows={2} placeholder={t('employeeDetail.remarkOptionalPh')} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
