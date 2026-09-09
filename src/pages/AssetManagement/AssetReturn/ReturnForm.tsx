/**
 * 歸還登記獨立表單頁
 *
 * 兩種入口：
 *  1) 由借用管理「歸還」跳轉（帶 borrowId）：借用單信息只讀，僅確認歸還狀況
 *  2) 由歸還管理「歸還登記」進入：選擇在用資產後登記歸還
 *
 * 狀況為「損壞/遺失」時，提交成功後引導跳轉登記損壞賠付單（定責閉環）
 */
import { useState, useEffect } from 'react'
import {
  Button, Form, Input, Select, DatePicker, Row, Col, Space, Spin,
  message, Alert, Descriptions, Modal,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import {
  fetchBorrowDetail, createReturn, returnBorrow,
  type BorrowRecord, type ReturnRecord,
} from '../../../api/eam'
import { fetchAssetList, type AssetItem } from '../../../api/asset'

type Condition = ReturnRecord['condition']

interface FormValues {
  assetId?: number
  returnUser: string
  returnDate: Dayjs
  condition: Condition
  operator: string
  remark?: string
}

interface Props {
  /** 由借用管理跳轉時帶入的借用單 ID */
  borrowId?: number
  onBack: () => void
  /** 狀況異常時跳轉賠付登記 */
  onGoCompensation: (record: ReturnRecord) => void
}

const CONDITION_OPTIONS: { value: Condition; key: string }[] = [
  { value: 'normal', key: 'asset.conditionNormal' },
  { value: 'damaged', key: 'asset.conditionDamaged' },
  { value: 'lost', key: 'asset.conditionLost' },
]

export default function ReturnForm({ borrowId, onBack, onGoCompensation }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [borrow, setBorrow] = useState<BorrowRecord | null>(null)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [condition, setCondition] = useState<Condition>('normal')

  const isBorrowReturn = !!borrowId

  /** 載入借用單 或 全部在用資產 */
  useEffect(() => {
    let alive = true
    setLoading(true)
    const task = borrowId
      ? fetchBorrowDetail(borrowId).then((b) => {
        if (!alive) return
        setBorrow(b)
        form.setFieldsValue({ returnUser: b.borrower })
      })
      : fetchAssetList({ page: 1, size: 9999, status: 'in_use' }).then((res) => {
        if (alive) setAssets(res.records || [])
      })
    task
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borrowId])

  const selected = assets.find((a) => a.id === selectedId)

  /** 選資產後自動帶出當前使用人作為歸還人 */
  const handleAssetChange = (id: number) => {
    setSelectedId(id)
    const asset = assets.find((a) => a.id === id)
    if (asset) form.setFieldsValue({ returnUser: asset.userName })
  }

  /** 提交成功後：狀況異常則引導登記賠付單 */
  const afterSubmit = (record: ReturnRecord) => {
    if (record.condition === 'normal') {
      message.success(t('asset.returnSuccess'))
      onBack()
      return
    }
    Modal.confirm({
      title: t('asset.goCompensation'),
      content: t('asset.damageReturnTip'),
      okText: t('asset.goCompensation'),
      cancelText: t('common.cancel'),
      onOk: () => onGoCompensation(record),
      onCancel: () => onBack(),
    })
  }

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      if (!isBorrowReturn && !v.assetId) {
        message.error(t('asset.assetRequired'))
        return
      }
      setSubmitting(true)
      const payload = {
        returnDate: v.returnDate.format('YYYY-MM-DD'),
        condition: v.condition,
        operator: v.operator.trim(),
        remark: v.remark,
      }
      const record = isBorrowReturn
        ? await returnBorrow(borrowId as number, payload)
        : await createReturn({
          assetId: v.assetId as number,
          returnUser: v.returnUser.trim(),
          ...payload,
        })
      afterSubmit(record)
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Spin spinning={loading}>
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('asset.returnAddTitle')}</h2>
        </div>
      </div>

      {/* ====== 借用歸還：原借用單信息（只讀） ====== */}
      {borrow && (
        <div style={{
          background: '#fff', borderRadius: 8, padding: '20px 24px', marginBottom: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>{t('asset.borrowDetailTitle')}</h3>
          <Descriptions column={3} size="middle" bordered>
            <Descriptions.Item label={t('asset.colBorrowNo')}>{borrow.borrowNo}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetNo')}>{borrow.assetNo}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colAssetName')}>{borrow.assetName}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colBorrower')}>{borrow.borrower}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colDepartment')}>{borrow.department}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colBorrowDate')}>{borrow.borrowDate}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colDueDate')}>
              <span style={{ color: borrow.status === 'overdue' ? '#FF4D4F' : undefined, fontWeight: 600 }}>
                {borrow.dueDate}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label={t('asset.colRenewCount')}>{borrow.renewCount}</Descriptions.Item>
            <Descriptions.Item label={t('asset.colPurpose')}>{borrow.purpose}</Descriptions.Item>
          </Descriptions>
          {borrow.status === 'overdue' && (
            <Alert
              type="error" showIcon style={{ marginTop: 16 }}
              message={t('asset.overdueTip', { days: dayjs().diff(dayjs(borrow.dueDate), 'day') })}
            />
          )}
        </div>
      )}

      {/* ====== 歸還表單 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24, marginBottom: 16,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        {!isBorrowReturn && assets.length === 0 && !loading && (
          <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t('asset.notInUseCannotReturn')} />
        )}

        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{
            returnDate: dayjs(),
            condition: 'normal',
            operator: t('asset.currentOperator'),
          }}
          onValuesChange={(changed) => { if (changed.condition) setCondition(changed.condition) }}
        >
          <Row gutter={16}>
            {!isBorrowReturn && (
              <Col span={12}>
                <Form.Item
                  label={t('asset.colAssetNo')} name="assetId"
                  rules={[{ required: true, message: t('asset.assetRequired') }]}
                >
                  <Select
                    placeholder={t('asset.searchAssetPh')}
                    showSearch
                    optionFilterProp="label"
                    disabled={assets.length === 0}
                    onChange={handleAssetChange}
                    options={assets.map((a) => ({
                      label: `${a.assetNo} / ${a.assetName}（${a.userName || '-'}）`, value: a.id,
                    }))}
                  />
                </Form.Item>
              </Col>
            )}
            <Col span={6}>
              <Form.Item
                label={t('asset.colReturnUser')} name="returnUser"
                rules={[{ required: true, message: t('asset.userNameRequired') }]}
              >
                <Input placeholder={t('asset.userNamePh')} allowClear disabled={isBorrowReturn} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colReturnDate')} name="returnDate"
                rules={[{ required: true, message: t('asset.returnDateRequired') }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colCondition')} name="condition"
                rules={[{ required: true, message: t('asset.conditionRequired') }]}
              >
                <Select
                  options={CONDITION_OPTIONS.map((o) => ({ label: t(o.key), value: o.value }))}
                />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item
                label={t('asset.colOperator')} name="operator"
                rules={[{ required: true, message: t('asset.operatorRequired') }]}
              >
                <Input placeholder={t('asset.operatorRequired')} allowClear />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item label={t('asset.colRemark')} name="remark">
                <Input.TextArea rows={1} placeholder={t('asset.returnRemarkPh')} maxLength={200} />
              </Form.Item>
            </Col>
          </Row>
        </Form>

        {/* ====== 狀況異常提示 ====== */}
        {condition !== 'normal' && (
          <Alert type="warning" showIcon message={t('asset.damageReturnTip')} />
        )}

        {/* ====== 所選資產信息 ====== */}
        {selected && (
          <>
            <h3 style={{ margin: '16px 0 12px', fontSize: 16, fontWeight: 600 }}>{t('asset.sectionAssetInfo')}</h3>
            <Descriptions column={3} size="middle" bordered>
              <Descriptions.Item label={t('asset.colAssetNo')}>{selected.assetNo}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colAssetName')}>{selected.assetName}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colAssetType')}>{selected.assetType}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colUserName')}>{selected.userName || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colDepartment')}>{selected.department || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colHoldType')}>
                {selected.holdType === 'borrowed' ? t('asset.holdBorrowed') : t('asset.holdOwned')}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </div>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button
            type="primary" icon={<SaveOutlined />} loading={submitting}
            disabled={!isBorrowReturn && assets.length === 0}
            onClick={handleSubmit}
          >
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
