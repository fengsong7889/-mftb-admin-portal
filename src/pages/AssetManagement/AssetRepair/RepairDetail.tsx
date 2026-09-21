/**
 * 資產維修詳情頁
 *
 * 樣式基準：採購訂單詳情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 無邊框模塊卡片 + Descriptions column=4 非 bordered + 最後更新 footer。
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Form, Input, Select, Button, message, Row, Col, Table, Modal, Tag, DatePicker, InputNumber, Spin, Descriptions, Space,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined, AppstoreOutlined, ToolOutlined, UserOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import AssetParameters from '../../../components/AssetParameters'
import BrandTag from '../../../components/BrandTag'
import RemoteSearchSelect from '../../../components/RemoteSearchSelect'
import type { OptionItem } from '../../../api/types'
import { fetchClaimDetail } from '../../../api/eamClaim'
import type { ClaimRow } from '../AssetClaim/claimViewTypes'
import {
  fetchAssetDetail, fetchRepairList, fetchRepairApplicantOptions, fetchRepairerOptions,
  repairAsset, finishRepair, updateRepair, deleteRepair,
  type AssetItem, type AssetRepairRecord, type RepairApplicantOption,
} from '../../../api/asset'

interface FormValues {
  repairDate: Dayjs
  faultDesc: string
  repairContent: string
  repairBy: string
  cost: number
  applicant: string
  causeType?: 'human' | 'natural' | 'third_party' | 'quality'
}

const CAUSE_OPTIONS = [
  { value: 'human', labelKey: 'causeHuman' },
  { value: 'natural', labelKey: 'causeNatural' },
  { value: 'third_party', labelKey: 'causeThirdParty' },
  { value: 'quality', labelKey: 'causeQuality' },
]

const formatApplicant = (employee: RepairApplicantOption) => employee.empNo
  ? `${employee.empName}（${employee.empNo}）`
  : employee.empName

async function fetchApplicantOptions(keyword: string): Promise<OptionItem[]> {
  const employees = await fetchRepairApplicantOptions(keyword)
  return employees.map(employee => {
    const label = formatApplicant(employee)
    // 现有维修接口以字符串保存申请人，同时保留姓名和工号快照。
    return { value: label, label }
  })
}

async function fetchRepairerOptionsForSelect(keyword: string): Promise<OptionItem[]> {
  const options = await fetchRepairerOptions(keyword)
  return options.map(o => ({ value: o.value, label: o.label }))
}

/** 新增和编辑共用字段布局，避免两种弹窗展示不一致。 */
function RepairRecordFields({ existingApplicant, existingRepairBy }: { existingApplicant?: string; existingRepairBy?: string }) {
  const { t } = useTranslation()
  const [initialOptions, setInitialOptions] = useState<OptionItem[]>([])
  const [repairerInitialOptions, setRepairerInitialOptions] = useState<OptionItem[]>([])

  useEffect(() => {
    let active = true
    setInitialOptions([])
    if (existingApplicant) {
      fetchRepairApplicantOptions(existingApplicant).then(employees => {
        if (!active) return
        // 旧记录仅有姓名时，只在唯一匹配时补充工号回显，不改写原值。
        const matches = employees.filter(employee => employee.empName === existingApplicant)
        if (matches.length === 1) {
          setInitialOptions([{ value: existingApplicant, label: formatApplicant(matches[0]) }])
        }
      }).catch(() => { /* 无法匹配的历史申请人保留原始文本 */ })
    }
    return () => { active = false }
  }, [existingApplicant])

  // 编辑时若维修方为历史记录值（不在当前供应商列表中），补充回显
  useEffect(() => {
    let active = true
    setRepairerInitialOptions([])
    if (existingRepairBy) {
      fetchRepairerOptions(existingRepairBy).then(options => {
        if (!active) return
        const matched = options.find(o => o.value === existingRepairBy)
        if (matched) {
          setRepairerInitialOptions([{ value: matched.value, label: matched.label }])
        } else {
          // 历史值不在供应商列表中（如旧的硬编码选项），直接显示原文
          setRepairerInitialOptions([{ value: existingRepairBy, label: existingRepairBy }])
        }
      }).catch(() => { /* 回显失败保留原文本 */ })
    }
    return () => { active = false }
  }, [existingRepairBy])

  return <>
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        <Form.Item label={t('asset.colRepairDate')} name="repairDate" rules={[{ required: true, message: t('asset.repairDateRequired') }]}>
          <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        </Form.Item>
      </Col>
      <Col xs={24} sm={12}>
        <Form.Item label={t('asset.colRepairBy')} name="repairBy" rules={[{ required: true, message: t('asset.repairByRequired') }]}>
          <RemoteSearchSelect
            placeholder={t('asset.repairerPh', '请搜索或选择维修方')}
            fetchOptions={fetchRepairerOptionsForSelect}
            initialOptions={repairerInitialOptions}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Col>
    </Row>
    <Row gutter={16}>
      <Col xs={24} sm={8}>
        <Form.Item label={t('asset.colCost')} name="cost">
          <InputNumber min={0} step={50} addonAfter="MOP" style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={24} sm={8}>
        <Form.Item label={t('asset.colApplicant')} name="applicant" rules={[{ required: true, message: t('asset.applicantRequired') }]}>
          <RemoteSearchSelect
            placeholder={t('asset.repairApplicantPh')}
            fetchOptions={fetchApplicantOptions}
            initialOptions={initialOptions}
            style={{ width: '100%' }}
          />
        </Form.Item>
      </Col>
      <Col xs={24} sm={8}>
        <Form.Item label={t('asset.colCauseType')} name="causeType">
          <Select placeholder={t('asset.causeTypePh', '請選擇原因分類')} allowClear>
            {CAUSE_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{t(`asset.${o.labelKey}`)}</Select.Option>)}
          </Select>
        </Form.Item>
      </Col>
    </Row>
    <Form.Item label={t('asset.colFaultDesc')} name="faultDesc" rules={[{ required: true, message: t('asset.faultDescRequired') }]}>
      <Input.TextArea rows={2} placeholder={t('asset.faultDescPh')} maxLength={300} showCount />
    </Form.Item>
    <Form.Item label={t('asset.colRepairContent')} name="repairContent" rules={[{ required: true, message: t('asset.repairContentRequired') }]}>
      <Input.TextArea rows={2} placeholder={t('asset.repairContentPh')} maxLength={300} showCount />
    </Form.Item>
  </>
}

