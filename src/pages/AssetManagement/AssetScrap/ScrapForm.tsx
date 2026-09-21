/**
 * 新增報廢表單頁
 *
 * 兩種入口：
 * 1. 從列表點擊「新增報廢」→ create 模式，頁面頂部 Select 下拉選資產
 * 2. 從資產台賬跳轉 → form 模式，assetId 已確定，直接展示資產信息
 *
 * 流程先不做，提交後直接生效（status = approved）。
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Form, Input, Button, message, Row, Col, Tag, DatePicker, InputNumber, Select, Empty, Spin,
} from 'antd'
import { SaveOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { fetchAssetDetail, fetchAssetList, createScrapRecord, type AssetItem } from '../../../api/asset'
import AssetParameters from '../../../components/AssetParameters'

interface Props {
  /** 從資產台賬跳轉時傳入（form 模式） */
  assetId?: number
  onBack: () => void
  /** 提交成功後返回列表 */
  onCreated?: () => void
}

interface FormValues {
  scrapDate: Dayjs
  reason: string
  residualValue: number
  applyBy: string
  empId: string
  disposeType?: 'sale' | 'donate' | 'recycle' | 'destroy'
  appraisal?: string
}

const DISPOSE_OPTIONS = [
  { label: '出售', value: 'sale' },
  { label: '捐贈', value: 'donate' },
  { label: '回收', value: 'recycle' },
  { label: '銷毀', value: 'destroy' },
]

