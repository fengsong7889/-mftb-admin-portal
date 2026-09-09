/**
 * 資產維修詳情頁
 *
 * 登記資產維修記錄：故障描述 / 維修內容 / 維修方 / 維修費用
 * 維修中的資產狀態變為「維修中」；維修完成時狀態變回「在用」
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Form, Input, Select, Button, message, Row, Col, Card, Table, Modal, Tag, DatePicker, InputNumber,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  PlusOutlined, SaveOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  fetchAssetDetail, fetchRepairList, repairAsset, finishRepair, type AssetItem, type AssetRepairRecord,
} from '../../../api/asset'

const REPAIR_BY_OPTIONS = ['HP 授权维修点', 'Dell 售后', '联想服务中心', 'Apple Store', '自修', '其他第三方']

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

  return (
    <>
      <div style={{ background: '#fff', borderRadius: 8, padding: '16px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button type="primary" onClick={onBack}>{t('common.back')}</Button>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{t('asset.repairTitle')}</h2>
      </div>

      {asset && (
        <Card title={t('asset.sectionAssetInfo')} style={{ marginBottom: 16, borderRadius: 8 }} size="small">
          <Row gutter={16}>
            <Col span={6}><b>{t('asset.colAssetNo')}:</b> {asset.assetNo}</Col>
            <Col span={6}><b>{t('asset.colAssetName')}:</b> {asset.assetName}</Col>
            <Col span={6}><b>{t('asset.colAssetType')}:</b> {asset.assetType}</Col>
            <Col span={6}><b>{t('asset.colBrand')}:</b> {asset.brand || '-'}</Col>
            <Col span={12} style={{ marginTop: 8 }}><b>{t('asset.colDepartment')}:</b> {asset.department || '-'}</Col>
            <Col span={12} style={{ marginTop: 8 }}><b>{t('asset.colUserName')}:</b> {asset.userName || '-'}</Col>
          </Row>
        </Card>
      )}

      <div className="action-section">
        <div className="action-section-left" />
        <div className="action-section-right">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            {t('asset.btnNewRepair')}
          </Button>
        </div>
      </div>

      <Table<AssetRepairRecord>
        columns={columns}
        dataSource={records}
        rowKey="id"
        loading={loading}
        size="middle"
        pagination={false}
        scroll={{ x: 1200 }}
      />

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
                  {REPAIR_BY_OPTIONS.map((o) => <Select.Option key={o} value={o}>{o}</Select.Option>)}
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