interface Props {
  assetId: number
  onBack: () => void
}

/** 详情卡片统一样式（无边框，对齐采购订单详情） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

export default function RepairDetail({ assetId, onBack }: Props) {
  const { t } = useTranslation()

  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [claim, setClaim] = useState<ClaimRow | null>(null)
  const [records, setRecords] = useState<AssetRepairRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<AssetRepairRecord | null>(null)
  const [form] = Form.useForm<FormValues>()
  const [editForm] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [editSubmitting, setEditSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [a, recs] = await Promise.all([
        fetchAssetDetail(assetId),
        fetchRepairList({ assetId: assetId }),
      ])
      setAsset(a)
      setRecords(recs)
      // 加载当前领用信息（用于使用人模块）
      if (a.activeClaimId) {
        try {
          const c = await fetchClaimDetail(a.activeClaimId)
          setClaim(c)
        } catch { /* 领用信息可选，加载失败不影响主流程 */ }
      } else {
        setClaim(null)
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [assetId, t])

  useEffect(() => { loadData() }, [loadData])

  const handleNewRecord = () => {
    form.resetFields()
    form.setFieldsValue({ repairDate: dayjs(), cost: 0 })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!asset) return
    try {
      const v = await form.validateFields()
      setSubmitting(true)
      await repairAsset({
        assetId: asset.id,
        assetNo: asset.assetNo,
        assetName: asset.assetName,
        repairDate: v.repairDate.format('YYYY-MM-DD'),
        faultDesc: v.faultDesc,
        repairContent: v.repairContent,
        repairBy: v.repairBy,
        cost: v.cost,
        finishDate: null,
        status: 'repairing',
        applicant: v.applicant,
        causeType: v.causeType,
      })
      message.success(t('asset.repairCreated'))
      setModalOpen(false)
      form.resetFields()
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleFinishRepair = (record: AssetRepairRecord) => {
    Modal.confirm({
      title: t('asset.confirmFinishRepair'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await finishRepair(record.id, dayjs().format('YYYY-MM-DD'))
          message.success(t('asset.repairFinished'))
          loadData()
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : t('asset.repairFinishFailed'))
        }
      },
    })
  }

  const handleEditRecord = (record: AssetRepairRecord) => {
    setEditingRecord(record)
    editForm.setFieldsValue({
      repairDate: dayjs(record.repairDate),
      faultDesc: record.faultDesc,
      repairContent: record.repairContent,
      repairBy: record.repairBy,
      cost: record.cost,
      applicant: record.applicant,
      causeType: record.causeType,
    })
    setEditModalOpen(true)
  }

  const handleEditSubmit = async () => {
    if (!editingRecord) return
    try {
      const v = await editForm.validateFields()
      setEditSubmitting(true)
      await updateRepair(editingRecord.id, {
        repairDate: v.repairDate.format('YYYY-MM-DD'),
        faultDesc: v.faultDesc,
        repairContent: v.repairContent,
        repairBy: v.repairBy,
        cost: v.cost,
        applicant: v.applicant,
        causeType: v.causeType,
      })
      message.success(t('asset.repairUpdated', '維修記錄已更新'))
      setEditModalOpen(false)
      editForm.resetFields()
      loadData()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleDeleteRecord = (record: AssetRepairRecord) => {
    Modal.confirm({
      title: t('asset.confirmDeleteRepair', '確認刪除此維修記錄？'),
      content: `${record.repairDate} - ${record.faultDesc}`,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteRepair(record.id)
          message.success(t('asset.repairDeleted', '維修記錄已刪除'))
          loadData()
        } catch (e: unknown) {
          if (e instanceof Error) message.error(e.message)
        }
      },
    })
  }

  const columns: TableColumnsType<AssetRepairRecord> = [
    { title: t('asset.colRepairDate'), dataIndex: 'repairDate', key: 'repairDate', width: 120 },
    { title: t('asset.colFaultDesc'), dataIndex: 'faultDesc', key: 'faultDesc', width: 200, ellipsis: true },
    { title: t('asset.colRepairContent'), dataIndex: 'repairContent', key: 'repairContent', width: 200, ellipsis: true },
    { title: t('asset.colRepairBy'), dataIndex: 'repairBy', key: 'repairBy', width: 130 },
    {
      title: t('asset.colCost'), dataIndex: 'cost', key: 'cost', width: 110, align: 'right',
      render: (v: number) => v ? `MOP ${v.toLocaleString()}` : '-',
    },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (s: 'repairing' | 'done') => s === 'repairing'
        ? <Tag color="processing">{t('asset.statusRepairing')}</Tag>
        : <Tag color="success">{t('asset.statusRepaired')}</Tag>,
    },
    { title: t('asset.colFinishDate'), dataIndex: 'finishDate', key: 'finishDate', width: 120,
      render: (v: string | null) => v || '-',
    },
    { title: t('asset.colApplicant'), dataIndex: 'applicant', key: 'applicant', width: 100 },
    {
      title: t('asset.colCauseType'), dataIndex: 'causeType', key: 'causeType', width: 120,
      render: (v: string) => v ? <Tag>{t(`asset.cause${v.charAt(0).toUpperCase() + v.slice(1)}`)}</Tag> : '-',
    },
    {
      title: t('common.colAction'), key: 'action', width: 200, fixed: 'right',
      render: (_: unknown, record) => (
        <Space size={0} split={<span className="action-split">|</span>}>
          {record.status === 'repairing' && (
            <>
              <Button type="link" size="small" onClick={() => handleEditRecord(record)}>{t('common.edit')}</Button>
              <Button type="link" size="small" danger onClick={() => handleDeleteRecord(record)}>{t('common.delete')}</Button>
              <Button type="link" size="small" onClick={() => handleFinishRepair(record)}>{t('asset.btnFinishRepair')}</Button>
            </>
          )}
        </Space>
      ),
    },
  ]

  if (loading || !asset) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <>
      {/* ====== 详情页头部 ====== */}
      <DetailPageHeader
        title={t('asset.repairDetailTitle')}
        meta={<>{asset.assetNo} · {asset.assetName}</>}
        onBack={onBack}
      />

      {/* ====== 资产信息 ====== */}
      <div style={detailCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.sectionAssetInfo')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <Descriptions column={4} size="middle">
          <Descriptions.Item label="資產編號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span></Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetName')}>{asset.assetName}</Descriptions.Item>
          <Descriptions.Item label="所屬品牌">
            {asset.companyBrand ? <BrandTag value={asset.companyBrand} /> : '—'}
          </Descriptions.Item>
          <Descriptions.Item label={t('asset.colBrand')}>{asset.brand || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetType')}>{asset.assetType || '-'}</Descriptions.Item>
          <Descriptions.Item label="購買時價值">
            {asset.purchaseValue != null ? `MOP ${Number(asset.purchaseValue).toLocaleString()}` : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="管理部門">{asset.adminDepartment || asset.department || '-'}</Descriptions.Item>
        </Descriptions>
        <AssetParameters asset={asset} />
      </div>

      {/* ====== 使用人信息（有使用人时显示） ====== */}
      {asset && asset.status !== 'idle' && (
        <div style={detailCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <UserOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.sectionHolderInfo', { defaultValue: '使用人信息' })}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <Descriptions column={4} size="middle">
            <Descriptions.Item label="使用人">
              {claim?.empNo ? `${claim.empName}（${claim.empNo}）` : (asset.userName || '-')}
            </Descriptions.Item>
            <Descriptions.Item label="所在部門">{claim?.department || asset.department || '-'}</Descriptions.Item>
            <Descriptions.Item label="使用日期">{claim?.claimDate || asset.claimDate || '-'}</Descriptions.Item>
            <Descriptions.Item label="資產狀態">
              {asset.status === 'in_use'
                ? <Tag color="success">{t('asset.statusInUse', { defaultValue: '使用中' })}</Tag>
                : asset.status === 'in_repair'
                  ? <Tag color="processing">{t('asset.statusInRepair', { defaultValue: '維修中' })}</Tag>
                  : <Tag>{asset.status}</Tag>}
            </Descriptions.Item>
          </Descriptions>
        </div>
      )}

      {/* ====== 维修记录 ====== */}
      <div style={detailCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ToolOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.repairRecordsTitle', { defaultValue: '維修記錄' })}</span>
          <Tag color="orange" style={{ fontSize: 11 }}>{records.length}</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNewRecord}
            style={{ height: 32, borderRadius: 6, fontSize: 13, fontWeight: 500 }}>
            {t('asset.btnNewRepair')}
          </Button>
        </div>
        <Table<AssetRepairRecord>
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 1200 }}
        />
      </div>

      {/* ====== 最後更新（詳情頁規範 footer） ====== */}
      <div style={{
        background: '#fafafa', borderRadius: 8, padding: '12px 24px',
        border: '1px solid #f0f0f0',
        display: 'flex', justifyContent: 'flex-end', gap: 24,
      }}>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新人：<span style={{ color: '#595959' }}>{asset.applicant || '-'}</span></span>
        <span style={{ fontSize: 12, color: '#8C8C8C' }}>最後更新時間：<span style={{ color: '#595959' }}>{asset.updatedAt || '-'}</span></span>
      </div>

      {/* 维修登记弹窗 */}
      <Modal
        title={t('asset.modalNewRepair')}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={handleSubmit}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={submitting}
        width={640}
        destroyOnClose
      >
        <Form<FormValues> form={form} layout="vertical" disabled={submitting} initialValues={{ repairDate: dayjs(), cost: 0 }}>
          <RepairRecordFields />
        </Form>
      </Modal>

      {/* 编辑维修记录弹窗 */}
      <Modal
        title={t('asset.modalEditRepair', '編輯維修記錄')}
        open={editModalOpen}
        onCancel={() => { setEditModalOpen(false); editForm.resetFields() }}
        onOk={handleEditSubmit}
        okText={t('common.save')}
        cancelText={t('common.cancel')}
        confirmLoading={editSubmitting}
        width={640}
        destroyOnClose
      >
        <Form<FormValues> form={editForm} layout="vertical" disabled={editSubmitting}>
          <RepairRecordFields existingApplicant={editingRecord?.applicant} existingRepairBy={editingRecord?.repairBy} />
        </Form>
      </Modal>
    </>
  )
}
