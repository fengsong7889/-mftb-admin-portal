/**
 * 班次 —— 新增 / 编辑 / 详情（独立页面，禁止弹窗）
 *
 * 模式判定：/attendance-shift-form          → 新增
 *          /attendance-shift-form?id=2      → 编辑
 *          /attendance-shift-detail?id=2    → 详情（只读，隐藏底部按钮）
 *
 * 与后端的契约（由 AttendanceJsonContractTest 锁定）：
 * - 读：`AttendanceShiftVO` 的时间字段是 `HH:mm` 字符串，直接喂 TimePicker
 * - 写：提交 `HH:mm`，后端 LocalTime 反序列化兼容缺秒形态
 * - `shiftCode` 编辑态锁定且服务端以库中值为准（前端锁定只是体验，不是安全边界）
 * - `crossDay` 必须显式勾选：跨天夜班不标记，打卡流水的 work_date 会算错一天，
 *   而汇总一律按 work_date 聚合，错一天就是错一天的工资
 */
import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, InputNumber, Switch, TimePicker, message } from 'antd'
import {
  ArrowLeftOutlined, ClockCircleOutlined, DatabaseOutlined, SaveOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import DetailPageHeader from '../../components/DetailPageHeader'
import RemarkTextArea from '../../components/RemarkTextArea'
import {
  ENABLE_STATUS, createShift, fetchShiftDetail, updateShift, type ShiftPayload,
} from '../../api/attendance'
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

const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }

/** 表单值模型：时间用 Dayjs，提交前格式化为 HH:mm（与后端 VO 同一形态） */
interface ShiftFormValues {
  shiftCode: string
  shiftName: string
  flexFlag: boolean
  crossDay: boolean
  onTime?: Dayjs
  offTime?: Dayjs
  workHours: number
  restStart?: Dayjs
  restEnd?: Dayjs
  status: string
  remark?: string
}

/** 详情/编辑页的只读快照，仅用于页头与「最后更新」页脚 */
interface ShiftMeta {
  id: number
  shiftCode: string
  shiftName: string
  updatedBy?: string | null
  updatedAt?: string | null
}

const hhmm = (value?: Dayjs | null) => (value ? value.format('HH:mm') : null)

