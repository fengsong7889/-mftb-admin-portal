/**
 * 報廢記錄詳情頁
 *
 * 只讀展示：資產快照信息、報廢信息、處置信息、時間與操作人
 * 字段與新增報廢表單保持一致
 * 底部按鈕：刪除（二次確認）+ 返回
 */
import { useState, useEffect, useCallback } from 'react'
import { Spin, Descriptions, Tag, Button, Modal, message } from 'antd'
import {
  ExclamationCircleOutlined, FileTextOutlined, ClockCircleOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import BrandTag from '../../../components/BrandTag'
import { fetchScrapDetail, deleteScrapRecord, type ScrapRecord } from '../../../api/asset'

interface Props {
  scrapId: number
  onBack: () => void
  /** 刪除成功後回調（返回列表） */
  onDeleted?: () => void
}

const DISPOSE_LABELS: Record<string, string> = {
  sale: '出售',
  donate: '捐贈',
  recycle: '回收',
  destroy: '銷毀',
}

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

export default function ScrapDetail({ scrapId, onBack, onDeleted }: Props) {
  const { t } = useTranslation()
  const [record, setRecord] = useState<ScrapRecord | null>(null)
  const [loading, setLoading] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchScrapDetail(scrapId)
      setRecord(data)
    } catch {
      message.error('加載報廢記錄失敗')
    } finally {
      setLoading(false)
    }
  }, [scrapId])

  useEffect(() => { loadData() }, [loadData])

  const handleDelete = () => {
    if (!record) return
    Modal.confirm({
      title: '確認刪除此報廢記錄？',
      content: (
        <div style={{ background: '#FFF7F0', border: '1px solid #FFE7D1', borderRadius: 8, padding: '12px 16px', marginTop: 12 }}>
          <div style={{ fontSize: 13, color: '#595959' }}>
            <div>資產編號：<b style={{ color: '#262626' }}>{record.assetNo}</b></div>
            <div>資產名稱：<b style={{ color: '#262626' }}>{record.assetName}</b></div>
          </div>
          <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
            刪除後資產將恢復為閒置狀態，可再次被領用或借用。
          </div>
        </div>
      ),
      okText: '確認刪除',
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteScrapRecord(record.id)
          message.success('報廢記錄已刪除，資產已恢復閒置')
          if (onDeleted) onDeleted()
          else onBack()
        } catch (e: unknown) {
          if (e instanceof Error) message.error(e.message)
        }
      },
    })
  }

  return (
    <Spin spinning={loading}>
      {/* ====== 页面头部 ====== */}
      <DetailPageHeader
        title="報廢詳情"
        meta={record ? <>{record.scrapNo ? `${record.scrapNo} · ` : ''}{record.assetNo} · {record.assetName}</> : undefined}
        onBack={onBack}
        extra={
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete} style={{ borderRadius: 8, height: 36, padding: '0 16px' }}>
            刪除
          </Button>
        }
      />

      {record && (
        <>
          {/* ====== 模块 1：资产快照信息 ====== */}
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<ExclamationCircleOutlined style={{ fontSize: 14, color: '#1890ff' }} />}
              iconBg="#e6f7ff"
              title="資產信息"
            />
            <Descriptions column={4} size="middle">
              <Descriptions.Item label="資產編號">
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{record.assetNo}</span>
              </Descriptions.Item>
              <Descriptions.Item label="資產名稱">{record.assetName}</Descriptions.Item>
              <Descriptions.Item label="所屬品牌">
                {record.companyBrand ? <BrandTag value={record.companyBrand} /> : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="資產品牌">{record.brand || '-'}</Descriptions.Item>
              <Descriptions.Item label="資產分類">{record.assetType || '-'}</Descriptions.Item>
            </Descriptions>
          </div>

          {/* ====== 模块 2：报废信息 ====== */}
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<FileTextOutlined style={{ fontSize: 14, color: '#fa8c16' }} />}
              iconBg="#fff7e6"
              title="報廢信息"
            />
            <Descriptions column={3} size="middle">
              <Descriptions.Item label="報廢日期">
                {record.scrapDate ? dayjs(record.scrapDate).format('YYYY-MM-DD') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="經辦人">
                {record.applyBy
                  ? <span style={{ whiteSpace: 'nowrap' }}>{record.empId ? `${record.applyBy}（${record.empId}）` : record.applyBy}</span>
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="殘值">
                {record.residualValue ? `MOP ${record.residualValue.toLocaleString()}` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="處置方式">
                {record.disposeType
                  ? <Tag>{DISPOSE_LABELS[record.disposeType] || record.disposeType}</Tag>
                  : <span style={{ color: '#8C8C8C' }}>未填寫</span>}
              </Descriptions.Item>
              <Descriptions.Item label="報廢原因" span={2}>
                {record.reason || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="鑑定意見" span={3}>
                {record.appraisal || '-'}
              </Descriptions.Item>
            </Descriptions>
          </div>

          {/* ====== 模块 3：时间与操作人 ====== */}
          <div style={detailCardStyle}>
            <SectionTitle
              icon={<ClockCircleOutlined style={{ fontSize: 14, color: '#722ed1' }} />}
              iconBg="#f9f0ff"
              title="時間與操作人"
            />
            <Descriptions column={3} size="middle">
              <Descriptions.Item label="創建時間">{record.createdAt || '-'}</Descriptions.Item>
              <Descriptions.Item label="最後更新人">{record.updatedBy || '-'}</Descriptions.Item>
              <Descriptions.Item label="最後更新時間">{record.updatedAt || '-'}</Descriptions.Item>
            </Descriptions>
          </div>
        </>
      )}

      {/* ====== 页面底部按钮 ====== */}
      <div className="form-footer">
        <Button onClick={onBack}>{t('common.back')}</Button>
        <Button danger type="primary" icon={<DeleteOutlined />} onClick={handleDelete}>
          刪除報廢
        </Button>
      </div>
    </Spin>
  )
}
