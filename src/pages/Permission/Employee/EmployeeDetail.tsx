import { useEffect, useMemo, useState } from 'react'
import { Button, DatePicker, Descriptions, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Tabs, Timeline, TreeSelect, message } from 'antd'
import type { TableColumnsType, TabsProps } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  ArrowLeftOutlined, PlusOutlined, EditOutlined, SaveOutlined,
  UserOutlined, IdcardOutlined, DeleteOutlined, ClockCircleOutlined,
} from '@ant-design/icons'
import { fetchEmployees, createEmployee, type EmployeeItem, type EmployeePayload,
  fetchBasicInfo, savePersonalInfo, saveIdInfo, saveContactInfo,
  fetchEmergencyContacts, createEmergencyContact, updateEmergencyContact, deleteEmergencyContact,
  fetchPositionRecords, createPositionRecord, updatePositionRecord, deletePositionRecord,
} from '../../../api/employee'
import { fetchDepartments, DEPT_STATUS, type DepartmentItem } from '../../../api/department'
import { fetchPositions, POSITION_SEQUENCE_OPTIONS, POSITION_RANK_OPTIONS, type PositionItem } from '../../../api/position'
import { fetchRoles, type RoleItem } from '../../../api/role'
import { countryOptions as permCountryOptions, locationOptions, countryLocationMap } from '../../Permission/types'

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
  serviceDept?: string
  position?: string
  workCountry?: string
  workCity?: string
  officeAddress?: string
  company?: string
  contractLocation?: string
  employeeCategory?: string
  mentor?: string
  workSystem?: string
  sequence?: string
  positionLevel?: string
  rank?: string
  directSuperior?: string
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
  addressCountry?: string
  addressCity?: string
  addressDetail?: string
  emergencyContacts: EmergencyContact[]
}

/** 紧急联系人 */
interface EmergencyContact {
  id: number
  name: string
  phone: string
  relation: string
}

