/**
 * 主動報失頁（新建遺失單）
 *
 * 頁面結構（自上而下）：
 * 1. 資產信息模塊 —— 選擇資產編號，帶出台賬數據
 * 2. 當前使用人模塊 —— 僅資產非閒置時展示
 * 3. 遺失信息模塊 —— 選擇資產後才顯示，填寫遺失登記表單
 *
 * 樣式基準：EAM 詳情頁統一規範（DetailPageHeader + 無邊框模塊卡片 + Descriptions column=4）。
 */
import { useState, useCallback, useRef } from 'react'
import {
  Button, DatePicker, Descriptions, Empty, Form, Input, Select, Spin, Tag, message,
} from 'antd'
import {
  AppstoreOutlined, UserOutlined, SearchOutlined, ReloadOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchAssetDetail, fetchAssetList,
  type AssetItem, type AssetStatus,
} from '../../../api/asset'
import { createLoss, type LossSaveDTO } from '../../../api/eamLoss'

/** 資產狀態 → 標籤顏色 */
const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
  idle: 'default', in_use: 'success', in_repair: 'processing', scrapped: 'error',
  lost: 'warning', pending_inspection: 'blue', written_off: 'default',
}

/** 模塊卡片統一樣式 */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 卡片標題（圖標色塊 + 標題 + 分隔線） */
function SectionTitle({ icon, iconBg, title, tag }: {
  icon: React.ReactNode; iconBg: string; title: string; tag?: React.ReactNode
}) {
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

interface FormValues {
  lossDate: Dayjs
  lossReason: string
  lastKnownLocation: string
}

interface Props {
  onBack: () => void
  onCreated: (lossId: number) => void
}

export default function LossCreate({ onBack, onCreated }: Props) {
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()

  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [assetLoading, setAssetLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /* ----- 資產下拉搜索 ----- */
  const [assetSelectOptions, setAssetSelectOptions] = useState<AssetItem[]>([])
  const [assetSelectLoading, setAssetSelectLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

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
      setAssetSelectOptions(res.records.filter((a) => a.status !== 'scrapped'))
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
        setAssetSelectOptions(res.records.filter((a) => a.status !== 'scrapped'))
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
      form.resetFields()
    }
  }, [loadAsset, form])

  const handleSubmit = async () => {
    if (!asset) { message.warning('請先選擇資產'); return }
    try {
      const v = await form.validateFields()
      setSubmitting(true)
      const dto: LossSaveDTO = {
        assetId: asset.id,
        lossDate: v.lossDate.format('YYYY-MM-DD'),
        lossReason: v.lossReason,
        lastKnownLocation: v.lastKnownLocation,
      }
      const lossId = await createLoss(dto)
      message.success('遺失單創建成功')
      onCreated(lossId)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'errorFields' in err) return
      const e = err as { response?: { data?: { message?: string } }; message?: string }
      message.error(e?.response?.data?.message || e?.message || '創建失敗')
    } finally {
      setSubmitting(false)
    }
  }

  /* ----- 當前使用人（資產非閒置時展示） ----- */
  const hasHolder = !!asset && asset.status !== 'idle'

  return (
    <>
      {/* ====== 頁面頭部 ====== */}
      <DetailPageHeader
        title="登記遺失"
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
            tag={asset ? <Tag color={ASSET_STATUS_COLOR[asset.status]}>{
              asset.status === 'idle' ? '閒置' : asset.status === 'in_use' ? '使用中' : asset.status === 'in_repair' ? '維修中' : asset.status === 'scrapped' ? '已報廢' : asset.status === 'lost' ? '遺失' : asset.status === 'pending_inspection' ? '待驗收' : '已核銷'
            }</Tag> : undefined}
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
            <Descriptions column={3} size="middle">
              <Descriptions.Item label="資產編號"><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span></Descriptions.Item>
              <Descriptions.Item label="資產名稱">{asset.assetName}</Descriptions.Item>
              <Descriptions.Item label="分類">{asset.assetType || '-'}</Descriptions.Item>
              <Descriptions.Item label="品牌">{asset.brand || '-'}</Descriptions.Item>
              <Descriptions.Item label="位置">{asset.location || '-'}</Descriptions.Item>
              <Descriptions.Item label="購買價值">
                {asset.purchaseValue != null ? `MOP ${Number(asset.purchaseValue).toLocaleString()}` : '-'}
              </Descriptions.Item>
            </Descriptions>
          )}
        </div>

        {/* ====== 模塊 2：當前使用人（僅資產有人使用時展示） ====== */}
        {asset && hasHolder && (
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<UserOutlined style={{ fontSize: 14, color: '#13C2C2' }} />}
              iconBg="#e6fffb"
              title="當前使用人"
            />
            <Descriptions column={4} size="middle">
              <Descriptions.Item label="使用人">{asset.userName || '-'}</Descriptions.Item>
              <Descriptions.Item label="部門">{asset.department || '-'}</Descriptions.Item>
              <Descriptions.Item label="持有方式">
                {asset.holdType === 'borrowed'
                  ? <Tag color="orange">借用</Tag>
                  : <Tag color="blue">領用</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="領用日期">{asset.claimDate || '-'}</Descriptions.Item>
            </Descriptions>
          </div>
        )}

        {/* ====== 模塊 3：遺失信息（選擇資產後才顯示） ====== */}
        {asset && (
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<SearchOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
              iconBg="#fff7e6"
              title="遺失信息"
            />
            <Form<FormValues>
              form={form}
              layout="vertical"
              disabled={submitting}
              initialValues={{ lossDate: dayjs() }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 16 }}>
                <Form.Item label="遺失日期" name="lossDate" rules={[{ required: true, message: '請選擇遺失日期' }]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(current) => current && current.isAfter(dayjs(), 'day')} />
                </Form.Item>
                <Form.Item label="最後已知位置" name="lastKnownLocation">
                  <Input placeholder="資產最後一次被確認存在的地點" allowClear />
                </Form.Item>
              </div>
              <Form.Item label="報失原因" name="lossReason" rules={[{ required: true, message: '請填寫報失原因' }]}>
                <Input.TextArea rows={3} placeholder="請描述遺失的時間、地點、經過等" maxLength={500} showCount />
              </Form.Item>
            </Form>
          </div>
        )}
      </Spin>

      {/* ====== 頁面底部按鈕 ====== */}
      <div className="form-footer">
        <Button icon={<ReloadOutlined />} onClick={onBack}>取消</Button>
        <Button type="primary" onClick={handleSubmit} loading={submitting} disabled={!asset}>
          確認報失
        </Button>
      </div>
    </>
  )
}
