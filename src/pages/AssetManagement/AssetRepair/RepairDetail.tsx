/**
 * 資產維修詳情頁
 *
 * 樣式基準：採購訂單詳情（PurchaseOrder/OrderDetail.tsx）——
 * DetailPageHeader + 無邊框模塊卡片 + Descriptions column=4 非 bordered + 最後更新 footer。
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Form, Input, Select, Button, message, Row, Col, Table, Modal, Tag, DatePicker, InputNumber, Spin, Descriptions,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined, SaveOutlined, CheckCircleOutlined, AppstoreOutlined, ToolOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import AssetParameters from '../../../components/AssetParameters'
import {
  fetchAssetDetail, fetchRepairList, repairAsset, finishRepair, type AssetItem, type AssetRepairRecord,
} from '../../../api/asset'

const REPAIR_BY_OPTIONS = [
  { value: 'HP 授权维修点', labelKey: 'repairByHp' },
  { value: 'Dell 售后', labelKey: 'repairByDell' },
  { value: '联想服务中心', labelKey: 'repairByLenovo' },
  { value: 'Apple Store', labelKey: 'repairByApple' },
  { value: '自修', labelKey: 'repairBySelf' },
  { value: '其他第三方', labelKey: 'repairByOther' },
]

interface FormValues {
  repairDate: Dayjs
  faultDesc: string
  repairContent: string
  repairBy: string
  cost: number
  applicant: string
  causeType?: 'human' | 'natural' | 'third_party' | 'quality'
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
  const [records, setRecords] = useState<AssetRepairRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [a, recs] = await Promise.all([
        fetchAssetDetail(assetId),
        fetchRepairList({ assetId: assetId }),
      ])
      setAsset(a)
      setRecords(recs)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [assetId, t])

  useEffect(() => { loadData() }, [loadData])

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
      title: t('common.colAction'), key: 'action', width: 100, fixed: 'right',
      render: (_: unknown, record) => record.status === 'repairing' ? (
        <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleFinishRepair(record)}>
          {t('asset.btnFinishRepair')}
        </Button>
      ) : null,
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
        title={t('asset.repairTitle')}
        meta={<>{asset.assetNo} · {asset.assetName}</>}
        onBack={onBack}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}>
            {t('asset.btnNewRepair')}
          </Button>
        }
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
          <Descriptions.Item label={t('asset.colAssetNo')}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span></Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetName')}>{asset.assetName}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colAssetType')}>{asset.assetType}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colBrand')}>{asset.brand || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colDepartment')}>{asset.department || '-'}</Descriptions.Item>
          <Descriptions.Item label={t('asset.colUserName')}>{asset.userName || '-'}</Descriptions.Item>
        </Descriptions>
        <AssetParameters asset={asset} />
      </div>

      {/* ====== 维修记录 ====== */}
      <div style={detailCardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ToolOutlined style={{ fontSize: 14, color: '#fa8c16' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.repairRecordsTitle', { defaultValue: '維修記錄' })}</span>
          <Tag color="orange" style={{ fontSize: 11 }}>{records.length}</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
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
        footer={null}
        width={640}
        destroyOnClose
      >
        <Form<FormValues> form={form} layout="vertical" initialValues={{ repairDate: dayjs(), cost: 0 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('asset.colRepairDate')} name="repairDate" rules={[{ required: true, message: t('asset.repairDateRequired') }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('asset.colRepairBy')} name="repairBy" rules={[{ required: true, message: t('asset.repairByRequired') }]}>
                <Select placeholder={t('asset.repairByPh')}>
                  {REPAIR_BY_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{t(`asset.${o.labelKey}`)}</Select.Option>)}
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
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('asset.colCost')} name="cost">
                <InputNumber min={0} step={50} addonAfter="MOP" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('asset.colApplicant')} name="applicant" rules={[{ required: true, message: t('asset.applicantRequired') }]}>
                <Input placeholder={t('asset.userNamePh')} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <div style={{ textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 8 }}>
            <Button onClick={() => setModalOpen(false)} style={{ marginRight: 8 }}>{t('common.cancel')}</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={submitting}>{t('common.save')}</Button>
          </div>
        </Form>
      </Modal>
    </>
  )
}