export default function AttendanceShiftForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')
  // HashRouter 下必须用路由 pathname 判模式，window.location.hash 带 '#' 前缀
  const isDetailMode = location.pathname === '/attendance-shift-detail'
  const isEditMode = !!id && !isDetailMode

  const [form] = Form.useForm<ShiftFormValues>()
  const [meta, setMeta] = useState<ShiftMeta | null>(null)
  const [isFlex, setIsFlex] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const record = await fetchShiftDetail(Number(id))
      setMeta({
        id: record.id, shiftCode: record.shiftCode, shiftName: record.shiftName,
        updatedBy: record.updatedBy, updatedAt: record.updatedAt,
      })
      const flex = record.flexFlag === 1
      setIsFlex(flex)
      form.setFieldsValue({
        shiftCode: record.shiftCode,
        shiftName: record.shiftName,
        flexFlag: flex,
        crossDay: record.crossDay === 1,
        // 弹性班次没有固定上下班时间（VO 为 null），不能拿去构造 Dayjs
        onTime: record.onTime ? dayjs(record.onTime, 'HH:mm') : undefined,
        offTime: record.offTime ? dayjs(record.offTime, 'HH:mm') : undefined,
        workHours: record.workHours ?? 8,
        restStart: record.restStart ? dayjs(record.restStart, 'HH:mm') : undefined,
        restEnd: record.restEnd ? dayjs(record.restEnd, 'HH:mm') : undefined,
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

  const handleBack = () => navigate('/attendance-shift')

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const payload: ShiftPayload = {
      shiftCode: values.shiftCode,
      shiftName: values.shiftName,
      flexFlag: values.flexFlag ? 1 : 0,
      crossDay: values.crossDay ? 1 : 0,
      // 弹性班次不绑定时刻：显式传 null，避免后端拿到上一次编辑残留的时间
      onTime: values.flexFlag ? null : hhmm(values.onTime),
      offTime: values.flexFlag ? null : hhmm(values.offTime),
      workHours: values.workHours,
      restStart: hhmm(values.restStart),
      restEnd: hhmm(values.restEnd),
      status: values.status,
      remark: values.remark ?? null,
    }
    setSubmitting(true)
    try {
      if (isEditMode && id) {
        await updateShift(Number(id), payload)
        message.success(t('common.editSuccess'))
      } else {
        await createShift(payload)
        message.success(t('common.addSuccess'))
      }
      handleBack()
    } catch {
      // 请求层已统一提示业务错误（编码重复、时间非法等），这里只恢复按钮状态
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
          title={t('attendance.shiftDetail')}
          meta={<>{meta?.shiftCode} · {meta?.shiftName}</>}
          onBack={handleBack}
          onEdit={meta ? () => navigate(`/attendance-shift-form?id=${meta.id}`) : undefined}
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
                {isEditMode ? t('attendance.shiftEdit') : t('attendance.shiftAdd')}
              </h2>
            </div>
          </div>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        disabled={isDetailMode || loading}
        requiredMark={isDetailMode ? false : true}
        initialValues={{ flexFlag: false, crossDay: false, workHours: 8, status: ENABLE_STATUS.ENABLED }}
      >
        <div style={cardStyle}>
          <CardTitle icon={<DatabaseOutlined />} color="#1890ff" bg="#e6f7ff" title={t('attendance.shiftBasicSection')} />
          <div style={gridStyle}>
            <Form.Item
              label={t('attendance.shiftCode')}
              name="shiftCode"
              rules={[
                { required: true, message: t('attendance.shiftCodeRequired') },
                { pattern: /^[A-Z]{2}\d{2,3}$/, message: t('attendance.shiftCodeRule') },
              ]}
              extra={(isEditMode || isDetailMode) ? undefined : t('attendance.shiftCodeRule')}
            >
              {/* 编码是稳定身份：编辑态锁定，且服务端以库中值为准 */}
              <Input placeholder="SH07" maxLength={10} disabled={isDetailMode || isEditMode} />
            </Form.Item>
            <Form.Item
              label={t('attendance.shiftName')}
              name="shiftName"
              rules={[{ required: true, message: t('attendance.shiftNameRequired') }]}
            >
              <Input placeholder={t('attendance.shiftNamePlaceholder')} maxLength={40} />
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
          <CardTitle
            icon={<ClockCircleOutlined />}
            color="#fa8c16"
            bg="#fff7e6"
            title={t('attendance.shiftTimeSection')}
            hint={t('attendance.shiftFlexHint')}
          />
          <div style={gridStyle}>
            <Form.Item label={t('attendance.shiftFlexType')} name="flexFlag" valuePropName="checked">
              <Switch
                checkedChildren={t('attendance.shiftFlexElastic')}
                unCheckedChildren={t('attendance.shiftFlexFixed')}
                onChange={checked => setIsFlex(checked)}
              />
            </Form.Item>
            <Form.Item
              label={t('attendance.shiftOnTime')}
              name="onTime"
              rules={isFlex ? [] : [{ required: true, message: t('attendance.shiftOnRequired') }]}
            >
              <TimePicker
                format="HH:mm"
                style={{ width: '100%' }}
                disabled={isDetailMode || isFlex}
                placeholder={isFlex ? t('attendance.shiftFlexElastic') : t('common.pleaseSelect')}
              />
            </Form.Item>
            <Form.Item
              label={t('attendance.shiftOffTime')}
              name="offTime"
              rules={isFlex ? [] : [{ required: true, message: t('attendance.shiftOffRequired') }]}
            >
              <TimePicker
                format="HH:mm"
                style={{ width: '100%' }}
                disabled={isDetailMode || isFlex}
                placeholder={isFlex ? t('attendance.shiftFlexElastic') : t('common.pleaseSelect')}
              />
            </Form.Item>
            <Form.Item
              label={t('attendance.shiftWorkHours')}
              name="workHours"
              rules={[{ required: true, message: t('attendance.shiftWorkHoursRequired') }]}
            >
              <InputNumber min={0.5} max={24} step={0.5} style={{ width: '100%' }} suffix={t('attendance.unitHour')} />
            </Form.Item>
            <Form.Item label={t('attendance.shiftRestStart')} name="restStart">
              <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder={t('common.placeholderSelect')} />
            </Form.Item>
            <Form.Item label={t('attendance.shiftRestEnd')} name="restEnd">
              <TimePicker format="HH:mm" style={{ width: '100%' }} placeholder={t('common.placeholderSelect')} />
            </Form.Item>
          </div>
          <Form.Item name="crossDay" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox disabled={isDetailMode || isFlex}>{t('attendance.shiftCrossDay')}</Checkbox>
          </Form.Item>
        </div>

        <div style={cardStyle}>
          <CardTitle icon={<ThunderboltOutlined />} color="#52c41a" bg="#f6ffed" title={t('common.colRemark')} />
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <RemarkTextArea placeholder={t('attendance.shiftRemarkPlaceholder')} />
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
