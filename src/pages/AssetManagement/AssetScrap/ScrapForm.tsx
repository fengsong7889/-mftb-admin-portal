/**
 * 新增報廢資產表單頁
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
  Descriptions,
} from 'antd'
import { SaveOutlined, ExclamationCircleOutlined, InboxOutlined, UserOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import { fetchAssetDetail, fetchAssetList, createScrapRecord, fetchRepairApplicantOptions, type AssetItem, type AssetStatus, type RepairApplicantOption } from '../../../api/asset'
import AssetParameters from '../../../components/AssetParameters'
import type { OptionItem } from '../../../api/types'

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
  disposeType?: 'sale' | 'donate' | 'recycle' | 'destroy'
  appraisal?: string
}

const DISPOSE_OPTIONS = [
  { label: '出售', value: 'sale' },
  { label: '捐贈', value: 'donate' },
  { label: '回收', value: 'recycle' },
  { label: '銷毀', value: 'destroy' },
]

/** 資產狀態 → 標籤顏色 */
const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
  idle: 'default', in_use: 'success', in_repair: 'processing', scrapped: 'error',
  lost: 'warning', pending_inspection: 'blue', pending_disposal: 'orange', written_off: 'default',
}

/** 格式化員工顯示：姓名（工號） */
const formatEmployee = (emp: RepairApplicantOption) => emp.empNo
  ? `${emp.empName}（${emp.empNo}）`
  : emp.empName

