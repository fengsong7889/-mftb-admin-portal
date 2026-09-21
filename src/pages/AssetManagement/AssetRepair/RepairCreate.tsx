/**
 * 新建维修记录页（独立页面，替代原「弹窗选择资产」入口）
 *
 * 页面结构（自上而下）：
 * 1. 资产信息模块 —— 未选择资产时提供「选择资产」入口；选择后带出台账数据
 *    （领用编号/资产编号/名称/所属品牌/资产品牌/分类/购买时价值/管理部门 + 参数信息 + 资产配件）
 * 2. 当前使用人模块 —— 仅资产非闲置（有人使用）时展示：当前使用人/所在部门/持有方式/领用日期
 * 3. 维修记录模块 —— 选择资产后才显示，填写维修登记表单
 *
 * 样式基准：EAM 详情页统一规范（DetailPageHeader + 无边框模块卡片 + Descriptions column=4）。
 */
import { useState, useCallback, useRef } from 'react'
import {
  Button, DatePicker, Descriptions, Empty, Form, Input, InputNumber, Select, Spin, Tag, message,
} from 'antd'
import {
  AppstoreOutlined, UserOutlined, ToolOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs, { type Dayjs } from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import AssetParameters from '../../../components/AssetParameters'
import RemoteSearchSelect from '../../../components/RemoteSearchSelect'
import type { OptionItem } from '../../../api/types'
import { useAuth } from '../../../contexts/AuthContext'
import { fetchClaimDetail } from '../../../api/eamClaim'
import type { ClaimRow } from '../AssetClaim/claimViewTypes'
import {
  fetchAssetDetail, fetchAssetList, repairAsset, fetchRepairerOptions,
  type AssetItem, type AssetStatus,
} from '../../../api/asset'

async function fetchRepairerOptionsForSelect(keyword: string): Promise<OptionItem[]> {
  const options = await fetchRepairerOptions(keyword)
  return options.map(o => ({ value: o.value, label: o.label }))
}

const CAUSE_OPTIONS = [
  { value: 'human', labelKey: 'causeHuman' },
  { value: 'natural', labelKey: 'causeNatural' },
  { value: 'third_party', labelKey: 'causeThirdParty' },
  { value: 'quality', labelKey: 'causeQuality' },
]

/** 资产状态 → 标签颜色 */
const ASSET_STATUS_COLOR: Record<AssetStatus, string> = {
  idle: 'default', in_use: 'success', in_repair: 'processing', scrapped: 'error',
  lost: 'warning', pending_inspection: 'blue', written_off: 'default',
}

/** 模块卡片统一样式（无边框阴影，对齐 EAM 详情页规范） */
const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 卡片标题（图标色块 + 标题 + 分隔线） */
function SectionTitle({ icon, iconBg, title, tag, extra }: {
  icon: React.ReactNode; iconBg: string; title: string; tag?: React.ReactNode; extra?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      {tag}
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {extra}
    </div>
  )
}

interface FormValues {
  repairDate: Dayjs
  faultDesc: string
  repairContent: string
  repairBy: string
  cost?: number
  applicant: string
  causeType?: 'human' | 'natural' | 'third_party' | 'quality'
}

interface Props {
  onBack: () => void
  /** 创建成功后跳转该资产的维修详情 */
  onCreated: (assetId: number) => void
}

export default function RepairCreate({ onBack, onCreated }: Props) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()

  const [asset, setAsset] = useState<AssetItem | null>(null)
  const [claim, setClaim] = useState<ClaimRow | null>(null)
  const [assetLoading, setAssetLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /* ----- 资产下拉搜索 ----- */
  const [assetSelectOptions, setAssetSelectOptions] = useState<AssetItem[]>([])
  const [assetSelectLoading, setAssetSelectLoading] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>()

  /** 选择资产后带出台账数据 + 当前领用单快照 */
  const loadAsset = useCallback(async (assetId: number) => {
    setAssetLoading(true)
    try {
      const detail = await fetchAssetDetail(assetId)
      setAsset(detail)
      setClaim(null)
      if (detail.activeClaimId) {
        try { setClaim(await fetchClaimDetail(detail.activeClaimId)) } catch { setClaim(null) }
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : t('asset.queryFailed'))
    } finally {
      setAssetLoading(false)
    }
  }, [t])

  /** 加载初始资产列表（打开下拉时调用） */
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
  const handleAssetSelect = useCallback((assetId: number | undefined) => {
    if (assetId) {
      loadAsset(assetId)
    } else {
      setAsset(null)
      setClaim(null)
      form.resetFields()
    }
  }, [loadAsset, form])

  const handleSubmit = async () => {
    if (!asset) { message.warning(t('asset.selectAssetFirst')); return }
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
        cost: v.cost ?? 0,
        finishDate: null,
        status: 'repairing',
        applicant: v.applicant,
        causeType: v.causeType,
      })
      message.success(t('asset.repairCreated'))
      onCreated(asset.id)
    } catch (e: unknown) {
      if (e instanceof Error) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ----- 当前使用人（资产非闲置时展示） ----- */
  const hasHolder = !!asset && asset.status !== 'idle'
  const holderName = claim?.empNo ? `${claim.empName}（${claim.empNo}）` : (asset?.userName || '-')
  const holderDept = claim?.department || asset?.department || '-'
  const claimDate = claim?.claimDate || asset?.claimDate || '-'

  return (
    <>
      {/* ====== 页面头部 ====== */}
      <DetailPageHeader
        title={t('asset.repairCreateTitle', '新建維修記錄')}
        meta={asset ? <>{asset.assetNo} · {asset.assetName}</> : undefined}
        onBack={onBack}
      />

      <Spin spinning={assetLoading}>
        {/* ====== 模块 1：资产信息 ====== */}
        <div style={detailCardStyle}>
          <SectionTitle
            icon={<AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
            iconBg="#e6f7ff"
            title={t('asset.sectionAssetInfo')}
            tag={asset ? <Tag color={ASSET_STATUS_COLOR[asset.status]}>{t(`asset.status${asset.status === 'in_use' ? 'InUse' : asset.status === 'in_repair' ? 'InRepair' : asset.status === 'scrapped' ? 'Scrapped' : 'Idle'}`)}</Tag> : undefined}
          />

          {/* 资产编号下拉选择 */}
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

          {asset && (
            <>
              {/* 资产基本信息（3列） */}
              <Descriptions column={3} size="middle">
                <Descriptions.Item label={t('asset.colAssetNo')}><span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{asset.assetNo}</span></Descriptions.Item>
                <Descriptions.Item label={t('asset.colAssetName')}>{asset.assetName}</Descriptions.Item>
                <Descriptions.Item label={t('asset.colAssetType')}>{asset.assetType || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('asset.colBrand')}>{asset.brand || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('asset.colLocation')}>{asset.location || '-'}</Descriptions.Item>
                <Descriptions.Item label={t('asset.colPurchaseValue')}>
                  {asset.purchaseValue != null ? `MOP ${Number(asset.purchaseValue).toLocaleString()}` : '-'}
                </Descriptions.Item>
              </Descriptions>

              {/* 参数信息 */}
              <AssetParameters asset={asset} current />

              {/* 领用配件 */}
              {(() => {
                const accessories = claim?.accessories ?? asset.accessories ?? []
                return (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <AppstoreOutlined style={{ fontSize: 13, color: '#FA8C16' }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#595959' }}>{t('asset.repairAccessoriesTitle', '資產配件')}</span>
                      {accessories.length > 0 && <Tag color="orange" style={{ fontSize: 11 }}>{t('asset.accessoryCount', { count: accessories.length })}</Tag>}
                      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
                    </div>
                    {accessories.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {accessories.map((acc, idx) => (
                          <Tag
                            key={idx}
                            color="orange"
                            closable
                            style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4 }}
                          >
                            {acc.name} × {acc.qty}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#8C8C8C' }}>{t('asset.accessoriesEmpty')}</span>
                    )}
                    <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>
                      {t('asset.repairAccessoryRemoveTip', '點擊 × 可移除不需要维修的配件，歸還時僅展示维修的配件。')}
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </div>

        {/* ====== 模块 2：当前使用人（仅资产有人使用即非闲置时展示） ====== */}
        {asset && hasHolder && (
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<UserOutlined style={{ fontSize: 14, color: '#13C2C2' }} />}
              iconBg="#e6fffb"
              title={t('asset.currentUserTitle')}
            />
            <Descriptions column={4} size="middle">
              <Descriptions.Item label={t('asset.currentUserLabel')}>{holderName}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colDepartment')}>{holderDept}</Descriptions.Item>
              <Descriptions.Item label={t('asset.colHoldType')}>
                {asset.holdType === 'borrowed'
                  ? <Tag color="orange">{t('asset.holdBorrowed')}</Tag>
                  : <Tag color="blue">{t('asset.holdOwned')}</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label={t('asset.colClaimDate')}>{claimDate}</Descriptions.Item>
            </Descriptions>
          </div>
        )}

        {/* ====== 模块 3：维修记录（选择资产后才显示） ====== */}
        {asset && (
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<ToolOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
              iconBg="#fff7e6"
              title={t('asset.repairRecordsTitle', '維修記錄')}
            />
            <Form<FormValues>
              form={form}
              layout="vertical"
              disabled={submitting}
              initialValues={{ repairDate: dayjs(), cost: 0, applicant: user?.name || user?.username || undefined }}
            >
              {/* 第一行：送修日期、维修方、维修费用 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 16 }}>
                <Form.Item label={t('asset.colRepairDate')} name="repairDate" rules={[{ required: true, message: t('asset.repairDateRequired') }]}>
                  <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
                </Form.Item>
                <Form.Item label={t('asset.colRepairBy')} name="repairBy" rules={[{ required: true, message: t('asset.repairByRequired') }]}>
                  <RemoteSearchSelect
                    placeholder={t('asset.repairerPh', '请搜索供应商名称或编码')}
                    fetchOptions={fetchRepairerOptionsForSelect}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
                <Form.Item label={t('asset.colCost')} name="cost">
                  <InputNumber min={0} step={50} addonAfter="MOP" style={{ width: '100%' }} />
                </Form.Item>
              </div>
              {/* 第二行：申请人、原因分类 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: 16 }}>
                <Form.Item label={t('asset.colApplicant')} name="applicant" rules={[{ required: true, message: t('asset.applicantRequired') }]}>
                  <Input placeholder={t('asset.userNamePh')} allowClear />
                </Form.Item>
                <Form.Item label={t('asset.colCauseType')} name="causeType">
                  <Select placeholder={t('common.all')} allowClear>
                    {CAUSE_OPTIONS.map((o) => <Select.Option key={o.value} value={o.value}>{t(`asset.${o.labelKey}`)}</Select.Option>)}
                  </Select>
                </Form.Item>
              </div>
              {/* 故障描述（独立一行） */}
              <Form.Item label={t('asset.colFaultDesc')} name="faultDesc" rules={[{ required: true, message: t('asset.faultDescRequired') }]}>
                <Input.TextArea rows={2} placeholder={t('asset.faultDescPh')} maxLength={300} showCount />
              </Form.Item>
              {/* 维修内容（独立一行） */}
              <Form.Item label={t('asset.colRepairContent')} name="repairContent" rules={[{ required: true, message: t('asset.repairContentRequired') }]}>
                <Input.TextArea rows={2} placeholder={t('asset.repairContentPh')} maxLength={300} showCount />
              </Form.Item>
            </Form>
          </div>
        )}
      </Spin>

      {/* ====== 页面底部按钮（表单页规范） ====== */}
      <div className="form-footer">
        <Button icon={<ReloadOutlined />} onClick={onBack}>{t('common.cancel')}</Button>
        <Button type="primary" onClick={handleSubmit} loading={submitting} disabled={!asset}>{t('asset.btnSubmitRepair', '提交維修記錄')}</Button>
      </div>
    </>
  )
}
