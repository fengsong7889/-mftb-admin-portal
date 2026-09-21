/**
 * 賠付登記表單頁（直接新增）
 *
 * 業務場景：
 * - 員工離職時資產損壞，資產已不在公司
 * - 第三方損壞資產（如快遞損壞）
 * - 歷史遺留問題補錄賠付
 * - 遺失核銷後需要員工賠付
 *
 * URL 參數：
 *  - assetId   資產 ID（可選，從其他頁面跳轉時帶入）
 *  - damageType 損失類型 damage|loss（可選）
 *
 * 樣式基準：EAM 表單頁統一規範（DetailPageHeader + 模塊卡片 + .form-footer）
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Button, DatePicker, Descriptions, Empty, Form, Input, Select, Spin, message,
} from 'antd'
import {
  SaveOutlined, ArrowLeftOutlined, AppstoreOutlined,
} from '@ant-design/icons'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import AssetParameters from '../../../components/AssetParameters'
import {
  createCompensation, type CompensationSaveDTO,
} from '../../../api/eamCompensation'
import {
  fetchAssetDetail, fetchAssetList,
  type AssetItem,
} from '../../../api/asset'

const CAUSE_OPTIONS = [
  { label: '人為', value: 'human' },
  { label: '自然', value: 'natural' },
  { label: '第三方', value: 'third_party' },
  { label: '質量', value: 'quality' },
]

const DAMAGE_OPTIONS = [
  { label: '損壞', value: 'damage' },
  { label: '遺失', value: 'loss' },
]

const PARTY_OPTIONS = [
  { label: '員工', value: 'employee' },
  { label: '部門', value: 'department' },
  { label: '公司', value: 'company' },
  { label: '未定', value: 'none' },
]

interface FormValues {
  damageType: 'damage' | 'loss'
  cause?: 'human' | 'natural' | 'third_party' | 'quality'
  party?: 'employee' | 'department' | 'company' | 'none'
  responsibleName?: string
  department?: string
  reason?: string
}

/** 模塊卡片統一樣式 */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 模塊標題行 */
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

interface Props {
  onBack: () => void
  onCreated?: (compId: number) => void
}

