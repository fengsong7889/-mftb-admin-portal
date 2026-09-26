import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Space, TreeSelect, message,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { fetchPositions, type PositionItem } from '../../../api/position'
import { fetchHrDictOptions, HR_DICT_TYPE, type HrDictOption } from '../../../api/hrDict'
import { fetchContractLedger, type ContractLedgerItem } from '../../../api/employee'
import {
  HR_LIFECYCLE_LIST_PATH,
  HR_LIFECYCLE_MENU_KEY,
  HR_LIFECYCLE_ROUTE,
  fetchLifecycleEmployeeOptions,
  fetchLifecycleRequest,
  saveLifecycleDraft,
  saveAndSubmitLifecycle,
  updateLifecycleRequest,
  type HrEmployeeBrief,
  type HrLifecyclePayload,
  type HrLifecycleType,
} from '../../../api/hrLifecycle'
import { buildDeptTree } from './meta'

interface Props {
  type: HrLifecycleType
}

/** 表单内部值（日期用 Dayjs，提交时转字符串） */
interface FormValues {
  userId?: number
  empName?: string
  deptId?: number
  positionId?: number
  effectiveDate?: Dayjs
  reason?: string
  offerDate?: Dayjs
  probationMonths?: number
  expectedRegularDate?: Dayjs
  idCardNo?: string
  mobile?: string
  email?: string
  company?: string
  workCity?: string
  employeeCategory?: string
  newDeptId?: number
  newPositionId?: number
  newCompany?: string
  newSuperior?: string
  dimissionType?: string
  lastWorkDate?: Dayjs
  assetReturn?: string
  salarySettlement?: string
  handoverNote?: string
  remark?: string
  // 合同续签
  newContractNo?: string
  newContractType?: string
  newContractCompany?: string
  newContractStartDate?: Dayjs
  newContractEndDate?: Dayjs
}

