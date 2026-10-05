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
import { useTranslation } from 'react-i18next'
import {
  Button, DatePicker, Descriptions, Empty, Form, Input, Select, Spin, Tag, message,
} from 'antd'
import {
  AppstoreOutlined, UserOutlined, SearchOutlined, ReloadOutlined, InboxOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import AssetParameters from '../../../components/AssetParameters'
import { useAuth } from '../../../contexts/AuthContext'
import {
  fetchAssetDetail,
  type AssetItem,
} from '../../../api/asset'
import { createLoss, type LossSaveDTO } from '../../../api/eamLoss'
import {
  ASSET_STATUS_COLOR,
  detailCardStyle,
  SectionTitle,
  getAssetStatusLabel,
  useAssetSearch,
} from '../components/shared'

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
  const { t } = useTranslation()
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()

  const [submitting, setSubmitting] = useState(false)

  const {
    asset, setAsset, assetLoading,
    assetSelectOptions, assetSelectLoading,
    loadAsset, loadInitialAssets, handleAssetSearch, handleAssetSelect,
  } = useAssetSearch()

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
            icon={<InboxOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
            iconBg="#e6f7ff"
            title="資產信息"
            tag={asset ? <Tag color={ASSET_STATUS_COLOR[asset.status]}>{getAssetStatusLabel(asset.status)}</Tag> : undefined}
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
              <Descriptions.Item label={t('asset.colHoldType')}>
                {asset.holdType === 'borrowed'
                  ? <Tag color="orange">{t('asset.holdBorrowed')}</Tag>
                  : <Tag color="blue">{t('asset.holdOwned')}</Tag>}
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
        <Button onClick={onBack}>取消</Button>
        <Button type="primary" onClick={handleSubmit} loading={submitting} disabled={!asset}>
          確認報失
        </Button>
      </div>
    </>
  )
}