export default function CompensationForm({ onBack, onCreated }: Props) {
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm<FormValues>()

  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [assetLoading, setAssetLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /* ----- 資產下拉搜索 ----- */
  const [assetSelectOptions, setAssetSelectOptions] = useState<AssetItem[]>([])
  const [assetSelectLoading, setAssetSelectLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

  const initialAssetId = searchParams.get('assetId') ? Number(searchParams.get('assetId')) : undefined
  const initialDamageType = (searchParams.get('damageType') as 'damage' | 'loss') || undefined

  /** 選擇資產後帶出台賬數據 */
  const loadAsset = useCallback(async (assetId: number) => {
    setAssetLoading(true)
    try {
      const detail = await fetchAssetDetail(assetId)
      setAsset(detail)
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '查詢資產失敗')
    } finally {
      setAssetLoading(false)
    }
  }, [])

  /** 加載初始資產列表 */
  const loadInitialAssets = useCallback(async () => {
    if (assetSelectOptions.length > 0) return
    setAssetSelectLoading(true)
    try {
      const res = await fetchAssetList({ status: 'all', page: 1, size: 50 })
      setAssetSelectOptions(res.records)
    } catch {
      setAssetSelectOptions([])
    } finally {
      setAssetSelectLoading(false)
    }
  }, [assetSelectOptions.length])

  /** 資產遠程搜索（300ms 防抖） */
  const handleAssetSearch = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!keyword) { loadInitialAssets(); return }
    searchTimerRef.current = setTimeout(async () => {
      setAssetSelectLoading(true)
      try {
        const res = await fetchAssetList({ keyword, status: 'all', page: 1, size: 50 })
        setAssetSelectOptions(res.records)
      } catch {
        setAssetSelectOptions([])
      } finally {
        setAssetSelectLoading(false)
      }
    }, 300)
  }, [loadInitialAssets])

  /** 下拉選擇資產 */
  const handleAssetSelect = useCallback((assetId: number | undefined) => {
    if (assetId) {
      loadAsset(assetId)
    } else {
      setAsset(null)
    }
  }, [loadAsset])

  /* ----- 初始化 ----- */
  useEffect(() => {
    if (initialAssetId) {
      loadAsset(initialAssetId)
    } else {
      loadInitialAssets()
    }
    if (initialDamageType) {
      form.setFieldsValue({ damageType: initialDamageType })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!asset) { message.warning('請先選擇資產'); return }
    try {
      const v = await form.validateFields()
      setSubmitting(true)
      const dto: CompensationSaveDTO = {
        assetId: asset.id,
        damageType: v.damageType,
        cause: v.cause,
        party: v.party,
        responsibleName: v.responsibleName,
        department: v.department,
        reason: v.reason,
      }
      const compId = await createCompensation(dto)
      message.success('賠付記錄創建成功')
      onCreated?.(compId)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      message.error(e?.response?.data?.message || e?.message || '創建失敗')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* ====== 頁面頭部 ====== */}
      <DetailPageHeader
        title="登記賠付"
        meta={asset ? <>{asset.assetNo} · {asset.assetName}</> : undefined}
        onBack={onBack}
      />

      <Spin spinning={assetLoading}>
        {/* ====== 模塊 1：資產信息 ====== */}
        <div style={detailCardStyle}>
          <SectionTitle
            icon={<AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
            iconBg="#e6f7ff"
            title="資產信息"
          />

          {/* 資產編號下拉選擇 */}
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

          {asset && (
            <Descriptions column={4} size="middle">
              <Descriptions.Item label="資產編號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span></Descriptions.Item>
              <Descriptions.Item label="資產名稱">{asset.assetName}</Descriptions.Item>
              <Descriptions.Item label="所屬品牌">{asset.companyBrand ? <BrandTag value={asset.companyBrand} /> : '-'}</Descriptions.Item>
              <Descriptions.Item label="資產品牌">{asset.brand || '-'}</Descriptions.Item>
              <Descriptions.Item label="資產分類">{asset.assetType || '-'}</Descriptions.Item>
              <Descriptions.Item label="當前使用人">{asset.userName || '-'}</Descriptions.Item>
              <Descriptions.Item label="所在部門">{asset.department || '-'}</Descriptions.Item>
              <Descriptions.Item label="購買時價值">
                {asset.purchaseValue != null ? `MOP ${Number(asset.purchaseValue).toLocaleString()}` : '-'}
              </Descriptions.Item>
            </Descriptions>
          )}
          {asset && <AssetParameters asset={asset} current />}
        </div>

        {/* ====== 模塊 2：賠付信息 ====== */}
        {asset && (
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<AppstoreOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
              iconBg="#fff7e6"
              title="賠付信息"
            />
            <Form<FormValues>
              form={form}
              layout="vertical"
              disabled={submitting}
              initialValues={{ damageType: initialDamageType || 'damage' }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 16 }}>
                <Form.Item label="損失類型" name="damageType" rules={[{ required: true, message: '請選擇損失類型' }]}>
                  <Select options={DAMAGE_OPTIONS} />
                </Form.Item>
                <Form.Item label="原因分類" name="cause">
                  <Select options={CAUSE_OPTIONS} placeholder="請選擇原因分類" allowClear />
                </Form.Item>
                <Form.Item label="責任對象" name="party">
                  <Select options={PARTY_OPTIONS} placeholder="請選擇責任對象" allowClear />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 16 }}>
                <Form.Item label="責任人" name="responsibleName">
                  <Input placeholder="請輸入責任人姓名" allowClear />
                </Form.Item>
                <Form.Item label="責任部門" name="department">
                  <Input placeholder="請輸入責任部門" allowClear />
                </Form.Item>
              </div>

              <Form.Item label="備註說明" name="reason">
                <Input.TextArea rows={3} placeholder="請描述損壞/遺失的情況、原因等" maxLength={500} showCount />
              </Form.Item>
            </Form>
          </div>
        )}
      </Spin>

      {/* ====== 頁面底部按鈕 ====== */}
      <div className="form-footer">
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSubmit} loading={submitting} disabled={!asset}>
          確認創建
        </Button>
      </div>
    </>
  )
}
