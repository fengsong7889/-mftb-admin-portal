/**
 * 归还登记表单 — 接通真实后端 API
 *
 * 支持从领用(claimId)、借用(borrowId)或资产(assetId)入口进入。
 * 正常归还支持「归还即承接」：指定接收部门与归还位置，后端释放占用时同步归位。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import AssetParameters from '../../../components/AssetParameters'
import type { AssetParameterSource } from '../../../utils/assetParams'
import { fetchAssetDetail } from '../../../api/asset'
import { fetchClaimDetail, fetchClaimEmployeeOptions } from '../../../api/eamClaim'
import type { ClaimEmployee, ClaimRow } from '../../../pages/AssetManagement/AssetClaim/claimViewTypes'
import { fetchBorrowDetail, type BorrowRow } from '../../../api/eamBorrow'
import type { AssetItem } from '../../../api/asset'
import { useTransferData } from '../AssetTransfer/useTransferData'
import { TransferError } from '../AssetTransfer/TransferLayout'
import { Alert, Button, DatePicker, Descriptions, Form, Input, Radio, Select, Spin, Tag, TreeSelect } from 'antd'
import { SaveOutlined, AppstoreOutlined, InboxOutlined, FileTextOutlined, FileProtectOutlined, RollbackOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { ReturnHeader } from './ReturnLayout'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { fetchLocationList, type AssetLocation } from '../../../api/eam'
import type { ReturnRegisterDTO } from '../../../api/eamReturn'
import BrandTag from '../../../components/BrandTag'
import { type ClaimStatus, type SignatureStatus } from '../AssetClaim/claimViewTypes'

const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }

const CLAIM_STATUS_META: Record<ClaimStatus, { label: string; color: string }> = {
  pending_signature: { label: '待簽領用', color: 'processing' },
  claimed: { label: '在用', color: 'success' },
  returned: { label: '已歸還', color: 'default' },
  cancelled: { label: '已取消', color: 'default' },
  transferred: { label: '已調撥', color: 'orange' },
}
const SIGNATURE_META: Record<SignatureStatus, { label: string; color: string }> = {
  pending: { label: '待本人簽署', color: 'processing' },
  signed: { label: '本人已簽', color: 'success' },
  proxy_pending: { label: '代辦未簽', color: 'warning' },
  not_required: { label: '已取消，無需簽署', color: 'default' },
}

const DEPT_STATUS_ENABLED = 1

/** 归还登记页模块卡片（对齐 ClaimRecordDetail 样式） */
const returnCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}
function ReturnCard({ icon, iconBg, title, children }: {
  icon: React.ReactNode; iconBg: string; title: string; children: React.ReactNode
}) {
  return (
    <div style={returnCardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      </div>
      {/* 内容直接渲染，不额外包裹，保证卡片高度紧贴内容 */}
      {children}
    </div>
  )
}

interface DeptTreeOption {
  value: string
  title: string
  disabled?: boolean
  children?: DeptTreeOption[]
}

/** 平铺部门列表构建 TreeSelect 树数据 */
function buildDeptTreeData(list: DepartmentItem[]): DeptTreeOption[] {
  const nodeMap = new Map<number, DeptTreeOption>()
  list.forEach(dept => {
    nodeMap.set(dept.id, {
      value: dept.name,
      title: dept.name,
      disabled: dept.status !== DEPT_STATUS_ENABLED,
      children: [],
    })
  })
  const roots: DeptTreeOption[] = []
  list.forEach(dept => {
    const node = nodeMap.get(dept.id)!
    const parent = dept.parentId ? nodeMap.get(dept.parentId) : undefined
    if (parent) parent.children!.push(node)
    else roots.push(node)
  })
  return roots
}

interface Values {
  date: Dayjs
  condition: 'normal' | 'damaged' | 'lost'
  reason: string
  actualReturnee?: { value: number; label: string } | null
  receiveDepartment?: string
  receiveLocationId?: number
}

interface Props {
  claimId?: number
  borrowId?: number
  assetId?: number
  operatorName?: string
  canEdit?: boolean
  loading?: boolean
  onSubmit: (dto: ReturnRegisterDTO) => void
  onBack: () => void
}

export default function ReturnForm({ claimId, borrowId, assetId, operatorName, canEdit = true, loading = false, onSubmit, onBack }: Props) {
  const { user } = useAuth()
  const [form] = Form.useForm<Values>()
  const condition = Form.useWatch('condition', form) ?? 'normal'
  const hasSource = claimId != null || borrowId != null || assetId != null
  const fetchSource = useCallback((): Promise<(AssetParameterSource & { assetNo: string; assetName: string }) | undefined> => {
    if (claimId) return fetchClaimDetail(claimId)
    if (borrowId) return fetchBorrowDetail(borrowId)
    if (assetId) return fetchAssetDetail(assetId)
    return Promise.resolve(undefined)
  }, [claimId, borrowId, assetId])
  const sourceState = useTransferData(fetchSource)

  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<ClaimEmployee[]>([])

  useEffect(() => {
    fetchDepartments().then(setDepartments).catch(() => { /* 接口异常时置空 */ })
    fetchLocationList().then(setLocations).catch(() => { /* 接口异常时置空 */ })
  }, [])

  const deptTreeData = useMemo(() => buildDeptTreeData(departments), [departments])

  /** 实际归还人下拉搜索 */
  const handleSearchEmployee = useCallback(async (keyword: string) => {
    if (!keyword || keyword.trim().length < 1) { setEmployeeOptions([]); return }
    try {
      const res = await fetchClaimEmployeeOptions(keyword.trim())
      setEmployeeOptions(res.records || [])
    } catch { setEmployeeOptions([]) }
  }, [])

  /** 来源数据加载后回填默认值 */
  useEffect(() => {
    if (!sourceState.data) return
    const d = sourceState.data as ClaimRow | BorrowRow | AssetItem
    const empId = (d as ClaimRow).employeeId ?? (d as BorrowRow).holderId ?? (d as AssetItem).currentHolderId
    const empName = (d as ClaimRow).empName ?? (d as BorrowRow).holderName ?? (d as AssetItem).userName
    const empNo = (d as ClaimRow).empNo
    if (empId != null && empName) {
      form.setFieldsValue({ actualReturnee: { value: empId, label: empNo ? `${empName}（${empNo}）` : empName } })
    }
  }, [sourceState.data, form])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const returnee = values.actualReturnee as { value: number; label: string } | null | undefined
      const dto: ReturnRegisterDTO = {
        claimId,
        borrowId,
        returnDate: values.date.format('YYYY-MM-DD'),
        assetCondition: values.condition,
        returnReason: values.condition === 'normal' ? values.reason : undefined,
        exceptionReason: values.condition !== 'normal' ? values.reason : undefined,
        actualReturneeId: returnee?.value,
        actualReturneeName: returnee?.label || user?.name,
        receiveDepartment: values.receiveDepartment,
        receiveLocationId: values.receiveLocationId,
      }
      await onSubmit(dto)
    } catch {
      // validation failed
    }
  }

  if (!canEdit) {
    return <Alert type="warning" showIcon message="無歸還辦理權限" description="請聯繫管理員分配資產歸還權限。" />
  }

  return <>
    {/* 统一收紧 Form vertical 布局下 Form.Item 的默认间距，避免撑高卡片 */}
    <style>{`.return-compact-form .ant-form-item { margin-bottom: 12px; }`}</style>
    <ReturnHeader title="歸還登記" onBack={onBack} />
    <Spin spinning={loading}>
        {/* ====== 模块 1：资产信息 ====== */}
        <ReturnCard icon={<InboxOutlined style={{ fontSize: 14, color: '#1890ff' }} />} iconBg="#e6f7ff" title="資產信息">
          <TransferError error={sourceState.error} retry={sourceState.refresh} />
            {sourceState.data && (() => {
              const d = sourceState.data as ClaimRow | BorrowRow | AssetItem
              const cr = d as ClaimRow
              const br = d as BorrowRow
              const ai = d as AssetItem
              const isClaim = claimId != null
              const isBorrow = borrowId != null
              const companyBrand = cr.companyBrand
              const assetCompanyBrand = ai.companyBrand
              const brand = cr.brand
              const assetBrand = ai.brand
              const assetType = cr.assetType
              const assetType2 = ai.assetType
              const purchaseValue = cr.purchaseValue ?? ai.purchaseValue
              const adminDepartment = cr.adminDepartment ?? ai.adminDepartment

              return (
                <>
                  <Descriptions column={4} size="middle">
                    <Descriptions.Item label="領用編號">
                      {isClaim
                        ? <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{cr.claimNo}</span>
                        : isBorrow
                          ? <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{br.borrowNo}</span>
                          : <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ai.assetNo}</span>
                      }
                    </Descriptions.Item>
                    <Descriptions.Item label="資產編號">
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{cr.assetNo || br.assetNo || ai.assetNo}</span>
                    </Descriptions.Item>
                    <Descriptions.Item label="資產名稱">{cr.assetName || br.assetName || ai.assetName}</Descriptions.Item>
                    <Descriptions.Item label="所屬品牌">
                      {isClaim && companyBrand ? <BrandTag value={companyBrand} />
                        : !isClaim && !isBorrow && assetCompanyBrand ? <BrandTag value={assetCompanyBrand} />
                        : '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="資產品牌">{brand || assetBrand || '—'}</Descriptions.Item>
                    <Descriptions.Item label="資產分類">{assetType || assetType2 || '—'}</Descriptions.Item>
                    <Descriptions.Item label="購買時價值">{purchaseValue != null ? `MOP ${Number(purchaseValue).toLocaleString()}` : '—'}</Descriptions.Item>
                    <Descriptions.Item label="管理部門">{adminDepartment || '—'}</Descriptions.Item>
                  </Descriptions>
                  <AssetParameters asset={sourceState.data} current />
                  {/* 领用配件快照 */}
                  {(() => {
                    const accs = (sourceState.data as ClaimRow)?.accessories
                    if (!accs || accs.length === 0) return null
                    return (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>領用配件</span>
                          <Tag color="orange" style={{ fontSize: 11 }}>{accs.length} 項</Tag>
                          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {accs.map((acc, idx) => (
                            <Tag key={idx} color="orange" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}>
                              {acc.name} × {acc.qty}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </>
              )
            })()}
          {!hasSource && <Alert className="claim-notice" showIcon type="info" message="未指定來源，請在列表中選擇領用/借用記錄進入歸還，或從資產台賬發起。" />}
        </ReturnCard>

        {/* ====== 模块 2：领用信息 ====== */}
        <ReturnCard icon={<FileTextOutlined style={{ fontSize: 14, color: '#1890ff' }} />} iconBg="#e6f7ff" title="領用信息">
            {sourceState.data && (() => {
              const d = sourceState.data as ClaimRow | BorrowRow | AssetItem
              const cr = d as ClaimRow
              const br = d as BorrowRow
              const ai = d as AssetItem
              const isClaim = claimId != null
              const isBorrow = borrowId != null

              const empName = cr.empName
              const empNo = cr.empNo
              const dept = cr.department
              const claimDate = cr.claimDate
              const createdAt = cr.createdAt
              const operator = cr.operator
              const status = cr.status

              const holderName = br.holderName
              const borrowDept = br.department
              const startDate = br.startDate
              const borrowOperator = br.operatorName
              const borrowStatus = br.status

              const assetUserName = ai.userName
              const assetDept = ai.department
              const assetClaimDate = ai.claimDate

              const claimReason = cr.claimReason
              const remark = cr.remark

              return (
                <Descriptions column={4} size="middle">
                  <Descriptions.Item label={isClaim ? '領用人' : isBorrow ? '借用人' : '使用人'}>
                    {isClaim && empNo ? `${empName}（${empNo}）`
                      : empName || holderName || assetUserName || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={isClaim ? '領用時部門' : isBorrow ? '借用部門' : '所在部門'}>
                    {dept || borrowDept || assetDept || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={isClaim ? '領用日期' : isBorrow ? '借用日期' : '使用日期'}>
                    {claimDate || startDate || assetClaimDate || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="實際登記時間">
                    {createdAt || br.createdAt || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="登記操作人">
                    {operator || borrowOperator || operatorName || user?.name || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label={isClaim ? '領用狀態' : isBorrow ? '借用狀態' : '資產狀態'}>
                    {isClaim && status
                      ? <Tag color={CLAIM_STATUS_META[status]?.color}>{CLAIM_STATUS_META[status]?.label ?? status}</Tag>
                      : isBorrow
                        ? <Tag color={borrowStatus === 'active' ? 'success' : borrowStatus === 'overdue' ? 'error' : 'default'}>
                            {borrowStatus === 'active' ? '借用中' : borrowStatus === 'overdue' ? '已逾期' : borrowStatus === 'returned' ? '已歸還' : borrowStatus}
                          </Tag>
                        : <Tag color={ai.status === 'in_use' ? 'success' : 'default'}>{ai.status || '—'}</Tag>
                    }
                  </Descriptions.Item>
                  <Descriptions.Item label="領用用途" span={2}>{claimReason || '—'}</Descriptions.Item>
                  {remark && <Descriptions.Item label="備註" span={4}>{remark}</Descriptions.Item>}
                </Descriptions>
              )
            })()}
        </ReturnCard>

        {/* ====== 模块 3：签收信息与凭证 ====== */}
        {claimId != null && (
          <ReturnCard icon={<FileProtectOutlined style={{ fontSize: 14, color: '#fa8c16' }} />} iconBg="#fff7e6" title="簽收信息與憑證">
              {sourceState.data && (() => {
                const cr = sourceState.data as ClaimRow
                const signatureStatus = cr.signatureStatus
                const signedAt = cr.signedAt

                return (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 48px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#8c8c8c' }}>簽收狀態：</span>
                      <Tag color={SIGNATURE_META[signatureStatus]?.color} style={{ marginInlineEnd: 0 }}>{SIGNATURE_META[signatureStatus]?.label ?? signatureStatus}</Tag>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, color: '#8c8c8c' }}>實際簽署時間：</span>
                      <span style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{signedAt || '—'}</span>
                    </div>
                  </div>
                )
              })()}
          </ReturnCard>
        )}

      <Form<Values> className="return-compact-form" form={form} layout="vertical" disabled={loading} initialValues={{ date: dayjs(), condition: 'normal' }}>
        <ReturnCard icon={<RollbackOutlined style={{ fontSize: 14, color: '#52c41a' }} />} iconBg="#f6ffed" title="歸還信息">
          <div className="return-grid">
            <Form.Item name="date" label="員工歸還日期" rules={[{ required: true }]}>
              <DatePicker disabledDate={d => d.isAfter(dayjs(), 'day')} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="actualReturnee" label="實際歸還人（如代辦）">
              <Select
                allowClear
                showSearch
                placeholder="搜索員工姓名或工號"
                optionFilterProp="label"
                optionLabelProp="label"
                filterOption={false}
                onSearch={handleSearchEmployee}
                notFoundContent="請輸入關鍵字搜索"
                style={{ width: '100%' }}
                options={employeeOptions.map(e => ({
                  value: e.employeeId,
                  label: `${e.empName}${e.empNo ? `（${e.empNo}）` : ''}`,
                }))}
              />
            </Form.Item>
          </div>
        </ReturnCard>

        <ReturnCard icon={<FileProtectOutlined style={{ fontSize: 14, color: '#fa8c16' }} />} iconBg="#fff7e6" title="驗收狀況">
          <Form.Item name="condition" label="資產驗收" rules={[{ required: true }]}>
            <Radio.Group optionType="button" buttonStyle="solid"
              options={Object.entries(CONDITION_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
          </Form.Item>
          <Alert className="claim-notice" showIcon
            type={condition === 'normal' ? 'success' : 'warning'}
            message={condition === 'normal' ? '正常收回：解除佔用，資產恢復可使用。'
              : condition === 'damaged' ? '損壞收回：資產進入待處置；自動建立待定責記錄，不默認員工有責。'
              : '遺失結案：保留歷史責任證據，不登記虛假入庫位置。'} />
          <Form.Item name="reason" label={condition === 'normal' ? '歸還說明' : '異常說明'} rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea maxLength={500} showCount rows={3} />
          </Form.Item>

        </ReturnCard>

        {condition !== 'lost' && (
          <ReturnCard icon={<AppstoreOutlined style={{ fontSize: 14, color: '#52c41a' }} />} iconBg="#f6ffed" title="接收管理">
            <Alert className="claim-notice" showIcon type="info"
              message={condition === 'normal'
                ? '指定接收部門與存放倉庫後，資產歸還時同步歸位；不填則保持原歸屬部門與原位置。'
                : '損壞資產仍需指定接收部門與存放位置，便於後續處置與跟蹤；不填則保持原歸屬。'} />
            <div className="return-grid">
              <Form.Item name="receiveDepartment" label="接收部門">
                <TreeSelect
                  treeData={deptTreeData}
                  placeholder="選擇接收部門（可選）"
                  treeDefaultExpandAll
                  showSearch
                  treeNodeFilterProp="title"
                  allowClear
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item name="receiveLocationId" label="存放倉庫">
                <Select
                  placeholder="選擇存放倉庫（可選）"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  options={locations.map(l => ({
                    value: l.id,
                    label: [l.name, l.province, l.city, l.district, l.address].filter(Boolean).join(' - '),
                  }))}
                />
              </Form.Item>
            </div>
          </ReturnCard>
        )}
      </Form>
    </Spin>

    <div className="form-footer">
      <Button onClick={onBack}>取消</Button>
      <Button type="primary" icon={<SaveOutlined />} loading={loading} disabled={!hasSource} onClick={handleSubmit}>
        確認歸還
      </Button>
    </div>
  </>
}