/** 入转调离单据表单页（新增/编辑草稿共用，按 type 渲染字段块；提交走 OA 审批） */
export default function LifecycleForm({ type }: Props) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t, i18n } = useTranslation()
  const { hasPermission } = useAuth()
  const menuKey = HR_LIFECYCLE_MENU_KEY[type]
  const listPath = HR_LIFECYCLE_LIST_PATH[type]
  /** 表单/详情路由前缀（续签为 /hr-contract-renew，返回列表仍是合同台账页） */
  const routeBase = HR_LIFECYCLE_ROUTE[type]
  const canEdit = hasPermission(`${menuKey}:edit`)

  const idParam = searchParams.get('id')
  const editId = idParam ? Number(idParam) : undefined

  const [form] = Form.useForm<FormValues>()
  /** 续签单据对应的原合同（新建时由台账「續簽」入口带 contractId 进入，编辑时由单据自身回填） */
  const [originContract, setOriginContract] = useState<ContractLedgerItem | null>(null)
  const [renewContractId, setRenewContractId] = useState<number | undefined>(
    () => Number(searchParams.get('contractId')) || undefined)
  const [renewContractNo, setRenewContractNo] = useState<string | undefined>(
    () => searchParams.get('contractNo') || undefined)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [readonly, setReadonly] = useState(false)
  const [reqNo, setReqNo] = useState<string>()

  // 下拉数据源
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [positions, setPositions] = useState<PositionItem[]>([])
  const [companies, setCompanies] = useState<HrDictOption[]>([])
  const [categories, setCategories] = useState<HrDictOption[]>([])
  const [contractTypes, setContractTypes] = useState<HrDictOption[]>([])
  const [empOptions, setEmpOptions] = useState<HrEmployeeBrief[]>([])
  const [empSearching, setEmpSearching] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isNonZh = !i18n.language?.startsWith('zh')
  const deptTree = useMemo(() => buildDeptTree(departments), [departments])
  const positionOptions = useMemo(() => positions.map(p => ({
    value: p.id,
    label: `${p.name}${p.jobLevel ? ` (${p.sequence}${p.jobLevel}/${p.rank ?? '-'})` : ''}`,
  })), [positions])
  const companyOptions = useMemo(() => companies.map(c => ({
    value: c.name,
    label: isNonZh ? (c.nameEn || c.name) : c.name,
  })), [companies, isNonZh])
  const categoryOptions = useMemo(() => categories.map(c => ({
    value: c.name,
    label: isNonZh ? (c.nameEn || c.name) : c.name,
  })), [categories, isNonZh])
  const contractTypeOptions = useMemo(() => contractTypes.map(c => ({
    value: c.name,
    label: isNonZh ? (c.nameEn || c.name) : c.name,
  })), [contractTypes, isNonZh])
  const dimissionTypeOptions = useMemo(() => [
    { value: 'voluntary', label: t('hrLifecycle.dimissionVoluntary') },
    { value: 'involuntary', label: t('hrLifecycle.dimissionInvoluntary') },
    { value: 'expired', label: t('hrLifecycle.dimissionExpired') },
  ], [t])

  useEffect(() => {
    fetchDepartments().then(setDepartments).catch(() => setDepartments([]))
    fetchPositions().then(setPositions).catch(() => setPositions([]))
    fetchHrDictOptions(HR_DICT_TYPE.EMPLOYER_COMPANY).then(setCompanies).catch(() => setCompanies([]))
    fetchHrDictOptions(HR_DICT_TYPE.EMPLOYEE_CATEGORY).then(setCategories).catch(() => setCategories([]))
    fetchHrDictOptions(HR_DICT_TYPE.CONTRACT_TYPE).then(setContractTypes).catch(() => setContractTypes([]))
  }, [])

  /** 编辑模式：加载单据并回填 */
  useEffect(() => {
    if (editId == null) return
    setLoading(true)
    fetchLifecycleRequest(editId)
      .then(item => {
        setReqNo(item.reqNo)
        if (item.status === 'pending' || item.status === 'approved' || item.status === 'completed') {
          setReadonly(true)
        }
        const candidate = safeParse(item.candidateInfo)
        const settlement = safeParse(item.settlementInfo)
        form.setFieldsValue({
          userId: item.userId ?? undefined,
          empName: item.empName,
          deptId: item.deptId ?? undefined,
          positionId: item.positionId ?? undefined,
          effectiveDate: item.effectiveDate ? dayjs(item.effectiveDate) : undefined,
          reason: item.reason ?? undefined,
          offerDate: item.offerDate ? dayjs(item.offerDate) : undefined,
          probationMonths: item.probationMonths ?? undefined,
          expectedRegularDate: item.expectedRegularDate ? dayjs(item.expectedRegularDate) : undefined,
          idCardNo: item.idCardNo ?? undefined,
          mobile: item.mobile ?? undefined,
          email: item.email ?? undefined,
          company: (candidate.company as string) ?? undefined,
          workCity: (candidate.workCity as string) ?? undefined,
          employeeCategory: (candidate.employeeCategory as string) ?? undefined,
          newDeptId: item.newDeptId ?? undefined,
          newPositionId: item.newPositionId ?? undefined,
          newCompany: item.newCompany ?? undefined,
          newSuperior: item.newSuperior ?? undefined,
          dimissionType: item.dimissionType ?? undefined,
          lastWorkDate: item.lastWorkDate ? dayjs(item.lastWorkDate) : undefined,
          assetReturn: (settlement.assetReturn as string) ?? undefined,
          salarySettlement: (settlement.salarySettlement as string) ?? undefined,
          handoverNote: (settlement.handoverNote as string) ?? undefined,
          remark: item.remark ?? undefined,
          newContractNo: item.newContractNo ?? undefined,
          newContractType: item.newContractType ?? undefined,
          newContractCompany: item.newContractCompany ?? undefined,
          newContractStartDate: item.newContractStartDate ? dayjs(item.newContractStartDate) : undefined,
          newContractEndDate: item.newContractEndDate ? dayjs(item.newContractEndDate) : undefined,
        })
        if (item.type === 'renew') {
          // 编辑态续签单：原合同锚点取自单据本身，摘要卡据此回显
          setRenewContractId(item.contractId ?? undefined)
          setRenewContractNo(item.contractNo ?? undefined)
        }
      })
      .catch(() => {
        // 请求层已提示
      })
      .finally(() => setLoading(false))
  }, [editId, form])

  /** 续签：按 contractId(+contractNo 精确化) 从台账取原合同；仅新建时预填员工与新合同字段 */
  useEffect(() => {
    if (type !== 'renew' || renewContractId == null) return
    fetchContractLedger({ page: 1, size: 50, keyword: renewContractNo })
      .then(res => {
        const hit = (res.records || []).find(r => r.id === renewContractId)
        if (!hit) return
        setOriginContract(hit)
        if (editId != null) return
        const start = hit.endDate ? dayjs(hit.endDate).add(1, 'day') : undefined
        form.setFieldsValue({
          userId: hit.userId,
          empName: hit.employeeName,
          newContractType: hit.contractType,
          newContractCompany: hit.company,
          newContractStartDate: start,
          newContractEndDate: start ? start.add(3, 'year') : undefined,
        })
      })
      .catch(() => undefined)
  }, [type, renewContractId, renewContractNo, editId, form])

  /** 员工搜索（防抖 300ms） */
  const handleEmpSearch = useCallback((keyword: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      setEmpSearching(true)
      try {
        setEmpOptions(await fetchLifecycleEmployeeOptions(type, keyword))
      } catch {
        setEmpOptions([])
      } finally {
        setEmpSearching(false)
      }
    }, 300)
  }, [type])

  /** 选中员工后回填快照（转正/调动/离职共用） */
  const handleEmpSelect = (userId: number) => {
    const brief = empOptions.find(o => o.userId === userId)
    if (!brief) return
    form.setFieldsValue({
      empName: brief.name,
      deptId: brief.departmentId ?? undefined,
      positionId: brief.positionId ?? undefined,
    })
    if (type === 'transfer') {
      form.setFieldsValue({
        newDeptId: brief.departmentId ?? undefined,
        newPositionId: brief.positionId ?? undefined,
        newCompany: brief.company ?? undefined,
        newSuperior: brief.directSuperior ?? undefined,
      })
    }
    if (type === 'regular') {
      // 转正默认按入职时约定的试用月数推算（无约定则留空由 HR 填写）
      const probation = form.getFieldValue('probationMonths')
      if (!form.getFieldValue('effectiveDate') && typeof probation === 'number') {
        form.setFieldValue('effectiveDate', dayjs().add(probation, 'month'))
      }
    }
  }

  /** 表单值 → 请求载荷 */
  const buildPayload = (values: FormValues): HrLifecyclePayload => {
    const payload: HrLifecyclePayload = {
      type,
      // empName 已由表单 required 校验兜底，兼容 TS 可选链回退
      empName: values.empName?.trim() ?? '',
      reason: values.reason?.trim(),
      remark: values.remark?.trim(),
    }
    if (type !== 'onboard') {
      payload.userId = values.userId
      payload.effectiveDate = values.effectiveDate?.format('YYYY-MM-DD')
    }
    if (type === 'onboard') {
      payload.effectiveDate = values.effectiveDate?.format('YYYY-MM-DD')
      payload.offerDate = values.offerDate?.format('YYYY-MM-DD')
      payload.probationMonths = values.probationMonths
      payload.expectedRegularDate = values.expectedRegularDate?.format('YYYY-MM-DD')
      payload.idCardNo = values.idCardNo?.trim()
      payload.mobile = values.mobile?.trim()
      payload.email = values.email?.trim()
      payload.deptId = values.deptId
      payload.positionId = values.positionId
      payload.candidateInfo = JSON.stringify({
        company: values.company,
        workCity: values.workCity,
        employeeCategory: values.employeeCategory,
      })
    }
    if (type === 'renew') {
      payload.contractId = renewContractId
      payload.newContractNo = values.newContractNo?.trim()
      payload.newContractType = values.newContractType
      payload.newContractCompany = values.newContractCompany
      payload.newContractStartDate = values.newContractStartDate?.format('YYYY-MM-DD')
      payload.newContractEndDate = values.newContractEndDate?.format('YYYY-MM-DD')
    }
    if (type === 'transfer') {
      payload.newDeptId = values.newDeptId
      payload.newPositionId = values.newPositionId
      payload.newCompany = values.newCompany
      payload.newSuperior = values.newSuperior?.trim()
    }
    if (type === 'dimission') {
      payload.dimissionType = values.dimissionType
      payload.lastWorkDate = values.lastWorkDate?.format('YYYY-MM-DD')
      payload.settlementInfo = JSON.stringify({
        assetReturn: values.assetReturn,
        salarySettlement: values.salarySettlement,
        handoverNote: values.handoverNote,
      })
    }
    return payload
  }

  /** 二次确认面板行 */
  const confirmRows = (values: FormValues) => {
    const rows: Array<[string, string]> = []
    rows.push([t(type === 'onboard' ? 'hrLifecycle.empName' : 'hrLifecycle.employee'), values.empName || '-'])
    if (type === 'onboard') {
      rows.push([t('hrLifecycle.dept'), deptTitle(values.deptId)])
      rows.push([t('hrLifecycle.position'), positionTitle(values.positionId)])
      rows.push([t('hrLifecycle.hireDate'), values.effectiveDate?.format('YYYY-MM-DD') ?? '-'])
    }
    if (type === 'regular') {
      rows.push([t('hrLifecycle.effectiveDate'), values.effectiveDate?.format('YYYY-MM-DD') ?? '-'])
    }
    if (type === 'transfer') {
      rows.push([t('hrLifecycle.newDept'), deptTitle(values.newDeptId)])
      rows.push([t('hrLifecycle.newPosition'), positionTitle(values.newPositionId)])
      rows.push([t('hrLifecycle.effectiveDate'), values.effectiveDate?.format('YYYY-MM-DD') ?? '-'])
    }
    if (type === 'dimission') {
      rows.push([t('hrLifecycle.dimissionType'),
        dimissionTypeOptions.find(o => o.value === values.dimissionType)?.label ?? '-'])
      rows.push([t('hrLifecycle.lastWorkDate'), values.lastWorkDate?.format('YYYY-MM-DD') ?? '-'])
    }
    rows.push([t('hrLifecycle.reason'), values.reason || '-'])
    return rows
  }

  const deptTitle = (deptId?: number) =>
    deptId == null ? '-' : (departments.find(d => d.id === deptId)?.name ?? '-')
  const positionTitle = (positionId?: number) =>
    positionId == null ? '-' : (positions.find(p => p.id === positionId)?.name ?? '-')

  /** 保存草稿 */
  const handleSaveDraft = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const payload = buildPayload(values)
      if (editId == null) {
        const created = await saveLifecycleDraft(payload)
        message.success(t('hrLifecycle.draftSaved'))
        navigate(`${routeBase}-detail?id=${created.id}`, { replace: true })
      } else {
        await updateLifecycleRequest(editId, payload)
        message.success(t('hrLifecycle.saved'))
        navigate(`${routeBase}-detail?id=${editId}`, { replace: true })
      }
    } catch {
      // 请求层已提示
    } finally {
      setSaving(false)
    }
  }

  /** 提交审批：先表单校验 → 二次确认 → 保存 + 发起 OA 流程 */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    Modal.confirm({
      title: t('hrLifecycle.confirmSubmitTitle'),
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          {confirmRows(values).map(([label, val]) => (
            <div className="confirm-info-row" key={label}><span>{label}：</span><b>{val}</b></div>
          ))}
        </div>
      ),
      okText: t('hrLifecycle.confirmSubmit'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        const payload = buildPayload(values)
        const result = await saveAndSubmitLifecycle(editId, payload)
        message.success(t('hrLifecycle.submitted', { flowNo: result.flowNo }))
        navigate(`${routeBase}-detail?id=${result.id}`, { replace: true })
      },
    })
  }

  const titleKey = type === 'renew' ? 'hrLifecycle.renewFormTitle'
    : type === 'onboard' ? 'hrLifecycle.onboardFormTitle'
    : type === 'regular' ? 'hrLifecycle.regularFormTitle'
      : type === 'transfer' ? 'hrLifecycle.transferFormTitle'
        : 'hrLifecycle.dimissionFormTitle'

  const sectionCardStyle = { marginBottom: 16, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }

  return (
    <div className="content-area" style={{ opacity: loading ? 0.6 : 1 }}>
      {/* 页面头部 */}
      <div style={{
        position: 'relative', background: '#fff', borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 16,
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB65D, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(listPath)}>{t('common.back')}</Button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{t(titleKey)}</div>
            {reqNo && <div style={{ fontSize: 12, color: '#8C8C8C' }}>{t('hrLifecycle.reqNo')}: {reqNo}</div>}
          </div>
          {readonly && <span style={{ color: '#FF4D4F', fontSize: 13 }}>{t('hrLifecycle.readonlyTip')}</span>}
        </div>
      </div>

      <Form form={form} layout="vertical" disabled={readonly || loading}>
        {/* 员工/候选人信息 */}
        <Card size="small" style={sectionCardStyle} title={t(type === 'onboard' ? 'hrLifecycle.sectionCandidate' : 'hrLifecycle.sectionEmployee')}>
          {type !== 'onboard' && type !== 'renew' && (
            <Form.Item
              name="userId" label={t('hrLifecycle.employee')}
              rules={[{ required: true, message: t('hrLifecycle.employeeRequired') }]}
            >
              <Select
                showSearch filterOption={false} allowClear
                placeholder={t('hrLifecycle.employeePlaceholder')}
                onSearch={handleEmpSearch}
                onFocus={() => handleEmpSearch('')}
                onChange={handleEmpSelect}
                loading={empSearching}
                notFoundContent={empSearching ? undefined : t('common.noData')}
                options={empOptions.map(o => ({
                  value: o.userId,
                  label: `${o.name}(${o.empId})${o.department ? ` · ${o.department}` : ''}${o.position ? ` / ${o.position}` : ''}`,
                }))}
              />
            </Form.Item>
          )}
          <Space size={16} wrap style={{ width: '100%' }}>
            <Form.Item
              name="empName" label={t(type === 'onboard' ? 'hrLifecycle.empName' : 'hrLifecycle.employeeName')}
              rules={[{ required: true, message: t('hrLifecycle.empNameRequired') }]}
              style={{ minWidth: 220 }}
            >
              <Input placeholder={t('hrLifecycle.empNamePlaceholder')} maxLength={64} disabled={type !== 'onboard'} />
            </Form.Item>
            {type === 'onboard' && (
              <>
                <Form.Item
                  name="deptId" label={t('hrLifecycle.dept')}
                  rules={[{ required: true, message: t('hrLifecycle.deptRequired') }]}
                  style={{ minWidth: 220 }}
                >
                  <TreeSelect treeData={deptTree} treeDefaultExpandAll showSearch allowClear
                    placeholder={t('hrLifecycle.deptPlaceholder')}
                    fieldNames={{ label: 'title' }}
                    styles={{ popup: { root: { maxHeight: 400, overflow: 'auto' } } }}
                  />
                </Form.Item>
                <Form.Item
                  name="positionId" label={t('hrLifecycle.position')}
                  rules={[{ required: true, message: t('hrLifecycle.positionRequired') }]}
                  style={{ minWidth: 220 }}
                >
                  <Select options={positionOptions} showSearch optionFilterProp="label" allowClear
                    placeholder={t('hrLifecycle.positionPlaceholder')} />
                </Form.Item>
              </>
            )}
          </Space>
        </Card>

        {/* 入职安排 */}
        {type === 'onboard' && (
          <Card size="small" style={sectionCardStyle} title={t('hrLifecycle.sectionOnboard')}>
            <Space size={16} wrap>
              <Form.Item
                name="effectiveDate" label={t('hrLifecycle.hireDate')}
                rules={[{ required: true, message: t('hrLifecycle.hireDateRequired') }]}
              >
                <DatePicker style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="offerDate" label={t('hrLifecycle.offerDate')}>
                <DatePicker style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="probationMonths" label={t('hrLifecycle.probationMonths')}>
                <InputNumber min={0} max={12} style={{ width: 140 }}
                  onChange={(months) => {
                    const hire = form.getFieldValue('effectiveDate') as Dayjs | undefined
                    if (hire && typeof months === 'number') {
                      form.setFieldValue('expectedRegularDate', hire.add(months, 'month'))
                    }
                  }}
                />
              </Form.Item>
              <Form.Item name="expectedRegularDate" label={t('hrLifecycle.expectedRegularDate')}>
                <DatePicker style={{ width: 200 }} />
              </Form.Item>
            </Space>
            <Space size={16} wrap>
              <Form.Item name="company" label={t('hrLifecycle.company')}>
                <Select options={companyOptions} showSearch optionFilterProp="label" allowClear style={{ minWidth: 240 }}
                  placeholder={t('hrLifecycle.companyPlaceholder')} />
              </Form.Item>
              <Form.Item name="employeeCategory" label={t('hrLifecycle.employeeCategory')}>
                <Select options={categoryOptions} allowClear style={{ minWidth: 160 }}
                  placeholder={t('common.pleaseSelect')} />
              </Form.Item>
              <Form.Item name="workCity" label={t('hrLifecycle.workCity')}>
                <Input style={{ width: 160 }} maxLength={64} placeholder={t('hrLifecycle.workCityPlaceholder')} />
              </Form.Item>
            </Space>
            <Space size={16} wrap>
              <Form.Item name="idCardNo" label={t('hrLifecycle.idCardNo')}>
                <Input style={{ width: 220 }} maxLength={64} placeholder={t('hrLifecycle.idCardNoPlaceholder')} />
              </Form.Item>
              <Form.Item
                name="mobile" label={t('hrLifecycle.mobile')}
                rules={[{ pattern: /^[0-9+\-\s]{6,20}$/, message: t('hrLifecycle.mobileInvalid') }]}
              >
                <Input style={{ width: 180 }} maxLength={32} />
              </Form.Item>
              <Form.Item
                name="email" label={t('hrLifecycle.email')}
                rules={[{ type: 'email', message: t('hrLifecycle.emailInvalid') }]}
              >
                <Input style={{ width: 240 }} maxLength={128} />
              </Form.Item>
            </Space>
          </Card>
        )}

        {/* 调动信息 */}
        {type === 'transfer' && (
          <Card size="small" style={sectionCardStyle} title={t('hrLifecycle.sectionTransfer')}>
            <Space size={16} wrap>
              <Form.Item
                name="newDeptId" label={t('hrLifecycle.newDept')}
                rules={[{ required: true, message: t('hrLifecycle.newDeptRequired') }]}
              >
                <TreeSelect treeData={deptTree} treeDefaultExpandAll showSearch allowClear style={{ width: 240 }}
                  placeholder={t('hrLifecycle.deptPlaceholder')}
                  fieldNames={{ label: 'title' }}
                  styles={{ popup: { root: { maxHeight: 400, overflow: 'auto' } } }}
                />
              </Form.Item>
              <Form.Item name="newPositionId" label={t('hrLifecycle.newPosition')}>
                <Select options={positionOptions} showSearch optionFilterProp="label" allowClear style={{ width: 240 }}
                  placeholder={t('hrLifecycle.positionPlaceholder')} />
              </Form.Item>
              <Form.Item name="newCompany" label={t('hrLifecycle.company')}>
                <Select options={companyOptions} showSearch optionFilterProp="label" allowClear style={{ width: 240 }}
                  placeholder={t('common.pleaseSelect')} />
              </Form.Item>
              <Form.Item name="newSuperior" label={t('hrLifecycle.newSuperior')}>
                <Input style={{ width: 180 }} maxLength={64} placeholder={t('hrLifecycle.superiorPlaceholder')} />
              </Form.Item>
            </Space>
          </Card>
        )}

        {/* 离职结算 */}
        {type === 'dimission' && (
          <Card size="small" style={sectionCardStyle} title={t('hrLifecycle.sectionDimission')}>
            <Space size={16} wrap>
              <Form.Item
                name="dimissionType" label={t('hrLifecycle.dimissionType')}
                rules={[{ required: true, message: t('hrLifecycle.dimissionTypeRequired') }]}
              >
                <Select options={dimissionTypeOptions} style={{ width: 180 }} placeholder={t('common.pleaseSelect')} />
              </Form.Item>
              <Form.Item
                name="lastWorkDate" label={t('hrLifecycle.lastWorkDate')}
                rules={[{ required: true, message: t('hrLifecycle.lastWorkDateRequired') }]}
              >
                <DatePicker style={{ width: 200 }} />
              </Form.Item>
            </Space>
            <Space size={16} wrap style={{ width: '100%' }}>
              <Form.Item name="assetReturn" label={t('hrLifecycle.assetReturn')} style={{ minWidth: 280 }}>
                <Input maxLength={255} placeholder={t('hrLifecycle.assetReturnPlaceholder')} />
              </Form.Item>
              <Form.Item name="salarySettlement" label={t('hrLifecycle.salarySettlement')} style={{ minWidth: 280 }}>
                <Input maxLength={255} placeholder={t('hrLifecycle.salarySettlementPlaceholder')} />
              </Form.Item>
            </Space>
          </Card>
        )}

        {/* 合同续签信息 */}
        {type === 'renew' && (
          <Card size="small" style={sectionCardStyle} title={t('hrLifecycle.sectionRenew')}>
            <div style={{ marginBottom: 12, color: '#595959', fontSize: 13 }}>
              {originContract
                ? t('hrLifecycle.originContractInfo', {
                    no: originContract.contractNo,
                    type: originContract.contractType || '-',
                    company: originContract.company || '-',
                    start: originContract.startDate || '-',
                    end: originContract.endDate || '-',
                  })
                : t('hrLifecycle.originContractLoading')}
            </div>
            <Space size={16} wrap>
              <Form.Item name="newContractNo" label={t('hrLifecycle.newContractNo')}>
                <Input style={{ width: 200 }} maxLength={64} placeholder={t('hrLifecycle.newContractNoPlaceholder')} />
              </Form.Item>
              <Form.Item name="newContractType" label={t('hrLifecycle.newContractType')}>
                <Select options={contractTypeOptions} allowClear style={{ minWidth: 180 }} placeholder={t('common.pleaseSelect')} />
              </Form.Item>
              <Form.Item name="newContractCompany" label={t('hrLifecycle.newContractCompany')}>
                <Select options={companyOptions} showSearch optionFilterProp="label" allowClear style={{ minWidth: 240 }}
                  placeholder={t('common.pleaseSelect')} />
              </Form.Item>
            </Space>
            <Space size={16} wrap>
              <Form.Item name="newContractStartDate" label={t('hrLifecycle.newStartDate')}
                rules={[{ required: true, message: t('hrLifecycle.newStartDateRequired') }]}>
                <DatePicker style={{ width: 200 }} />
              </Form.Item>
              <Form.Item name="newContractEndDate" label={t('hrLifecycle.newEndDate')}
                rules={[{ required: true, message: t('hrLifecycle.newEndDateRequired') }]}>
                <DatePicker style={{ width: 200 }} />
              </Form.Item>
            </Space>
          </Card>
        )}

        {/* 生效信息与事由 */}
        <Card size="small" style={sectionCardStyle} title={t('hrLifecycle.sectionCommon')}>
          <Space size={16} wrap>
            {type !== 'onboard' && (
              <Form.Item
                name="effectiveDate" label={t('hrLifecycle.effectiveDate')}
                rules={type === 'regular' || type === 'transfer'
                  ? [{ required: true, message: t('hrLifecycle.effectiveDateRequired') }] : undefined}
              >
                <DatePicker style={{ width: 200 }} />
              </Form.Item>
            )}
          </Space>
          <Form.Item name="reason" label={t('hrLifecycle.reason')}
            rules={[{ required: true, message: t('hrLifecycle.reasonRequired') }]}>
            <Input.TextArea rows={2} maxLength={500} showCount placeholder={t('hrLifecycle.reasonPlaceholder')} />
          </Form.Item>
          <Form.Item name="remark" label={t('hrLifecycle.remark')}>
            <Input.TextArea rows={2} maxLength={500} placeholder={t('hrLifecycle.remarkPlaceholder')} />
          </Form.Item>
        </Card>

        {/* 底部操作 */}
        {!readonly && canEdit && (
          <div className="form-footer">
            <Button onClick={() => navigate(editId != null ? `${routeBase}-detail?id=${editId}` : listPath)}>
              {t('common.cancel')}
            </Button>
            <Button icon={<SaveOutlined />} loading={saving} onClick={handleSaveDraft}>
              {t('hrLifecycle.saveDraft')}
            </Button>
            <Button type="primary" icon={<SendOutlined />} loading={saving} onClick={handleSubmit}>
              {t('hrLifecycle.submitApproval')}
            </Button>
          </div>
        )}
      </Form>
    </div>
  )
}

/** 安全解析 JSON 字段（后端可能存 'null' 字符串或空值） */
function safeParse(raw?: string | null): Record<string, unknown> {
  if (!raw || raw === 'null') return {}
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}
