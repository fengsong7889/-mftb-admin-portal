/**
 * 节假日 —— 新增 / 编辑 / 详情（独立页面，禁止弹窗）
 *
 * 模式判定：/attendance-holiday-form          → 新增
 *          /attendance-holiday-form?id=2      → 编辑
 *          /attendance-holiday-detail?id=2    → 详情（只读，隐藏底部按钮）
 *
 * 契约要点：
 * - 日期提交 `YYYY-MM-DD`，后端 `LocalDate` 直接反序列化；
 * - `yearNo` 不提交：由服务端按日期推导，前端传了也会被覆盖（否则会出现"日期在 2026、年度写 2025"）；
 * - 一天只允许一条日历（唯一键 uk_holiday_active_date），重复提交由后端拒绝并回显已存在的那条名称。
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, DatePicker, Form, Input, Select, Switch, message } from 'antd'
import {
  ArrowLeftOutlined, CalendarOutlined, SaveOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import DetailPageHeader from '../../components/DetailPageHeader'
import RemarkTextArea from '../../components/RemarkTextArea'
import {
  ENABLE_STATUS, HOLIDAY_TYPE, createHoliday, fetchHolidayDetail, updateHoliday, type HolidayPayload,
} from '../../api/attendance'
import { HOLIDAY_TYPE_LABEL_KEY } from './meta'
import '@/styles/components.css'

const cardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

function CardTitle(props: { icon: React.ReactNode; color: string; bg: string; title: string; hint?: string }) {
  const { icon, color, bg, title, hint } = props
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 14, color }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {hint && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{hint}</span>}
    </div>
  )
}

interface HolidayFormValues {
  holidayDate: Dayjs
  holidayName: string
  holidayType: number
  status: string
  remark?: string
}

/** 详情/编辑页的只读快照，仅用于页头与「最后更新」页脚 */
interface HolidayMeta {
  id: number
  holidayDate: string
  holidayType: number
  updatedBy?: string | null
  updatedAt?: string | null
}

const TYPE_OPTIONS = [
  { value: HOLIDAY_TYPE.LEGAL, labelKey: HOLIDAY_TYPE_LABEL_KEY[HOLIDAY_TYPE.LEGAL] },
  { value: HOLIDAY_TYPE.SWAP_WORKDAY, labelKey: HOLIDAY_TYPE_LABEL_KEY[HOLIDAY_TYPE.SWAP_WORKDAY] },
  { value: HOLIDAY_TYPE.COMPANY, labelKey: HOLIDAY_TYPE_LABEL_KEY[HOLIDAY_TYPE.COMPANY] },
]