/** 模块卡片统一样式 */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 卡片标题 */
function SectionTitle({ icon, iconBg, title }: { icon: React.ReactNode; iconBg: string; title: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

export default function ScrapForm({ assetId: propAssetId, onBack, onCreated }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [assetLoading, setAssetLoading] = useState(false)

  /* ----- create 模式：Select 下拉选资产 ----- */
  const isCreateMode = !propAssetId
  const [assetSelectOptions, setAssetSelectOptions] = useState<AssetItem[]>([])
  const [assetSelectLoading, setAssetSelectLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

  /** 加载初始资产列表 */
  const loadInitialAssets = useCallback(async () => {
    if (assetSelectOptions.length > 0) return
    setAssetSelectLoading(true)
    try {
      const res = await fetchAssetList({ status: 'all', page: 1, size: 50 })
      setAssetSelectOptions(res.records.filter((a) => a.status !== 'scrapped'))
    } catch {
      setAssetSelectOptions([])
    } finally {
      setAssetSelectLoading(false)
    }
  }, [assetSelectOptions.length])

  /** 资产远程搜索（300ms 防抖） */
  const handleAssetSearch = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!keyword) { loadInitialAssets(); return }
    searchTimerRef.current = setTimeout(async () => {
      setAssetSelectLoading(true)
      try {
        const res = await fetchAssetList({ keyword, status: 'all', page: 1, size: 50 })
        setAssetSelectOptions(res.records.filter((a) => a.status !== 'scrapped'))
      } catch {
        setAssetSelectOptions([])
      } finally {
        setAssetSelectLoading(false)
      }
    }, 300)
  }, [loadInitialAssets])

  /** 下拉选择资产 */
  const handleAssetSelect = useCallback(async (selectedAssetId: number | undefined) => {
    if (!selectedAssetId) {
      setAsset(null)
      form.resetFields()
      return
    }
    setAssetLoading(true)
    try {
      const detail = await fetchAssetDetail(selectedAssetId)
      setAsset(detail)
      form.setFieldsValue({ residualValue: 0 })
      if (detail.status === 'scrapped') {
        message.warning('該資產已報廢')
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setAssetLoading(false)
    }
  }, [form, t])

  /** form 模式：从 propAssetId 加载资产 */
  useEffect(() => {
    if (!isCreateMode && propAssetId) {
      setAssetLoading(true)
      fetchAssetDetail(propAssetId).then((data) => {
        setAsset(data)
        form.setFieldsValue({ residualValue: 0 })
        if (data.status === 'scrapped') {
          message.warning('該資產已報廢')
        }
      }).catch((err: Error) => message.error(err.message))
        .finally(() => setAssetLoading(false))
    }
  }, [isCreateMode, propAssetId, form])

  const handleSubmit = async () => {
    if (!asset) return
    try {
      const v = await form.validateFields()
      if (asset.status === 'scrapped') {
        message.error(t('asset.alreadyScrapped'))
        return
      }
      setSubmitting(true)
      await createScrapRecord({
        assetId: asset.id,
        assetNo: asset.assetNo,
        assetName: asset.assetName,
        assetType: asset.assetType,
        brand: asset.brand,
        scrapDate: v.scrapDate.format('YYYY-MM-DD'),
        applyBy: v.applyBy,
        empId: v.empId,
        reason: v.reason,
        residualValue: v.residualValue || 0,
        disposeType: v.disposeType || null,
        appraisal: v.appraisal || '',
        remark: '',
      })
      message.success('報廢申請已提交')
      if (onCreated) onCreated()
      else onBack()
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* ====== 页面头部 ====== */}
      <DetailPageHeader
        title={t('asset.scrapCreateTitle', '新增報廢申請')}
        meta={asset ? <>{asset.assetNo} · {asset.assetName}</> : undefined}
        onBack={onBack}
        extra={
          <Tag color="error">
            <ExclamationCircleOutlined /> 報廢為終態操作，請確認後提交
          </Tag>
        }
      />

      <Spin spinning={assetLoading}>
        {/* ====== 模块 1：资产选择 + 资产信息 ====== */}
        <div style={detailCardStyle}>
          <SectionTitle
            icon={<ExclamationCircleOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
            iconBg="#e6f7ff"
            title={t('asset.sectionAssetInfo')}
          />

          {isCreateMode && (
            <Form.Item
              label={t('asset.colAssetNo')}
              required
              style={{ marginBottom: 20, maxWidth: 480 }}
            >
              <Select
                placeholder={t('asset.searchAssetPh', '請輸入資產編號/名稱搜索')}
                allowClear
                showSearch
                filterOption={false}
                onSearch={handleAssetSearch}
                onFocus={loadInitialAssets}
                onChange={handleAssetSelect}
                loading={assetSelectLoading}
                value={asset?.id}
                notFoundContent={assetSelectLoading ? t('common.searching', '搜索中...') : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noData')} />}
                options={assetSelectOptions.map((a) => ({
                  label: `${a.assetNo} / ${a.assetName}`,
                  value: a.id,
                }))}
              />
            </Form.Item>
          )}

          {asset && (
            <>
              <Row gutter={16}>
                <Col span={8}><b>{t('asset.colAssetNo')}:</b> <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span></Col>
                <Col span={8}><b>{t('asset.colAssetName')}:</b> {asset.assetName}</Col>
                <Col span={8}><b>{t('asset.colAssetType')}:</b> {asset.assetType}</Col>
                <Col span={8} style={{ marginTop: 8 }}><b>{t('asset.colBrand')}:</b> {asset.brand || '-'}</Col>
                <Col span={8} style={{ marginTop: 8 }}><b>{t('asset.colPurchaseDate')}:</b> {asset.purchaseDate || '-'}</Col>
                <Col span={8} style={{ marginTop: 8 }}><b>{t('asset.colPurchaseValue')}:</b> {asset.purchaseValue ? `MOP ${asset.purchaseValue.toLocaleString()}` : '-'}</Col>
                <Col span={8} style={{ marginTop: 8 }}><b>{t('asset.colDepartment')}:</b> {asset.department || '-'}</Col>
                <Col span={8} style={{ marginTop: 8 }}><b>{t('asset.colUserName')}:</b> {asset.userName || '-'}</Col>
              </Row>
              <AssetParameters asset={asset} />
            </>
          )}
        </div>

        {/* ====== 模块 2：报废表单 ====== */}
        {asset && (
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<SaveOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
              iconBg="#fff7e6"
              title="報廢信息"
            />
            <Form<FormValues> form={form} layout="vertical" initialValues={{ scrapDate: dayjs() }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label={t('asset.colScrapDate')} name="scrapDate" rules={[{ required: true, message: '請選擇報廢日期' }]}>
                    <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={t('asset.colApplyBy')} name="applyBy" rules={[{ required: true, message: '請輸入申請人' }]}>
                    <Input placeholder="申請人姓名" allowClear />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={t('asset.colUserEmpId')} name="empId" rules={[{ required: true, message: '請輸入工號' }]}>
                    <Input placeholder="申請人工號" allowClear />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label={t('asset.colResidualValue')} name="residualValue">
                    <InputNumber min={0} step={100} addonAfter="MOP" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label={t('asset.colDisposeType')} name="disposeType">
                    <Select placeholder={t('common.placeholderSelect')} allowClear
                      options={DISPOSE_OPTIONS.map((o) => ({ ...o }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item label={t('asset.colScrapReason')} name="reason" rules={[{ required: true, message: '請輸入報廢原因' }]}>
                    <Input.TextArea rows={2} placeholder="請詳細說明報廢原因" maxLength={300} showCount />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item label={t('asset.colAppraisal')} name="appraisal" style={{ marginBottom: 0 }}>
                    <Input.TextArea rows={2} placeholder="鑑定意見（可選）" maxLength={300} showCount />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </div>
        )}
      </Spin>

      {/* ====== 页面底部按钮 ====== */}
      <div className="form-footer">
        <Button onClick={onBack}>{t('common.cancel')}</Button>
        <Button danger type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={submitting} disabled={!asset}>
          確認提交
        </Button>
      </div>
    </>
  )
}
