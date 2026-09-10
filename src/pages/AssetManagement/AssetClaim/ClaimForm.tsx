/**
 * 領用登記獨立表單頁（長期配給）
 *
 * 模塊化卡片佈局（參考新增資產界面）：
 *  1. 資產選擇 — 選擇閒置資產，展示所選資產信息
 *  2. 領用信息 — 領用人/部門/日期/原因/操作人
 *  3. 備注信息
 *
 * 業務閉環：選閒置資產 → 填領用人/部門/領用日期 → 提交
 *          （自動置資產為「在用」、holdType=owned，並寫入變更歷史流水）
 */
import { useState, useEffect } from 'react'
import {
  Button, Form, Input, Select, DatePicker, Row, Col, Spin,
  message, Alert,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, DatabaseOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import { fetchIdleAssets, createClaim } from '../../../api/eam'
import type { AssetItem } from '../../../api/asset'
import { EAM_DEPARTMENTS } from '../eamUtils'

const { TextArea } = Input

interface FormValues {
  assetId: number
  claimant: string
  department: string
  claimDate: Dayjs
  claimReason?: string
  operator: string
  remark?: string
}

interface Props {
  onBack: () => void
}

/* ==================== 卡片樣式常量 ==================== */
const CARD_STYLE: React.CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

export default function ClaimForm({ onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [assets, setAssets] = useState<AssetItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)

  /** 載入全部閒置資產（僅閒置可領用） */
  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchIdleAssets()
      .then((list) => { if (alive) setAssets(list) })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  const selected = assets.find((a) => a.id === selectedId)

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      setSubmitting(true)
      await createClaim({
        assetId: v.assetId,
        claimant: v.claimant.trim(),
        department: v.department,
        claimDate: v.claimDate.format('YYYY-MM-DD'),
        claimReason: v.claimReason,
        operator: v.operator.trim(),
        remark: v.remark,
      })
      message.success(t('asset.claimCreated'))
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ==================== 卡片標題通用渲染 ==================== */
  const renderCardTitle = (icon: React.ReactNode, iconBg: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1890ff' }}>{t('asset.claimTitle')}</h2>
        </div>
      </div>

      <Spin spinning={loading}>
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{ claimDate: dayjs(), operator: t('asset.currentOperator') }}
        >

          {/* ====== 模塊1：資產選擇 ====== */}
          <div style={CARD_STYLE}>
            {renderCardTitle(
              <DatabaseOutlined style={{ fontSize: 14, color: '#1890ff' }} />,
              '#e6f7ff',
              '資產選擇',
            )}

            {assets.length === 0 && !loading && (
              <Alert type="warning" showIcon style={{ marginBottom: 16 }} message={t('asset.noIdleAsset')} />
            )}

            <Row gutter={16}>
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
                    onChange={(v: number) => setSelectedId(v)}
                    options={assets.map((a) => ({
                      label: `${a.assetNo} / ${a.assetName}`, value: a.id,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>

            {/* 所選資產信息展示 */}
            {selected && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#595959', marginBottom: 12 }}>資產信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>{t('asset.colAssetNo')}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{selected.assetNo}</div>
                  </div>
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>{t('asset.colAssetName')}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{selected.assetName}</div>
                  </div>
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>{t('asset.colAssetType')}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{selected.assetType}</div>
                  </div>
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>{t('asset.colBrand')}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{selected.brand || '—'}</div>
                  </div>
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>{t('asset.colLocationName')}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>{selected.location || '—'}</div>
                  </div>
                  <div style={{ background: '#fafafa', borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>{t('asset.colPurchaseValue')}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: '#262626' }}>
                      {selected.purchaseValue ? `MOP ${selected.purchaseValue.toLocaleString()}` : '—'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ====== 模塊2：領用信息 ====== */}
          <div style={CARD_STYLE}>
            {renderCardTitle(
              <UserOutlined style={{ fontSize: 14, color: '#E8720C' }} />,
              '#fff7e6',
              '領用信息',
            )}

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colClaimant')} name="claimant"
                  rules={[{ required: true, message: t('asset.claimantRequired') }]}
                >
                  <Input placeholder={t('asset.userNamePh')} allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colDepartment')} name="department"
                  rules={[{ required: true, message: t('asset.departmentRequired') }]}
                >
                  <Select
                    placeholder={t('asset.departmentRequired')}
                    showSearch
                    options={EAM_DEPARTMENTS.map((d) => ({ label: d, value: d }))}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colClaimDate')} name="claimDate"
                  rules={[{ required: true, message: t('asset.claimDateRequired') }]}
                >
                  <DatePicker style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item label="领用原因" name="claimReason">
                  <Input placeholder="请输入领用原因" allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label={t('asset.colOperator')} name="operator"
                  rules={[{ required: true, message: t('asset.operatorRequired') }]}
                >
                  <Input placeholder={t('asset.operatorRequired')} allowClear />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* ====== 模塊3：備注信息 ====== */}
          <div style={CARD_STYLE}>
            {renderCardTitle(
              <span style={{ fontSize: 14, color: '#722ED1' }}></span>,
              '#f9f0ff',
              '備注信息',
            )}

            <Form.Item name="remark" style={{ marginBottom: 0 }}>
              <TextArea rows={4} maxLength={500} showCount placeholder="可填写备注信息" style={{ borderRadius: 8 }} />
            </Form.Item>
          </div>

        </Form>
      </Spin>

      {/* ====== 底部操作欄（取消+保存） ====== */}
      <div className="form-footer">
        <Button onClick={onBack}>{t('common.cancel')}</Button>
        <Button
          type="primary" icon={<SaveOutlined />} loading={submitting}
          disabled={assets.length === 0}
          onClick={handleSubmit}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