/** 账号管理 */
interface LoginAccount {
  id: number
  loginAccount: string
  loginPassword: string
  status: 'normal' | 'frozen'
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
    id: 1, effectiveDate: '2024-03-27', effectiveSeq: 2,
    operation: '重新入职', reason: '退场后重新进场',
    serviceDept: 'FTIC（履约与纺织品创新中心）/全球仓储营运部', position: '防损员',
    workCountry: 'china', workCity: 'huizhou', officeAddress: '仲恺新宜园区安防组',
    company: '珠海闪蜂科技有限公司', contractLocation: 'huizhou',
    employeeCategory: '正式员工', mentor: '张三',
    workSystem: '标准工时制', sequence: 'P', positionLevel: 'P2', rank: 'R3',
    directSuperior: '李四',
  },
  {
    id: 2, effectiveDate: '2024-01-29', effectiveSeq: 1,
    operation: '离职', reason: '主动离职-交通原因',
  },
  {
    id: 3, effectiveDate: '2022-02-02', effectiveSeq: 0,
    operation: '重新入职', reason: '离职后入职',
    serviceDept: 'FTIC', position: '防损员',
    workCountry: 'china', workCity: 'huizhou',
    workSystem: '标准工时制', sequence: 'P', positionLevel: 'P2', rank: 'R3',
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

/** 民族枚举（中国56个民族） */
const ETHNICITY_OPTIONS = [
  '汉', '蒙古', '回', '藏', '维吾尔', '苗', '彝', '壮', '布依', '朝鲜',
  '满', '侗', '瑶', '白', '土家', '哈尼', '哈萨克', '傣', '黎', '傈僳',
  '佤', '畲', '高山', '拉祜', '水', '东乡', '纳西', '景颇', '柯尔克孜', '土',
  '达斡尔', '仫佬', '羌', '布朗', '撒拉', '毛南', '仡佬', '锡伯', '阿昌', '普米',
  '塔吉克', '怒', '乌孜别克', '俄罗斯', '鄂温克', '德昂', '保安', '裕固', '京', '塔塔尔',
  '独龙', '鄂伦春', '赫哲', '门巴', '珞巴', '基诺',
].map(v => ({ value: v, label: v }))

/** 婚姻状况枚举 */
const MARITAL_STATUS_OPTIONS = [
  { value: '未婚', label: '未婚' },
  { value: '已婚', label: '已婚' },
  { value: '离异', label: '离异' },
  { value: '丧偶', label: '丧偶' },
]

/** 政治面貌枚举 */
const POLITICAL_STATUS_OPTIONS = [
  { value: '群众', label: '群众' },
  { value: '中共党员', label: '中共党员' },
  { value: '中共预备党员', label: '中共预备党员' },
  { value: '共青团员', label: '共青团员' },
  { value: '民革党员', label: '民革党员' },
  { value: '民盟盟员', label: '民盟盟员' },
  { value: '民建会员', label: '民建会员' },
  { value: '民进会员', label: '民进会员' },
  { value: '农工党党员', label: '农工党党员' },
  { value: '致公党党员', label: '致公党党员' },
  { value: '九三学社社员', label: '九三学社社员' },
  { value: '台盟盟员', label: '台盟盟员' },
  { value: '无党派人士', label: '无党派人士' },
]

/** 宗教信仰枚举 */
const RELIGION_OPTIONS = [
  { value: '无', label: '无' },
  { value: '佛教', label: '佛教' },
  { value: '道教', label: '道教' },
  { value: '伊斯兰教', label: '伊斯兰教' },
  { value: '天主教', label: '天主教' },
  { value: '基督教', label: '基督教' },
]

/** 证件类型枚举 */
const ID_TYPE_OPTIONS = [
  { value: '身份证', label: '身份证' },
  { value: '护照', label: '护照' },
  { value: '港澳居民来往内地通行证', label: '港澳居民来往内地通行证' },
  { value: '台湾居民来往大陆通行证', label: '台湾居民来往大陆通行证' },
  { value: '外国人永久居留身份证', label: '外国人永久居留身份证' },
  { value: '军官证', label: '军官证' },
  { value: '士兵证', label: '士兵证' },
  { value: '其他', label: '其他' },
]

/** 户籍类型枚举 */
const HOUSEHOLD_TYPE_OPTIONS = [
  { value: '本地农业户口', label: '本地农业户口' },
  { value: '本地非农业户口', label: '本地非农业户口' },
  { value: '外地农业户口', label: '外地农业户口' },
  { value: '外地非农业户口', label: '外地非农业户口' },
]

/** 紧急联系人关系枚举 */
const RELATIONSHIP_OPTIONS = [
  '父母', '配偶', '子女', '兄弟姐妹', '祖父母', '外祖父母',
  '孙子女', '外孙子女', '伯叔姑舅姨', '堂兄弟姐妹', '表兄弟姐妹',
  '侄子侄女', '外甥外甥女', '公婆', '岳父母', '儿媳', '女婿',
  '连襟', '妯娌', '朋友', '同事', '其他',
].map(v => ({ value: v, label: v }))

/** 收入项 - 项目名称枚举 */
const INCOME_NAME_OPTIONS = [
  '基本工资', '岗位津贴', '绩效奖金', '交通补贴',
  '餐饮补贴', '通讯补贴', '加班费',
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

/** 扣除项 - 项目名称枚举 */
const DEDUCTION_NAME_OPTIONS = [
  '养老保险', '医疗保险', '失业保险', '工伤保险',
  '生育保险', '住房公积金', '个人所得税',
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
  householdLocation: '惠州', nativePlace: '广州',
  mobile: '18899898912', email: 'xiaomi@qq.com',
  addressCountry: '中国', addressCity: '惠州市', addressDetail: '广东省肇庆市四会市碧桂园翡翠郡',
  emergencyContacts: [
    { id: 1, name: '小红', phone: '13989181423', relation: '父母' },
  ],
}

const MOCK_LOGIN_ACCOUNT: LoginAccount = {
  id: 1,
  loginAccount: 'MT00001',
  loginPassword: '••••••••',
  status: 'normal',
}

const MOCK_CONTRACTS: ContractRecord[] = [
  {
    id: 1, contractNo: 'HT-2024-001', contractType: '劳动合同',
    startDate: '2024-03-27', endDate: '2027-03-26', signDate: '2024-03-27',
    company: '珠海闪蜂科技有限公司', status: '生效中',
  },
  {
    id: 2, contractNo: 'HT-2022-003', contractType: '劳动合同',
    startDate: '2022-02-02', endDate: '2024-01-29', signDate: '2022-02-02',
    company: '珠海麦峰科技有限公司', status: '已终止',
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
  const [positionRecords, setPositionRecords] = useState<PositionRecord[]>([])
  const [posModalVisible, setPosModalVisible] = useState(false)
  const [editingPos, setEditingPos] = useState<PositionRecord | null>(null)
  const [posForm] = Form.useForm()
  const [allEmployees, setAllEmployees] = useState<EmployeeItem[]>([])

  /** 工龄：根据最早入职日期自动计算 */
  const seniorityText = useMemo(() => {
    if (!positionRecords.length) return null
    const earliest = positionRecords.reduce((min, r) => r.effectiveSeq < min.effectiveSeq ? r : min)
    const start = dayjs(earliest.effectiveDate)
    if (!start.isValid()) return null
    const now = dayjs()
    const years = now.diff(start, 'year')
    const months = now.diff(start.add(years, 'year'), 'month')
    if (years > 0 && months > 0) return `${years}\u5e74${months}\u4e2a\u6708`
    if (years > 0) return `${years}\u5e74`
    return `${months}\u4e2a\u6708`
  }, [positionRecords])
  const watchPosCountry = Form.useWatch('workCountry', posForm)
  const watchPosSequence = Form.useWatch('sequence', posForm)

  /** 职务弹窗：部门树（value 用部门名称，方便详情展示） */
  const posDeptTreeData = useMemo(() => {
    interface Node { value: string; title: string; disabled?: boolean; children?: Node[] }
    const nodeMap = new Map<number, Node>()
    departments.forEach(dept => {
      nodeMap.set(dept.id, {
        value: isNonZh ? (dept.nameEn || dept.name) : dept.name,
        title: isNonZh ? (dept.nameEn || dept.name) : dept.name,
        disabled: dept.status !== DEPT_STATUS.ENABLED,
        children: [],
      })
    })
    const roots: Node[] = []
    departments.forEach(dept => {
      const node = nodeMap.get(dept.id)!
      const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
      if (parent) parent.children!.push(node)
      else roots.push(node)
    })
    return roots
  }, [departments, isNonZh])

  /** 职务弹窗：根据所选国家获取城市列表 */
  const posCityOptions = useMemo(() => {
    if (!watchPosCountry) return []
    const cityKeys = countryLocationMap[watchPosCountry] || []
    return locationOptions.filter(o => cityKeys.includes(o.key))
  }, [watchPosCountry])

  /** 职务弹窗：根据所选序列获取职级列表 */
  const posLevelOptions = useMemo(() => {
    if (!watchPosSequence) return []
    const prefix = watchPosSequence
    return Array.from({ length: 7 }, (_, i) => ({ value: `${prefix}${i + 1}`, label: `${prefix}${i + 1}` }))
  }, [watchPosSequence])

  /** 职务弹窗：选择服务部门后自动带出直属上级 */
  const handlePosDeptChange = (deptName: string) => {
    const dept = departments.find(d => (isNonZh ? (d.nameEn || d.name) : d.name) === deptName)
    if (dept?.leader) {
      posForm.setFieldValue('directSuperior', dept.leader)
    } else {
      posForm.setFieldValue('directSuperior', undefined)
    }
  }

  /** 职务弹窗：打开时加载员工列表（导师用）+ 部门列表（服务部门用） */
  useEffect(() => {
    if (!posModalVisible) return
    fetchEmployees({ page: 1, size: 500 })
      .then(r => setAllEmployees(r.records))
      .catch(() => { /* 静默 */ })
    if (departments.length === 0) {
      fetchDepartments().then(setDepartments).catch(() => { /* 静默 */ })
    }
    if (positions.length === 0) {
      fetchPositions().then(setPositions).catch(() => { /* 静默 */ })
    }
  }, [posModalVisible])

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

  /* ── 基础信息（拆分为 4 个独立编辑模块）── */
  const [basicInfo, setBasicInfo] = useState<BasicInfo>({
    gender: '', nationality: '', ethnicity: '', birthDate: '',
    idType: '', idNumber: '', idAddress: '', maritalStatus: '',
    politicalStatus: '', religion: '', householdType: '',
    householdLocation: '', nativePlace: '', mobile: '', email: '',
    addressCountry: '', addressCity: '', addressDetail: '',
    emergencyContacts: [],
  })
  const [personalModalVisible, setPersonalModalVisible] = useState(false)
  const [idInfoModalVisible, setIdInfoModalVisible] = useState(false)
  const [contactModalVisible, setContactModalVisible] = useState(false)
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false)
  const [personalForm] = Form.useForm()
  const [idInfoForm] = Form.useForm()
  const [contactForm] = Form.useForm()
  const [emergencyForm] = Form.useForm()
  const watchContactCountry = Form.useWatch('addressCountry', contactForm)

  /** 通讯弹窗：根据所选国家获取城市列表 */
  const contactCityOptions = useMemo(() => {
    if (!watchContactCountry) return []
    const cityKeys = countryLocationMap[watchContactCountry] || []
    return locationOptions.filter(o => cityKeys.includes(o.key))
  }, [watchContactCountry])

  /* ── 账号管理 ── */
  const [loginAccount, setLoginAccount] = useState<LoginAccount>(MOCK_LOGIN_ACCOUNT)
  const [resetPwdModalVisible, setResetPwdModalVisible] = useState(false)
  const [resetPwdForm] = Form.useForm()

  /* ── 角色展开/收起 ── */
  const [showAllRoles, setShowAllRoles] = useState(false)

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

  /* ── 加载基础信息、紧急联系人、职务记录（编辑模式）── */
  useEffect(() => {
    if (!empId || !isEdit) return
    const numId = Number(empId)
    // 基础信息
    fetchBasicInfo(numId).then(res => {
      const p = res.personalInfo || {}
      const idI = res.idInfo || {}
      const c = res.contactInfo || {}
      setBasicInfo(prev => ({
        ...prev,
        nationality: (p.nationality as string) ?? '',
        ethnicity: (p.ethnicity as string) ?? '',
        birthDate: (p.birthDate as string) ?? '',
        maritalStatus: (p.maritalStatus as string) ?? '',
        politicalStatus: (p.politicalStatus as string) ?? '',
        religion: (p.religion as string) ?? '',
        idType: (idI.idType as string) ?? '',
        idNumber: (idI.idNumber as string) ?? '',
        idAddress: (idI.idAddress as string) ?? '',
        householdType: (idI.householdType as string) ?? '',
        householdLocation: (idI.householdLocation as string) ?? '',
        nativePlace: (idI.nativePlace as string) ?? '',
        addressCountry: (c.addressCountry as string) ?? '',
        addressCity: (c.addressCity as string) ?? '',
        addressDetail: (c.addressDetail as string) ?? '',
      }))
    }).catch(() => { /* 静默 */ })
    // 紧急联系人
    fetchEmergencyContacts(numId).then(list => {
      setBasicInfo(prev => ({ ...prev, emergencyContacts: list }))
    }).catch(() => { /* 静默 */ })
    // 职务记录
    fetchPositionRecords(numId).then(list => {
      setPositionRecords(list.map(r => ({
        id: r.id,
        effectiveDate: r.effectiveDate,
        effectiveSeq: r.effectiveSeq,
        operation: r.operation,
        reason: r.reason ?? '',
        serviceDept: r.serviceDept,
        position: r.positionName,
        workCountry: r.workCountry,
        workCity: r.workCity,
        officeAddress: r.officeAddress,
        company: r.company,
        contractLocation: r.contractLocation,
        employeeCategory: r.employeeCategory,
        mentor: r.mentor,
        workSystem: r.workSystem,
        sequence: r.sequenceType,
        positionLevel: r.positionLevel,
        rank: r.rankCode,
        directSuperior: r.directSuperior,
      })))
    }).catch(() => { /* 静默 */ })
  }, [empId, isEdit])

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

  /* ── 職務狀態軸：選中節點（默認最新一條），左側詳情聯動展示 ── */
  const [selectedPosId, setSelectedPosId] = useState<number | null>(null)
  const sortedPosRecords = useMemo(
    () => [...positionRecords].sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || '')),
    [positionRecords],
  )
  const selectedPos = useMemo(
    () => sortedPosRecords.find(r => r.id === selectedPosId) ?? sortedPosRecords[0] ?? null,
    [sortedPosRecords, selectedPosId],
  )

  /** 最新一條職務記錄的生效日期（新增時用於限制最早可填日期） */
  const minEffectiveDate = useMemo(() => {
    if (positionRecords.length === 0) return ''
    return [...positionRecords].sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''))[0]?.effectiveDate || ''
  }, [positionRecords])

  /** 当前生效的职务记录：effectiveSeq 最大且生效日期 <= 今天的记录 */
  const activePosRecord = useMemo(() => {
    const today = dayjs().format('YYYY-MM-DD')
    const eligible = positionRecords
      .filter(r => r.effectiveDate <= today)
      .sort((a, b) => (b.effectiveSeq ?? 0) - (a.effectiveSeq ?? 0))
    return eligible[0] ?? null
  }, [positionRecords])

  /** 最新一条记录（effectiveSeq 最大）的操作类型，用于判断是否允许“重新入职” */
  const latestPosOperation = useMemo(() => {
    if (!positionRecords.length) return ''
    const latest = [...positionRecords].sort((a, b) => (b.effectiveSeq ?? 0) - (a.effectiveSeq ?? 0))[0]
    return latest?.operation ?? ''
  }, [positionRecords])
  const canRehire = !latestPosOperation || /离职/.test(latestPosOperation)

  /** 職務操作類型 → 標籤顏色 */
  const posOpColor = (op?: string) => {
    if (!op) return 'default'
    if (/離職|离职/.test(op)) return 'red'
    if (/晉升|晋升/.test(op)) return 'gold'
    if (/降職|降职/.test(op)) return 'orange'
    if (/調動|调动/.test(op)) return 'blue'
    if (/入職|入职/.test(op)) return 'green'
    if (/重新/.test(op)) return 'cyan'
    return 'blue'
  }

  const handleAddPos = () => {
    setEditingPos(null)
    posForm.resetFields()
    setPosModalVisible(true)
  }

  const handleEditPos = (record: PositionRecord) => {
    setEditingPos(record)
    posForm.setFieldsValue({
      ...record,
      effectiveDate: record.effectiveDate ? dayjs(record.effectiveDate) : undefined,
    })
    setPosModalVisible(true)
  }

  const handleSavePos = async () => {
    const values = await posForm.validateFields()
    // DatePicker 返回 dayjs 对象，转为字符串
    const normalized = {
      ...values,
      effectiveDate: values.effectiveDate?.format?.('YYYY-MM-DD') ?? values.effectiveDate,
    }
    if (empId) {
      if (editingPos) {
        const updated = await updatePositionRecord(Number(empId), editingPos.id, normalized)
        setPositionRecords(prev => prev.map(r =>
          r.id === editingPos.id ? {
            ...r, ...normalized,
            effectiveSeq: updated.effectiveSeq,
          } : r
        ))
        message.success(t('employeeDetail.posUpdated'))
      } else {
        const created = await createPositionRecord(Number(empId), normalized)
        const newRecord: PositionRecord = {
          ...normalized,
          id: created.id,
          effectiveSeq: created.effectiveSeq,
          position: normalized.positionName,
          sequence: normalized.sequence,
          positionLevel: normalized.positionLevel,
          rank: normalized.rankCode,
        }
        setPositionRecords(prev => [newRecord, ...prev])
        setSelectedPosId(created.id)
        message.success(t('employeeDetail.posAdded'))
      }
    } else {
      // 无 empId 时仅本地更新
      if (editingPos) {
        setPositionRecords(prev => prev.map(r =>
          r.id === editingPos.id ? { ...r, ...normalized, effectiveSeq: (r.effectiveSeq ?? 0) + 1 } : r
        ))
        message.success(t('employeeDetail.posUpdated'))
      } else {
        const newId = Date.now()
        const maxSeq = Math.max(...positionRecords.map(r => r.effectiveSeq ?? 0), -1)
        setPositionRecords(prev => [{ ...normalized, id: newId, effectiveSeq: maxSeq + 1 }, ...prev])
        setSelectedPosId(newId)
        message.success(t('employeeDetail.posAdded'))
      }
    }
    setPosModalVisible(false)
  }

  const handleDeletePos = async (id: number) => {
    if (empId) {
      await deletePositionRecord(Number(empId), id)
    }
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
     3.3 基礎信息 Tab（4 個模塊獨立編輯）
     ═══════════════════════════════════════════ */

  const handleEditPersonal = () => {
    personalForm.setFieldsValue({
      gender: basicInfo.gender,
      nationality: basicInfo.nationality,
      ethnicity: basicInfo.ethnicity,
      birthDate: basicInfo.birthDate ? dayjs(basicInfo.birthDate) : undefined,
      maritalStatus: basicInfo.maritalStatus,
      politicalStatus: basicInfo.politicalStatus,
      religion: basicInfo.religion,
    })
    setPersonalModalVisible(true)
  }

  const handleSavePersonal = async () => {
    const values = await personalForm.validateFields()
    const normalized = {
      ...values,
      birthDate: values.birthDate?.format?.('YYYY-MM-DD') ?? values.birthDate,
    }
    if (empId) {
      await savePersonalInfo(Number(empId), normalized)
    }
    setBasicInfo(prev => ({ ...prev, ...normalized }))
    message.success(t('employeeDetail.personalUpdated'))
    setPersonalModalVisible(false)
  }

  const handleEditIdInfo = () => {
    idInfoForm.setFieldsValue({
      idType: basicInfo.idType,
      idNumber: basicInfo.idNumber,
      idAddress: basicInfo.idAddress,
      householdType: basicInfo.householdType,
      householdLocation: basicInfo.householdLocation,
      nativePlace: basicInfo.nativePlace,
    })
    setIdInfoModalVisible(true)
  }

  const handleSaveIdInfo = async () => {
    const values = await idInfoForm.validateFields()
    if (empId) {
      await saveIdInfo(Number(empId), values)
    }
    setBasicInfo(prev => ({ ...prev, ...values }))
    message.success(t('employeeDetail.idInfoUpdated'))
    setIdInfoModalVisible(false)
  }

  const handleEditContact = () => {
    contactForm.setFieldsValue({
      mobile: basicInfo.mobile,
      email: basicInfo.email,
      addressCountry: basicInfo.addressCountry,
      addressCity: basicInfo.addressCity,
      addressDetail: basicInfo.addressDetail,
    })
    setContactModalVisible(true)
  }

  const handleSaveContact = async () => {
    const values = await contactForm.validateFields()
    if (empId) {
      await saveContactInfo(Number(empId), values)
    }
    setBasicInfo(prev => ({ ...prev, ...values }))
    message.success(t('employeeDetail.contactUpdated'))
    setContactModalVisible(false)
  }

  /* ── 紧急联系人 CRUD ── */
  const [editingEmergency, setEditingEmergency] = useState<EmergencyContact | null>(null)

  const handleAddEmergency = () => {
    setEditingEmergency(null)
    emergencyForm.resetFields()
    setEmergencyModalVisible(true)
  }

  const handleEditEmergency = (record: EmergencyContact) => {
    setEditingEmergency(record)
    emergencyForm.setFieldsValue({
      name: record.name,
      phone: record.phone,
      relation: record.relation,
    })
    setEmergencyModalVisible(true)
  }

  const handleSaveEmergency = async () => {
    const values = await emergencyForm.validateFields()
    if (empId) {
      if (editingEmergency) {
        await updateEmergencyContact(Number(empId), editingEmergency.id, values)
        setBasicInfo(prev => ({
          ...prev,
          emergencyContacts: prev.emergencyContacts.map(c =>
            c.id === editingEmergency.id ? { ...c, ...values } : c
          ),
        }))
        message.success(t('employeeDetail.emergencyUpdated'))
      } else {
        const created = await createEmergencyContact(Number(empId), values)
        setBasicInfo(prev => ({
          ...prev,
          emergencyContacts: [...prev.emergencyContacts, created],
        }))
        message.success(t('employeeDetail.emergencyAdded'))
      }
    } else {
      // 无 empId 时仅本地更新
      if (editingEmergency) {
        setBasicInfo(prev => ({
          ...prev,
          emergencyContacts: prev.emergencyContacts.map(c =>
            c.id === editingEmergency.id ? { ...c, ...values } : c
          ),
        }))
        message.success(t('employeeDetail.emergencyUpdated'))
      } else {
        setBasicInfo(prev => ({
          ...prev,
          emergencyContacts: [...prev.emergencyContacts, { ...values, id: Date.now() }],
        }))
        message.success(t('employeeDetail.emergencyAdded'))
      }
    }
    setEmergencyModalVisible(false)
  }

  const handleDeleteEmergency = async (id: number) => {
    if (empId) {
      await deleteEmergencyContact(Number(empId), id)
    }
    setBasicInfo(prev => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.filter(c => c.id !== id),
    }))
    message.success(t('employeeDetail.emergencyDeleted'))
  }

  /* ═══════════════════════════════════════════
     3.4 賬號管理 Tab
     ═══════════════════════════════════════════ */

  const accountColumns: TableColumnsType<LoginAccount> = [
    { title: t('employeeDetail.colLoginAccount'), dataIndex: 'loginAccount', key: 'loginAccount' },
    { title: t('employeeDetail.colLoginPassword'), dataIndex: 'loginPassword', key: 'loginPassword' },
    {
      title: t('employeeDetail.colAccountStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (status: LoginAccount['status']) => (
        <Tag color={status === 'normal' ? 'green' : 'red'}>
          {status === 'normal' ? t('employeeDetail.statusNormal') : t('employeeDetail.statusFrozen')}
        </Tag>
      ),
    },
    {
      title: t('common.colAction'), key: 'action', width: 200,
      render: (_: unknown, record: LoginAccount) => (
        <Space>
          <Button type="link" size="small" onClick={() => setResetPwdModalVisible(true)}>{t('employeeDetail.resetPassword')}</Button>
          {record.status === 'normal' ? (
            <Popconfirm
              title={t('employeeDetail.freezeConfirmTitle')}
              description={t('employeeDetail.freezeConfirmDesc')}
              onConfirm={() => handleToggleFreeze(record.id)}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
            >
              <Button type="link" size="small" danger>{t('employeeDetail.freezeAccount')}</Button>
            </Popconfirm>
          ) : (
            <Popconfirm
              title={t('employeeDetail.unfreezeConfirmTitle')}
              description={t('employeeDetail.unfreezeConfirmDesc')}
              onConfirm={() => handleToggleFreeze(record.id)}
              okText={t('common.confirm')}
              cancelText={t('common.cancel')}
            >
              <Button type="link" size="small">{t('employeeDetail.unfreezeAccount')}</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  const handleResetPassword = async () => {
    const values = await resetPwdForm.validateFields()
    if (values.newPassword !== values.confirmPassword) {
      message.error(t('employeeDetail.passwordMismatch'))
      return
    }
    setLoginAccount(prev => ({ ...prev, loginPassword: '••••••••' }))
    message.success(t('employeeDetail.passwordResetSuccess'))
    setResetPwdModalVisible(false)
    resetPwdForm.resetFields()
  }

  /** 冻结 / 解冻切换 */
  const handleToggleFreeze = (accountId: number) => {
    setLoginAccount(prev => {
      if (prev.id !== accountId) return prev
      const next = prev.status === 'normal' ? 'frozen' : 'normal'
      message.success(next === 'frozen' ? t('employeeDetail.freezeSuccess') : t('employeeDetail.unfreezeSuccess'))
      return { ...prev, status: next }
    })
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
    { title: t('employeeDetail.colCompany'), dataIndex: 'company', key: 'company', width: 220, render: (v: string) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span> },
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

  /** 職務詳情分組小節：橙色豎條標題 + 兩列 Descriptions */
  function renderPosSection(title: string, items: Array<{ label: string; value?: string }>) {
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ width: 3, height: 12, borderRadius: 2, background: '#E8720C' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{title}</span>
        </div>
        <Descriptions
          column={2}
          size="small"
          items={items.map(i => ({ key: i.label, label: i.label, children: i.value || '-' }))}
        />
      </div>
    )
  }

  function renderPositionTab() {
    return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左側：當前選中節點的職務變動詳情（各節點部門/職位可能不同） */}
        <div style={{ flex: 1, minWidth: 0, border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IdcardOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.posDetailTitle')}</span>
            {selectedPos && <Tag color={posOpColor(selectedPos.operation)} style={{ marginLeft: 4 }}>{selectedPos.operation}</Tag>}
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <Space size={8}>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddPos}>{t('employeeDetail.addPos')}</Button>
              {selectedPos && (
                <>
                  <Button size="small" icon={<EditOutlined />} onClick={() => handleEditPos(selectedPos)}>{t('common.edit')}</Button>
                  <Popconfirm title={t('common.confirmDelete')} description={t('employeeDetail.deletePosConfirm')} onConfirm={() => handleDeletePos(selectedPos.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
                    <Button size="small" danger icon={<DeleteOutlined />}>{t('common.delete')}</Button>
                  </Popconfirm>
                </>
              )}
            </Space>
          </div>
          {selectedPos ? (
            <>
              {renderPosSection(t('employeeDetail.posGroupChange'), [
                { label: t('employeeDetail.colEffectiveDate'), value: selectedPos.effectiveDate },
                { label: t('employeeDetail.colEffectiveSeq'), value: String(selectedPos.effectiveSeq ?? '-') },
                { label: t('employeeDetail.colOperation'), value: selectedPos.operation },
                { label: t('common.colReason'), value: selectedPos.reason },
              ])}
              {renderPosSection(t('employeeDetail.posGroupAppointment'), [
                { label: t('employeeDetail.colServiceDept'), value: selectedPos.serviceDept },
                { label: t('employeeDetail.colSequence'), value: selectedPos.sequence },
                { label: t('employeeDetail.colJobLevel2'), value: selectedPos.positionLevel },
                { label: t('employeeDetail.colRank'), value: selectedPos.rank },
                { label: t('employeeDetail.colPosCompany'), value: selectedPos.company },
                { label: t('employeeDetail.colEmployeeCategory'), value: selectedPos.employeeCategory },
                { label: t('employeeDetail.colWorkSystem'), value: selectedPos.workSystem },
                { label: t('employee.positionLabel'), value: selectedPos.position },
                { label: t('employeeDetail.colDirectSuperior'), value: selectedPos.directSuperior },
                { label: t('employeeDetail.colMentor'), value: selectedPos.mentor },
              ])}
              {renderPosSection(t('employeeDetail.posGroupWork'), [
                { label: t('employeeDetail.colWorkCountry'), value: selectedPos.workCountry },
                { label: t('employeeDetail.colWorkCity'), value: selectedPos.workCity },
                { label: t('employeeDetail.colOfficeAddress'), value: selectedPos.officeAddress },
                { label: t('employeeDetail.colContractLocation'), value: selectedPos.contractLocation },
              ])}
            </>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeeDetail.posEmpty')} />
          )}
        </div>

        {/* 右側：人事變動軌跡狀態軸（點擊節點聯動左側詳情） */}
        <div style={{ width: 320, flexShrink: 0, border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClockCircleOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('employeeDetail.posTimelineTitle')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          {sortedPosRecords.length > 0 ? (
            <>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 12 }}>{t('employeeDetail.posTimelineHint')}</div>
              <Timeline
                items={sortedPosRecords.map(r => {
                  const active = selectedPos?.id === r.id
                  return {
                    dot: (
                      <span style={{
                        display: 'inline-block', width: active ? 14 : 10, height: active ? 14 : 10,
                        borderRadius: '50%', boxSizing: 'border-box',
                        background: active ? '#E8720C' : '#fff',
                        border: active ? '3px solid #F59432' : '2px solid #d9d9d9',
                        boxShadow: active ? '0 0 0 4px rgba(232,114,12,0.12)' : 'none',
                        transition: 'all 0.2s',
                      }} />
                    ),
                    children: (
                      <div
                        onClick={() => setSelectedPosId(r.id)}
                        style={{
                          cursor: 'pointer', marginLeft: 4, padding: '8px 12px', borderRadius: 8,
                          background: active ? '#FFF7E6' : 'transparent',
                          border: active ? '1px solid #FFD591' : '1px solid transparent',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#E8720C' : '#262626' }}>{r.effectiveDate}</span>
                          <Tag color={posOpColor(r.operation)} style={{ marginRight: 0, fontSize: 11, lineHeight: '18px' }}>{r.operation}</Tag>
                        </div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                          {[r.serviceDept, r.position].filter(Boolean).join(' · ') || '-'}
                        </div>
                      </div>
                    ),
                  }
                })}
              />
            </>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('employeeDetail.posEmpty')} />
          )}
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
            <Button icon={<EditOutlined />} onClick={handleEditPersonal}>{t('common.edit')}</Button>
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
            <Button icon={<EditOutlined />} onClick={handleEditIdInfo}>{t('common.edit')}</Button>
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
            <Button icon={<EditOutlined />} onClick={handleEditContact}>{t('common.edit')}</Button>
          </div>
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label={t('employeeDetail.labelMobile')}>{basicInfo.mobile}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelEmail')}>{basicInfo.email}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelAddressCountry')}>{basicInfo.addressCountry || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelAddressCity')}>{basicInfo.addressCity || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('employeeDetail.labelAddressDetail')} span={2}>{basicInfo.addressDetail || '-'}</Descriptions.Item>
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
            <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleAddEmergency}>{t('common.add')}</Button>
          </div>
          <Table
            size="small"
            dataSource={basicInfo.emergencyContacts}
            rowKey="id"
            pagination={false}
            columns={[
              { title: t('employee.nameLabel'), dataIndex: 'name', key: 'name' },
              { title: t('employeeDetail.labelEmergencyPhone'), dataIndex: 'phone', key: 'phone' },
              { title: t('employeeDetail.labelRelation'), dataIndex: 'relation', key: 'relation' },
              {
                title: t('common.action'),
                key: 'action',
                width: 120,
                render: (_: unknown, record: EmergencyContact) => (
                  <Space size="small">
                    <a onClick={() => handleEditEmergency(record)}>{t('common.edit')}</a>
                    <Popconfirm title={t('employeeDetail.confirmDeleteEmergency')} onConfirm={() => handleDeleteEmergency(record.id)}>
                      <a style={{ color: '#ff4d4f' }}>{t('common.delete')}</a>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </div>

      </div>
    )
  }

  function renderAccountTab() {
    return (
      <div>
        <Table
          columns={accountColumns}
          dataSource={[loginAccount]}
          rowKey="id"
          pagination={false}
          size="middle"
        />
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
              {latestPosOperation === '离职'
                ? <Tag color="default">{t('employee.statusResigned')}</Tag>
                : <Tag color="success">{t('employee.statusActive')}</Tag>}
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
              <Descriptions.Item label={t('employee.deptLabel')}>{activePosRecord?.serviceDept || employee.department || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.positionLabel')}>{activePosRecord?.position || employee.position || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.sequenceLabel')}>{activePosRecord?.sequence || employee.sequence || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.colJobLevel')}>{activePosRecord?.positionLevel || employee.jobLevel || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.rankLabel')}>{activePosRecord?.rank || employee.rank || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('employee.employmentStatus')}>
                {latestPosOperation === '离职'
                  ? <Tag color="default">{t('employee.statusResigned')}</Tag>
                  : <Tag color="success">{t('employee.statusActive')}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label={t('employee.seniorityLabel')}>
                {seniorityText || <span style={{ color: '#8C8C8C' }}>-</span>}
              </Descriptions.Item>
              <Descriptions.Item label={t('employee.roleAuthLabel')} span={2}>
                {employee.functionRoleIds?.length
                  ? (() => {
                      const roles = employee.functionRoleIds
                      const visible = showAllRoles ? roles : roles.slice(0, 2)
                      const remaining = roles.length - 2
                      return (
                        <>
                          {visible.map(id => <Tag key={id} color="blue">{t('employeeDetail.roleTag', { id })}</Tag>)}
                          {!showAllRoles && remaining > 0 && (
                            <a onClick={() => setShowAllRoles(true)} style={{ fontSize: 12, marginLeft: 4 }}>
                              +{remaining}
                            </a>
                          )}
                          {showAllRoles && roles.length > 2 && (
                            <a onClick={() => setShowAllRoles(false)} style={{ fontSize: 12, marginLeft: 4 }}>
                              {t('common.collapse')}
                            </a>
                          )}
                        </>
                      )
                    })()
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
          {/* 變動信息 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ width: 3, height: 12, borderRadius: 2, background: '#E8720C' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{t('employeeDetail.posGroupChange')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item
              name="effectiveDate"
              label={t('employeeDetail.colEffectiveDate')}
              rules={[
                { required: true, message: t('employeeDetail.effectiveDateRequired') },
                { validator: (_, v) => {
                  if (!v || !minEffectiveDate) return Promise.resolve()
                  const dateStr = v.format?.('YYYY-MM-DD') ?? v
                  return dateStr >= minEffectiveDate
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('employeeDetail.effectiveDateMin', { date: minEffectiveDate })))
                }},
              ]}
            >
              <DatePicker style={{ width: '100%' }} placeholder={t('employeeDetail.effectiveDatePh')} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="operation" label={t('employeeDetail.colOperation')} rules={[{ required: true, message: t('employeeDetail.operationRequired') }]}>
              <Select options={[
                { value: '入职', label: '入职' },
                { value: '调动', label: '调动' },
                { value: '晋升', label: '晋升' },
                { value: '降职', label: '降职' },
                { value: '离职', label: '离职' },
                { value: '重新入职', label: '重新入职', disabled: !canRehire },
              ]} />
            </Form.Item>
          </div>
          <Form.Item name="reason" label={t('common.colReason')} rules={[{ required: true, message: t('employeeDetail.reasonRequired') }]}>
            <Input placeholder={t('employeeDetail.reasonRequired')} />
          </Form.Item>
          <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0 16px' }} />

          {/* 任職信息 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ width: 3, height: 12, borderRadius: 2, background: '#1890ff' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{t('employeeDetail.posGroupAppointment')}</span>
          </div>
          {/* 1.1 服务部门 - TreeSelect 树状结构 */}
          <Form.Item name="serviceDept" label={t('employeeDetail.colServiceDept')}>
            <TreeSelect
              treeData={posDeptTreeData}
              treeDefaultExpandAll
              placeholder={t('employeeDetail.colServiceDept')}
              allowClear
              showSearch
              treeNodeFilterProp="title"
              onChange={handlePosDeptChange}
            />
          </Form.Item>
          {/* 1.2 职级序列 + 1.3 职级 + 1.4 职等 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="sequence" label={t('employeeDetail.colSequence')}>
              <Select options={POSITION_SEQUENCE_OPTIONS} placeholder={t('employeeDetail.colSequence')} allowClear onChange={() => {
                posForm.setFieldValue('positionLevel', undefined)
                posForm.setFieldValue('rank', undefined)
              }} />
            </Form.Item>
            <Form.Item name="positionLevel" label={t('employeeDetail.colJobLevel2')}>
              <Select options={posLevelOptions} placeholder={t('employeeDetail.colJobLevel2')} allowClear disabled={!watchPosSequence} />
            </Form.Item>
            <Form.Item name="rank" label={t('employeeDetail.colRank')}>
              <Select options={POSITION_RANK_OPTIONS} placeholder={t('employeeDetail.colRank')} allowClear />
            </Form.Item>
          </div>
          {/* 1.5 任职公司 + 1.6 员工类别 + 1.8 工时制 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="company" label={t('employeeDetail.colPosCompany')}>
              <Select placeholder={t('employeeDetail.colPosCompany')} allowClear options={[
                { value: '珠海闪蜂科技有限公司', label: '珠海闪蜂科技有限公司' },
                { value: '珠海麦峰科技有限公司', label: '珠海麦峰科技有限公司' },
              ]} />
            </Form.Item>
            <Form.Item name="employeeCategory" label={t('employeeDetail.colEmployeeCategory')}>
              <Select placeholder={t('employeeDetail.colEmployeeCategory')} allowClear options={[
                { value: '正式员工', label: '正式员工' },
                { value: '实习生', label: '实习生' },
                { value: '劳务派遣', label: '劳务派遣' },
                { value: '外包', label: '外包' },
              ]} />
            </Form.Item>
            <Form.Item name="workSystem" label={t('employeeDetail.colWorkSystem')}>
              <Select placeholder={t('employeeDetail.colWorkSystem')} allowClear options={[
                { value: '标准工时制', label: '标准工时制' },
                { value: '综合工时制', label: '综合工时制' },
                { value: '不定时工时制', label: '不定时工时制' },
              ]} />
            </Form.Item>
          </div>
          {/* 职位 + 1.9 直属上级 + 1.10 导师 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="position" label={t('employee.positionLabel')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employee.positionLabel')}
                allowClear
                options={positions
                  .filter(p => !watchPosSequence || p.sequence === watchPosSequence)
                  .map(p => ({ value: p.name, label: `${p.name}${p.jobLevel ? ` (${p.sequence}${p.jobLevel})` : ''}` }))}
              />
            </Form.Item>
            <Form.Item name="directSuperior" label={t('employeeDetail.colDirectSuperior')}>
              <Input placeholder={t('employeeDetail.colDirectSuperior')} readOnly />
            </Form.Item>
            <Form.Item name="mentor" label={t('employeeDetail.colMentor')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.colMentor')}
                allowClear
                options={allEmployees.map(e => ({ value: e.name, label: `${e.name}(${e.empId})` }))}
              />
            </Form.Item>
          </div>

          <div style={{ height: 1, background: '#f0f0f0', margin: '8px 0 16px' }} />

          {/* 工作信息 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ width: 3, height: 12, borderRadius: 2, background: '#52c41a' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{t('employeeDetail.posGroupWork')}</span>
          </div>
          {/* 2.1 工作国家 + 2.2 工作城市 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="workCountry" label={t('employeeDetail.colWorkCountry')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.colWorkCountry')}
                allowClear
                onChange={() => posForm.setFieldValue('workCity', undefined)}
                options={permCountryOptions.map(c => ({ value: c.key, label: c.label }))}
              />
            </Form.Item>
            <Form.Item name="workCity" label={t('employeeDetail.colWorkCity')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.colWorkCity')}
                allowClear
                disabled={!watchPosCountry}
                options={posCityOptions.map(c => ({ value: c.key, label: c.label }))}
              />
            </Form.Item>
          </div>
          {/* 2.4 办公地址 */}
          <Form.Item name="officeAddress" label={t('employeeDetail.colOfficeAddress')}>
            <Input placeholder={t('employeeDetail.colOfficeAddress')} />
          </Form.Item>
          {/* 2.5 合同签订地 */}
          <Form.Item name="contractLocation" label={t('employeeDetail.colContractLocation')}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('employeeDetail.colContractLocation')}
              allowClear
              disabled={!watchPosCountry}
              options={posCityOptions.map(c => ({ value: c.key, label: c.label }))}
            />
          </Form.Item>
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
            <Select
              placeholder={t('employeeDetail.itemNameIncomePh')}
              options={INCOME_NAME_OPTIONS.map(v => ({ value: v, label: v }))}
            />
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
            <Select
              placeholder={t('employeeDetail.itemNameDeductionPh')}
              options={DEDUCTION_NAME_OPTIONS.map(v => ({ value: v, label: v }))}
            />
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
         彈窗：個人信息
         ═══════════════════════════════════════════ */}
      <Modal
        title={t('employeeDetail.personalInfo')}
        open={personalModalVisible}
        onOk={handleSavePersonal}
        onCancel={() => setPersonalModalVisible(false)}
        width={720}
        destroyOnClose
      >
        <Form form={personalForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            {/* 1.1 性别 */}
            <Form.Item name="gender" label={t('employeeDetail.labelGender')}>
              <Select options={[{ value: '男', label: '男' }, { value: '女', label: '女' }]} placeholder={t('employeeDetail.labelGender')} allowClear />
            </Form.Item>
            {/* 1.2 国籍 */}
            <Form.Item name="nationality" label={t('employeeDetail.labelNationality')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.labelNationality')}
                allowClear
                options={permCountryOptions.map(c => ({ value: c.label, label: c.label }))}
              />
            </Form.Item>
            {/* 1.3 民族 */}
            <Form.Item name="ethnicity" label={t('employeeDetail.labelEthnicity')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.labelEthnicity')}
                allowClear
                options={ETHNICITY_OPTIONS}
              />
            </Form.Item>
            {/* 1.4 出生年月 */}
            <Form.Item name="birthDate" label={t('employeeDetail.labelBirthDate')}>
              <DatePicker style={{ width: '100%' }} placeholder={t('employeeDetail.datePh')} format="YYYY-MM-DD" />
            </Form.Item>
            {/* 1.5 婚姻状况 */}
            <Form.Item name="maritalStatus" label={t('employeeDetail.labelMaritalStatus')}>
              <Select options={MARITAL_STATUS_OPTIONS} placeholder={t('employeeDetail.labelMaritalStatus')} allowClear />
            </Form.Item>
            {/* 1.6 政治面貌 */}
            <Form.Item name="politicalStatus" label={t('employeeDetail.labelPoliticalStatus')}>
              <Select
                showSearch
                optionFilterProp="label"
                options={POLITICAL_STATUS_OPTIONS}
                placeholder={t('employeeDetail.labelPoliticalStatus')}
                allowClear
              />
            </Form.Item>
            {/* 1.7 宗教信仰 */}
            <Form.Item name="religion" label={t('employeeDetail.labelReligion')}>
              <Select options={RELIGION_OPTIONS} placeholder={t('employeeDetail.labelReligion')} allowClear />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：證件信息
         ═══════════════════════════════════════════ */}
      <Modal
        title={t('employeeDetail.idInfo')}
        open={idInfoModalVisible}
        onOk={handleSaveIdInfo}
        onCancel={() => setIdInfoModalVisible(false)}
        width={720}
        destroyOnClose
      >
        <Form form={idInfoForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="idType" label={t('employeeDetail.labelIdType')}>
              <Select options={ID_TYPE_OPTIONS} placeholder={t('employeeDetail.labelIdType')} allowClear />
            </Form.Item>
            <Form.Item name="idNumber" label={t('employeeDetail.labelIdNumber')}>
              <Input />
            </Form.Item>
            <Form.Item name="idAddress" label={t('employeeDetail.labelIdAddress')}>
              <Input />
            </Form.Item>
            <Form.Item name="householdType" label={t('employeeDetail.labelHouseholdType')}>
              <Select options={HOUSEHOLD_TYPE_OPTIONS} placeholder={t('employeeDetail.labelHouseholdType')} allowClear />
            </Form.Item>
            <Form.Item name="householdLocation" label={t('employeeDetail.labelHouseholdLocation')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.labelHouseholdLocation')}
                allowClear
                options={locationOptions.map(c => ({ value: c.label, label: c.label }))}
              />
            </Form.Item>
            <Form.Item name="nativePlace" label={t('employeeDetail.labelNativePlace')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.labelNativePlace')}
                allowClear
                options={locationOptions.map(c => ({ value: c.label, label: c.label }))}
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：通訊信息
         ═══════════════════════════════════════════ */}
      <Modal
        title={t('employeeDetail.contactInfo')}
        open={contactModalVisible}
        onOk={handleSaveContact}
        onCancel={() => setContactModalVisible(false)}
        width={720}
        destroyOnClose
      >
        <Form form={contactForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="mobile" label={t('employeeDetail.labelMobile')}>
              <Input />
            </Form.Item>
            <Form.Item name="email" label={t('employeeDetail.labelEmail')}>
              <Input />
            </Form.Item>
            {/* 2.1 住址拆分：国家 */}
            <Form.Item name="addressCountry" label={t('employeeDetail.labelAddressCountry')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.labelAddressCountry')}
                allowClear
                options={permCountryOptions.map(c => ({ value: c.label, label: c.label }))}
              />
            </Form.Item>
            {/* 2.1 住址拆分：城市（联动国家） */}
            <Form.Item name="addressCity" label={t('employeeDetail.labelAddressCity')}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder={t('employeeDetail.labelAddressCity')}
                allowClear
                disabled={!watchContactCountry}
                options={contactCityOptions.map(c => ({ value: c.label, label: c.label }))}
              />
            </Form.Item>
          </div>
          {/* 2.1 住址拆分：详细地址 */}
          <Form.Item name="addressDetail" label={t('employeeDetail.labelAddressDetail')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：緊急聯繫人
         ═══════════════════════════════════════════ */}
      <Modal
        title={t('employeeDetail.emergencyInfo')}
        open={emergencyModalVisible}
        onOk={handleSaveEmergency}
        onCancel={() => setEmergencyModalVisible(false)}
        width={720}
        destroyOnClose
      >
        <Form form={emergencyForm} layout="vertical">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="name" label={t('employee.nameLabel')} rules={[{ required: true, message: t('employeeDetail.nameRequired') }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label={t('employeeDetail.labelEmergencyPhone')} rules={[{ required: true, message: t('employeeDetail.phoneRequired') }]}>
              <Input />
            </Form.Item>
            <Form.Item name="relation" label={t('employeeDetail.labelRelation')} rules={[{ required: true, message: t('employeeDetail.relationRequired') }]}>
              <Select
                showSearch
                optionFilterProp="label"
                options={RELATIONSHIP_OPTIONS}
                placeholder={t('employeeDetail.labelRelation')}
                allowClear
              />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ═══════════════════════════════════════════
         彈窗：重置密碼
         ═══════════════════════════════════════════ */}
      <Modal
        title={t('employeeDetail.resetPassword')}
        open={resetPwdModalVisible}
        onOk={handleResetPassword}
        onCancel={() => { setResetPwdModalVisible(false); resetPwdForm.resetFields() }}
        width={480}
        destroyOnClose
      >
        <Form form={resetPwdForm} layout="vertical">
          <Form.Item name="newPassword" label={t('employeeDetail.newPassword')} rules={[{ required: true, message: t('employeeDetail.newPasswordRequired') }]}>
            <Input.Password placeholder={t('employeeDetail.newPasswordPh')} />
          </Form.Item>
          <Form.Item name="confirmPassword" label={t('employeeDetail.confirmPassword')} rules={[{ required: true, message: t('employeeDetail.confirmPasswordRequired') }]}>
            <Input.Password placeholder={t('employeeDetail.confirmPasswordPh')} />
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
              <Select placeholder={t('employeeDetail.colCompany')} allowClear options={[
                { value: '珠海闪蜂科技有限公司', label: '珠海闪蜂科技有限公司' },
                { value: '珠海麦峰科技有限公司', label: '珠海麦峰科技有限公司' },
              ]} />
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