export default function AttendanceHolidayForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')
  const isDetailMode = location.pathname === '/attendance-holiday-detail'
  const isEditMode = !!id && !isDetailMode

  const [form] = Form.useForm<HolidayFormValues>()
  const [meta, setMeta] = useState<HolidayMeta | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const record = await fetchHolidayDetail(Number(id))
      setMeta({
        id: record.id, holidayDate: record.holidayDate, holidayType: record.holidayType,
        updatedBy: record.updatedBy, updatedAt: record.updatedAt,
      })
      form.setFieldsValue({
        holidayDate: dayjs(record.holidayDate),
        holidayName: record.holidayName,
        holidayType: record.holidayType,
        status: record.status ?? ENABLE_STATUS.ENABLED,
        remark: record.remark ?? undefined,
      })
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [id, form])

  useEffect(() => { load() }, [load])

  const handleBack = () => navigate('/attendance-holiday')

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: HolidayPayload = {
      holidayDate: values.holidayDate.format('YYYY-MM-DD'),
      holidayName: values.holidayName,
      holidayType: values.holidayType,
      status: values.status,
      remark: values.remark ?? null,
    }
    setSubmitting(true)
    try {
      if (isEditMode && id) {
        await updateHoliday(Number(id), payload)
        message.success(t('common.editSuccess'))
      } else {
        await createHoliday(payload)
        message.success(t('common.addSuccess'))
      }
      handleBack()
    } catch {
      // 请求层已统一提示（同日已有记录、类型非法等），这里只恢复按钮状态
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          message={t('common.loadFailed')}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={load}>{t('common.reset')}</Button>}
        />
      )}

      {isDetailMode ? (
        <DetailPageHeader
          title={t('attendance.holidayDetail')}
          meta={<>
            {meta?.holidayDate}
            {meta ? ` · ${t(HOLIDAY_TYPE_LABEL_KEY[meta.holidayType] ?? 'common.underDev')}` : ''}
          </>}
          onBack={handleBack}
          onEdit={meta ? () => navigate(`/attendance-holiday-form?id=${meta.id}`) : undefined}
        />
      ) : (
        <div style={{
          position: 'relative', background: '#fff', marginBottom: 16,
          borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            height: 3,
            background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
            backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
          }} />
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button
                type="primary"
                icon={<ArrowLeftOutlined />}
                onClick={handleBack}
                style={{
                  backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
                  padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >{t('common.back')}</Button>
              <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isEditMode ? t('attendance.holidayEdit') : t('attendance.holidayAdd')}
              </h2>
            </div>
          </div>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        disabled={isDetailMode || loading}
        initialValues={{ holidayType: HOLIDAY_TYPE.LEGAL, status: ENABLE_STATUS.ENABLED }}
      >
        <div style={cardStyle}>
          <CardTitle
            icon={<CalendarOutlined />}
            color="#1890ff"
            bg="#e6f7ff"
            title={t('attendance.holidaySection')}
            hint={t('attendance.holidayTypeHint')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label={t('attendance.holidayDate')}
              name="holidayDate"
              rules={[{ required: true, message: t('attendance.holidayDateRequired') }]}
            >
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item
              label={t('attendance.holidayName')}
              name="holidayName"
              rules={[{ required: true, message: t('attendance.holidayNameRequired') }]}
            >
              <Input placeholder={t('attendance.holidayNamePlaceholder')} maxLength={40} />
            </Form.Item>
            <Form.Item
              label={t('attendance.holidayType')}
              name="holidayType"
              rules={[{ required: true, message: t('common.pleaseSelect') }]}
            >
              <Select options={TYPE_OPTIONS.map(o => ({ value: o.value, label: t(o.labelKey) }))} />
            </Form.Item>
            <Form.Item
              label={t('common.colStatus')}
              name="status"
              getValueProps={(value: string) => ({ checked: value !== ENABLE_STATUS.DISABLED })}
              getValueFromEvent={(checked: boolean) => (checked ? ENABLE_STATUS.ENABLED : ENABLE_STATUS.DISABLED)}
            >
              <Switch checkedChildren={t('attendance.enableAction')} unCheckedChildren={t('attendance.disableAction')} />
            </Form.Item>
          </div>
        </div>

        <div style={cardStyle}>
          <CardTitle icon={<ThunderboltOutlined />} color="#52c41a" bg="#f6ffed" title={t('common.colRemark')} />
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <RemarkTextArea placeholder={t('attendance.holidayRemarkPlaceholder')} />
          </Form.Item>
        </div>

        {/* 详情页必须以「最后更新」收尾（规范 §D.1）：值来自服务端，禁止用浏览器时间与当前用户伪造 */}
        {isDetailMode && (
          <div style={{
            background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0',
            display: 'flex', justifyContent: 'flex-end', gap: 24,
          }}>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {t('attendance.lastUpdaterPrefix')}<span style={{ color: '#595959' }}>{meta?.updatedBy ?? '-'}</span>
            </span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {t('attendance.lastUpdateTimePrefix')}<span style={{ color: '#595959' }}>{meta?.updatedAt ?? '-'}</span>
            </span>
          </div>
        )}
      </Form>

      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