/** 模块卡片统一样式 */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 卡片标题 */
function SectionTitle({ icon, iconBg, title, tag }: { icon: React.ReactNode; iconBg: string; title: string; tag?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag}
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

  /* ----- 经办人下拉搜索 ----- */
  const [handlerOptions, setHandlerOptions] = useState<OptionItem[]>([])
  const [handlerLoading, setHandlerLoading] = useState(false)
  const handlerTimerRef = useRef<ReturnType<typeof setTimeout>>()

  /** 加载初始经办人列表 */
  const loadInitialHandlers = useCallback(async () => {
    if (handlerOptions.length > 0) return
    setHandlerLoading(true)
    try {
      const employees = await fetchRepairApplicantOptions('')
      setHandlerOptions(employees.map(e => ({ value: formatEmployee(e), label: formatEmployee(e) })))
    } catch {
      setHandlerOptions([])
    } finally {
      setHandlerLoading(false)
    }
  }, [handlerOptions.length])

  /** 经办人远程搜索（300ms 防抖） */
  const handleHandlerSearch = useCallback((keyword: string) => {
    if (handlerTimerRef.current) clearTimeout(handlerTimerRef.current)
    if (!keyword) { loadInitialHandlers(); return }
    handlerTimerRef.current = setTimeout(async () => {
      setHandlerLoading(true)
      try {
        const employees = await fetchRepairApplicantOptions(keyword)
        setHandlerOptions(employees.map(e => ({ value: formatEmployee(e), label: formatEmployee(e) })))
      } catch {
        setHandlerOptions([])
      } finally {
        setHandlerLoading(false)
      }
    }, 300)
  }, [loadInitialHandlers])

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
      // 从 applyBy 值中提取工号（格式：姓名（工号））
      const empIdMatch = v.applyBy?.match(/（([^）]+)）$/)
      const empId = empIdMatch ? empIdMatch[1] : ''
      await createScrapRecord({
        assetId: asset.id,
        assetNo: asset.assetNo,
        assetName: asset.assetName,
        assetType: asset.assetType,
        brand: asset.brand,
        scrapDate: v.scrapDate.format('YYYY-MM-DD'),
        applyBy: v.applyBy,
        empId,
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
        title="新增報廢資產"
        meta={asset ? <>{asset.assetNo} · {asset.assetName}</> : undefined}
        onBack={onBack}
        extra={
          <Tag color="error">
            <ExclamationCircleOutlined /> 報廢為終態操作，請確認後提交
          </Tag>
        }
      />

      <Spin spinning={assetLoading}>
        {/* ====== 模塊 1：資產選擇 + 資產信息 ====== */}
        <div style={detailCardStyle}>
          <SectionTitle
            icon={<InboxOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
            iconBg="#e6f7ff"
            title="資產信息"
            tag={asset ? <Tag color={ASSET_STATUS_COLOR[asset.status]}>{
              asset.status === 'idle' ? '閒置' : asset.status === 'in_use' ? '使用中' : asset.status === 'in_repair' ? '維修中' : asset.status === 'scrapped' ? '已報廢' : asset.status === 'lost' ? '遺失' : asset.status === 'pending_inspection' ? '待驗收' : '已核銷'
            }</Tag> : undefined}
          />

          {isCreateMode && (
            <Form.Item
              label="資產編號"
              required
              style={{ marginBottom: 20, maxWidth: 480 }}
            >
              <Select
                placeholder="請輸入資產編號/名稱搜索"
                allowClear
                showSearch
                filterOption={false}
                onSearch={handleAssetSearch}
                onFocus={loadInitialAssets}
                onChange={handleAssetSelect}
                loading={assetSelectLoading}
                value={asset?.id}
                notFoundContent={assetSelectLoading ? '搜索中...' : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="無數據" />}
                options={assetSelectOptions.map((a) => ({
                  label: `${a.assetNo} / ${a.assetName}`,
                  value: a.id,
                }))}
              />
            </Form.Item>
          )}

          {asset && (
            <>
              <Descriptions column={4} size="middle">
                <Descriptions.Item label="資產編號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span></Descriptions.Item>
                <Descriptions.Item label="資產名稱">{asset.assetName}</Descriptions.Item>
                <Descriptions.Item label="所屬品牌">{asset.companyBrand ? <BrandTag value={asset.companyBrand} /> : '-'}</Descriptions.Item>
                <Descriptions.Item label="資產品牌">{asset.brand || '-'}</Descriptions.Item>
                <Descriptions.Item label="資產分類">{asset.assetType || '-'}</Descriptions.Item>
                <Descriptions.Item label="購買時價值">
                  {asset.purchaseValue != null ? `MOP ${Number(asset.purchaseValue).toLocaleString()}` : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="管理部門">{asset.adminDepartment || '-'}</Descriptions.Item>
              </Descriptions>
              <AssetParameters asset={asset} current />
            </>
          )}
        </div>

        {/* ====== 模塊 2：當前使用人（僅資產有人使用時展示） ====== */}
        {asset && asset.status === 'in_use' && (
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<UserOutlined style={{ fontSize: 14, color: '#13C2C2' }} />}
              iconBg="#e6fffb"
              title="當前使用人"
            />
            <Descriptions column={4} size="middle">
              <Descriptions.Item label="使用人">{asset.userName || '-'}</Descriptions.Item>
              <Descriptions.Item label="部門">{asset.department || '-'}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colHoldType')}>
                {asset.holdType === 'borrowed'
                  ? <Tag color="orange">{t('asset.holdBorrowed')}</Tag>
                  : <Tag color="blue">{t('asset.holdOwned')}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="領用日期">{asset.claimDate || '-'}</Descriptions.Item>
            </Descriptions>
          </div>
        )}

        {/* ====== 模塊 3：報廢信息（選擇資產後才顯示） ====== */}
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
                  <Form.Item label="報廢日期" name="scrapDate" rules={[{ required: true, message: '請選擇報廢日期' }]}>
                    <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="經辦人" name="applyBy" rules={[{ required: true, message: '請選擇經辦人' }]}>
                    <Select
                      placeholder="請輸入姓名或工號搜索"
                      allowClear
                      showSearch
                      filterOption={false}
                      onSearch={handleHandlerSearch}
                      onFocus={loadInitialHandlers}
                      loading={handlerLoading}
                      notFoundContent={handlerLoading ? '搜索中...' : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="無數據" />}
                      options={handlerOptions}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item label="殘值" name="residualValue">
                    <InputNumber min={0} step={100} addonAfter="MOP" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item label="處置方式" name="disposeType">
                    <Select placeholder="請選擇" allowClear
                      options={DISPOSE_OPTIONS.map((o) => ({ ...o }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item label="報廢原因" name="reason" rules={[{ required: true, message: '請輸入報廢原因' }]}>
                    <Input.TextArea rows={2} placeholder="請詳細說明報廢原因" maxLength={300} showCount />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={24}>
                  <Form.Item label="鑑定意見" name="appraisal" style={{ marginBottom: 0 }}>
                    <Input.TextArea rows={2} placeholder="鑑定意見（可選）" maxLength={300} showCount />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </div>
        )}
      </Spin>

      {/* ====== 頁面底部按鈕 ====== */}
      <div className="form-footer">
        <Button onClick={onBack}>取消</Button>
        <Button danger type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={submitting} disabled={!asset}>
          確認提交
        </Button>
      </div>
    </>
  )
}
