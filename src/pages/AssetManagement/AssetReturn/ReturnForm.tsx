/**
 * 归还登记表单 — 接通真实后端 API
 *
 * 支持从领用(claimId)、借用(borrowId)或资产(assetId)入口进入。
 * 正常归还支持「归还即承接」：指定接收管理部门与归还位置，后端释放占用时同步归位。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import AssetParameters from '../../../components/AssetParameters'
import type { AssetParameterSource } from '../../../utils/assetParams'
import { fetchAssetDetail } from '../../../api/asset'
import { fetchClaimDetail } from '../../../api/eamClaim'
import { fetchBorrowDetail } from '../../../api/eamBorrow'
import { useTransferData } from '../AssetTransfer/useTransferData'
import { TransferError } from '../AssetTransfer/TransferLayout'
import { Alert, Button, DatePicker, Descriptions, Form, Input, Radio, Select, Spin, TreeSelect } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useAuth } from '../../../contexts/AuthContext'
import { ReturnHeader, ReturnSection } from './ReturnLayout'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { fetchLocationList, type AssetLocation } from '../../../api/eam'
import type { ReturnRegisterDTO } from '../../../api/eamReturn'

const CONDITION_LABEL: Record<string, string> = { normal: '正常', damaged: '損壞', lost: '遺失' }

const DEPT_STATUS_ENABLED = 1

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
  conditionNote?: string
  actualReturneeName?: string
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

  useEffect(() => {
    fetchDepartments().then(setDepartments).catch(() => { /* 接口异常时置空 */ })
    fetchLocationList().then(setLocations).catch(() => { /* 接口异常时置空 */ })
  }, [])

  const deptTreeData = useMemo(() => buildDeptTreeData(departments), [departments])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      const dto: ReturnRegisterDTO = {
        claimId,
        borrowId,
        returnDate: values.date.format('YYYY-MM-DD'),
        assetCondition: values.condition,
        returnReason: values.reason,
        conditionNote: values.conditionNote,
        actualReturneeName: values.actualReturneeName || user?.name,
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

  const sourceLabel = claimId ? `領用單 #${claimId}` : borrowId ? `借用單 #${borrowId}` : assetId ? `資產 #${assetId}` : '直接登記'

  return <>
    <ReturnHeader title="歸還登記" onBack={onBack} />
    <Spin spinning={loading}>
      <Form<Values> form={form} layout="vertical" disabled={loading} initialValues={{ date: dayjs(), condition: 'normal' }}>
        <ReturnSection title="来源信息">
          <Descriptions column={3} items={[
            { key: 'source', label: '歸還來源', children: sourceLabel },
            { key: 'operator', label: '驗收操作人', children: operatorName || user?.name || '—' },
          ]} />
          <TransferError error={sourceState.error} retry={sourceState.refresh} />
          <Spin spinning={sourceState.loading}>
            {sourceState.data && <>
              <Descriptions column={2} items={[
                { key: 'assetNo', label: '資產編號', children: sourceState.data.assetNo },
                { key: 'assetName', label: '資產名稱', children: sourceState.data.assetName },
              ]} />
              <AssetParameters asset={sourceState.data} current />
            </>}
          </Spin>
          {!hasSource && <Alert className="claim-notice" showIcon type="info" message="未指定來源，請在列表中選擇領用/借用記錄進入歸還，或從資產台賬發起。" />}
        </ReturnSection>

        <ReturnSection title="歸還信息">
          <div className="return-grid">
            <Form.Item name="date" label="業務歸還日期" rules={[{ required: true }]}>
              <DatePicker disabledDate={d => d.isAfter(dayjs(), 'day')} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="actualReturneeName" label="實際歸還人（如代辦）">
              <Input allowClear placeholder="默認當前操作人" />
            </Form.Item>
          </div>
        </ReturnSection>

        <ReturnSection title="驗收狀況">
          <Form.Item name="condition" label="資產狀況" rules={[{ required: true }]}>
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
          {condition !== 'normal' && (
            <Form.Item name="conditionNote" label="狀況備註">
              <Input.TextArea maxLength={500} rows={2} placeholder="補充損壞/遺失的具體情況" />
            </Form.Item>
          )}
        </ReturnSection>

        {condition === 'normal' && (
          <ReturnSection title="接收管理">
            <Alert className="claim-notice" showIcon type="info"
              message="指定接收部門與歸還位置後，資產歸還時同步歸位；不填則保持原歸屬部門與原位置。" />
            <div className="return-grid">
              <Form.Item name="receiveDepartment" label="接收管理部門">
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
              <Form.Item name="receiveLocationId" label="歸還位置">
                <Select
                  placeholder="選擇歸還位置（可選）"
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
          </ReturnSection>
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
