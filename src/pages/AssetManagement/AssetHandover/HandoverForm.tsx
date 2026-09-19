/**
 * 交接登記獨立表單頁
 *
 * 業務閉環：輸入交出人姓名 → 查詢名下資產 → 勾選待交接資產
 *          → 填接收人/部門/交接日期/原因 → 提交
 *          （批量逐件變更使用人 + 寫交接流水 + 生成交接記錄）
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Button, Form, Input, Select, DatePicker, Table, Row, Col, Space, Spin,
  message, Alert, Tag, TreeSelect, Modal, Radio,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, SearchOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchUserAssets, createHandover, type HandoverSaveData } from '../../../api/eam'
import type { AssetItem } from '../../../api/asset'
import AssetParameters from '../../../components/AssetParameters'
import { useAssetParameterCatalog } from '../../../hooks/useAssetParameterCatalog'
import { fetchDepartments, type DepartmentItem } from '../../../api/department'
import { buildDeptTree } from '../AssetClaim/claimViewTypes'

type HandoverReason = 'resign' | 'transfer' | 'other'

interface FormValues {
  receiverType: 'employee' | 'department'
  toUser: string
  toDepartment: number
  handoverDate: Dayjs
  reason: HandoverReason
  operator: string
  remark?: string
}

interface Props {
  onBack: () => void
}

const REASON_OPTIONS: { value: HandoverReason; key: string }[] = [
  { value: 'resign', key: 'asset.reasonResign' },
  { value: 'transfer', key: 'asset.reasonTransfer' },
  { value: 'other', key: 'asset.reasonOther' },
]

export default function HandoverForm({ onBack }: Props) {
  const { t } = useTranslation()
  const paramCatalog = useAssetParameterCatalog()
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fromUser, setFromUser] = useState('')
  const [userAssets, setUserAssets] = useState<AssetItem[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [queried, setQueried] = useState(false)
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const deptTree = useMemo(() => buildDeptTree(departments), [departments])
  const receiverType = Form.useWatch('receiverType', form) || 'employee'

  useEffect(() => {
    let alive = true
    fetchDepartments().then(data => { if (alive) setDepartments(data) })
      .catch(() => { /* 部门加载失败不阻塞表单 */ })
    return () => { alive = false }
  }, [])

  /** 查詢交出人名下資產 */
  const handleQuery = useCallback(async () => {
    const name = fromUser.trim()
    if (!name) {
      message.error(t('asset.fromUserRequired'))
      return
    }
    setLoading(true)
    try {
      const list = await fetchUserAssets(name)
      setUserAssets(list)
      setSelectedIds([])
      setQueried(true)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setLoading(false)
    }
  }, [fromUser, t])

  const selectedAssets = userAssets.filter((a) => selectedIds.includes(a.id))
  const fromDepartment = selectedAssets.length > 0 ? selectedAssets[0].department : (userAssets.length > 0 ? userAssets[0].department : '')

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      if (!selectedIds.length) {
        message.error(t('asset.handoverAssetRequired'))
        return
      }
      if (v.toUser?.trim() && v.toUser.trim() === fromUser.trim()) {
        message.error(t('asset.toUserRequired'))
        return
      }
      const toDeptName = departments.find(d => d.id === v.toDepartment)?.name ?? String(v.toDepartment)
      const isDept = v.receiverType === 'department'
      Modal.confirm({
        title: '確認提交交接？',
        className: 'custom-confirm-modal',
        icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
        content: (
          <div className="confirm-info-card">
            <div className="confirm-info-row"><span>{t('asset.handoverFromUser')}：</span><b>{fromUser.trim()}</b></div>
            <div className="confirm-info-row"><span>{t('asset.handoverFromDept')}：</span><b>{fromDepartment || '-'}</b></div>
            <div className="confirm-info-row"><span>{t('asset.receiverType')}：</span><b>{isDept ? t('asset.receiverTypeDepartment') : t('asset.receiverTypeEmployee')}</b></div>
            {!isDept && <div className="confirm-info-row"><span>{t('asset.handoverToUser')}：</span><b>{v.toUser?.trim()}</b></div>}
            <div className="confirm-info-row"><span>{t('asset.handoverToDept')}：</span><b>{toDeptName}</b></div>
            <div className="confirm-info-row"><span>資產數量：</span><b>{selectedIds.length}</b></div>
          </div>
        ),
        okText: '確認提交',
        cancelText: '取消',
        onOk: async () => {
          setSubmitting(true)
          try {
            const payload: HandoverSaveData = {
              fromUserName: fromUser.trim(),
              fromDepartment,
              toUserName: isDept ? '' : v.toUser?.trim(),
              toDepartment: toDeptName,
              receiverType: v.receiverType || 'employee',
              handoverDate: v.handoverDate.format('YYYY-MM-DD'),
              assetIds: selectedIds,
              reason: v.reason,
              operatorName: v.operator.trim(),
              remark: v.remark,
            }
            const record = await createHandover(payload)
            message.success(t('asset.handoverSuccess', { count: record.assetCount }))
            onBack()
          } catch (e: unknown) {
            if (e instanceof Error && e.message) message.error(e.message)
          } finally {
            setSubmitting(false)
          }
        },
      })
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    }
  }

  const assetColumns: TableColumnsType<AssetItem> = [
    {
      title: t('asset.colAssetNo'), dataIndex: 'assetNo', key: 'assetNo', width: 140,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</span>,
    },
    { title: t('asset.colAssetName'), dataIndex: 'assetName', key: 'assetName', width: 200, ellipsis: true },
    { title: t('asset.paramInfoTitle'), key: 'params', width: 240, render: (_, asset) => <AssetParameters asset={asset} compact catalog={paramCatalog} /> },
    { title: t('asset.colAssetType'), dataIndex: 'assetType', key: 'assetType', width: 110 },
    { title: t('asset.colDepartment'), dataIndex: 'department', key: 'department', width: 110 },
    { title: t('asset.colLocationName'), dataIndex: 'location', key: 'location', width: 170, ellipsis: true },
    {
      title: t('asset.colStatus'), dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <Tag color={v === 'in_use' ? 'success' : 'default'}>{v}</Tag>,
    },
  ]

  return (
    <Spin spinning={submitting}>
      {/* ====== 頂部標題欄（橙色漸變頂條） ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('asset.handoverAddTitle')}</h2>
        </div>
      </div>

      {/* ====== 交出人查詢 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionFromUser')}</h3>
        <Space>
          <Input
            placeholder={t('asset.fromUserRequired')}
            value={fromUser}
            onChange={(e) => setFromUser(e.target.value)}
            style={{ width: 200 }}
            allowClear
          />
          <Button type="primary" icon={<SearchOutlined />} loading={loading} onClick={handleQuery}>
            {t('asset.btnQueryAssets')}
          </Button>
        </Space>

        {/* ====== 名下資產列表 ====== */}
        {queried && (
          <>
            {userAssets.length === 0 && !loading && (
              <Alert type="warning" showIcon style={{ marginTop: 16 }} message={t('asset.noUserAsset')} />
            )}
            {userAssets.length > 0 && (
              <Table<AssetItem>
                columns={assetColumns}
                dataSource={userAssets}
                rowKey="id"
                size="small"
                pagination={false}
                style={{ marginTop: 16 }}
                rowSelection={{
                  selectedRowKeys: selectedIds,
                  onChange: (keys) => setSelectedIds(keys as number[]),
                  columnWidth: 40,
                  fixed: true,
                }}
              />
            )}
          </>
        )}
      </div>

      {/* ====== 交接信息表單 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionBasic')}</h3>
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{
            receiverType: 'employee',
            handoverDate: dayjs(),
            reason: 'resign',
            operator: t('asset.currentOperator'),
          }}
        >
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                label={t('asset.receiverType')} name="receiverType"
                rules={[{ required: true }]}
              >
                <Radio.Group onChange={() => form.setFieldsValue({ toUser: '' })}>
                  <Radio.Button value="employee">{t('asset.receiverTypeEmployee')}</Radio.Button>
                  <Radio.Button value="department">{t('asset.receiverTypeDepartment')}</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            {receiverType === 'employee' && (
              <Col xs={24} sm={12} md={8}>
                <Form.Item
                  label={t('asset.handoverToUser')} name="toUser"
                  rules={[{ required: true, message: t('asset.toUserRequired') }]}
                >
                  <Input placeholder={t('asset.userNamePh')} allowClear />
                </Form.Item>
              </Col>
            )}
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                label={t('asset.handoverToDept')} name="toDepartment"
                rules={[{ required: true, message: t('asset.departmentRequired') }]}
              >
                <TreeSelect
                  treeData={deptTree}
                  treeDefaultExpandAll
                  treeNodeFilterProp="title"
                  showSearch
                  allowClear
                  placeholder={t('asset.departmentRequired')}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                label={t('asset.colHandoverDate')} name="handoverDate"
                rules={[{ required: true, message: t('asset.handoverDateRequired') }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                label={t('asset.colHandoverReason')} name="reason"
                rules={[{ required: true }]}
              >
                <Select
                  options={REASON_OPTIONS.map((o) => ({ label: t(o.key), value: o.value }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                label={t('asset.colOperator')} name="operator"
                rules={[{ required: true, message: t('asset.operatorRequired') }]}
              >
                <Input placeholder={t('asset.operatorRequired')} allowClear />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24}>
              <Form.Item label={t('asset.colRemark')} name="remark">
                <Input.TextArea rows={1} placeholder={t('asset.remarkPh')} maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        {receiverType === 'department' && (
          <Alert type="info" showIcon message={t('asset.receiverTypeHint')} style={{ marginTop: -8, marginBottom: 8 }} />
        )}

        {/* ====== 已選資產預覽 ====== */}
        {selectedIds.length > 0 && (
          <Alert
            type="info" showIcon
            message={t('asset.handoverPreview', { count: selectedIds.length })}
          />
        )}
      </div>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button
            type="primary" icon={<SaveOutlined />} loading={submitting}
            disabled={selectedIds.length === 0}
            onClick={handleSubmit}
          >
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
