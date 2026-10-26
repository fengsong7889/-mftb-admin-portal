/**
 * 手动加入黑名单（独立页面，路由 /meeting-blacklist-form）。
 *
 * <p>为什么是独立页面而不是弹窗（§9.1）：这是"限制某人预约权限"的处置动作，
 * 需要写清原因、选择限制天数，还要逐人给出结论；弹窗里既看不到列表上下文，
 * 也无法把这条处置的入口链接发给另一位行政复核。
 *
 * <p>逐人写入而不是批量接口：每个人的"已在限制期内"要单独给出结论，
 * 一次批量提交里混进一个重复就整批失败，反而更难用。
 */
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Button, Form, InputNumber, Modal, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined, StopOutlined } from '@ant-design/icons'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import RemarkTextArea from '@/components/RemarkTextArea'
import { addBlacklist } from '@/api/meeting'
import EmployeeSelect from '@/components/EmployeeSelect'
import { useTranslation } from 'react-i18next'

const MENU = 'meeting-config'

const cardStyle: CSSProperties = {
  border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
  padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }

interface FormValues {
  userIds: number[]
  days: number
  reason: string
}

export default function MeetingBlacklistForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { hasPermission } = useAuth()
  const canEdit = hasPermission(`${MENU}:edit`)
  const [form] = Form.useForm<FormValues>()
  const [submitting, setSubmitting] = useState(false)
  /** 逐人写入的结果：谁成功、谁已在限制期内，必须分开说清楚 */
  const [results, setResults] = useState<{ ok: string[]; failed: string[] }>({ ok: [], failed: [] })

  const goBack = () => {
    navigate('/meeting-config', { replace: true, state: { closeMenuTab: location.pathname + location.search } })
  }

  const handleSubmit = async () => {
    if (!canEdit || submitting) return
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return // antd 已在字段下方标出原因
    }
    // §B.3：拉黑属于“限制他人预约权”的高影响提交动作，必须走统一二次确认（校验 → 弹框 → 接口）
    Modal.confirm({
      title: t('meeting.confirmAddBlacklist', {
        count: values.userIds.length,
        defaultValue: `確定要為 ${values.userIds.length} 人建立預約限制？`,
      }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('meeting.confirmAdd', { defaultValue: '確認新增' }),
      cancelText: t('common.cancel', { defaultValue: '取消' }),
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>{t('meeting.restrictedPerson', { defaultValue: '被限制人員' })}：</span><b>{t('meeting.headcount', { count: values.userIds.length, defaultValue: '{{count}} 人' })}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.restrictionDays', { defaultValue: '限制天數' })}：</span><b>{t('meeting.daysCount', { count: values.days, defaultValue: '{{count}} 天' })}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.reason', { defaultValue: '原因' })}：</span><b>{values.reason.trim()}</b></div>
          <div className="confirm-info-row"><span>{t('meeting.impact', { defaultValue: '影響：' })}</span><b>{t('meeting.blacklistImpactConfirm', { defaultValue: '限制期間這些人無法新建或改期預約，到期自動失效' })}</b></div>
        </div>
      ),
      onOk: () => writeBlacklist(values),
    })
  }

  /** 逐人写入并汇总结果 */
  const writeBlacklist = async (values: FormValues) => {
    setSubmitting(true)
    setResults({ ok: [], failed: [] })
    const ok: string[] = []
    const failed: string[] = []
    for (const userId of values.userIds) {
      try {
        await addBlacklist({ userId, reason: values.reason.trim(), days: values.days })
        ok.push(String(userId))
      } catch (e) {
        // request.ts 已弹出具体原因（如"该员工已在限制期内"），这里只收集结果做汇总
        failed.push(e instanceof Error ? (e.message || String(userId)) : String(userId))
      }
    }
    setResults({ ok, failed })
    setSubmitting(false)
    if (ok.length > 0 && failed.length === 0) {
      message.success(t('meeting.blacklistAddedCount', { count: ok.length, defaultValue: '已新增 {{count}} 條限制記錄' }))
      form.resetFields()
    } else if (ok.length > 0) {
      message.warning(t('meeting.blacklistPartialResult', {
        added: ok.length, failedCount: failed.length,
        defaultValue: `已新增 ${ok.length} 條，${failed.length} 條未成功（原因見下方清單）`,
      }))
    } else {
      message.error(t('meeting.nothingWasAddedSee', { defaultValue: '未新增任何限制記錄，請檢查下方原因' }))
    }
  }

  return (
    <div className="content-area">
      {/* 页面头部（§C.2）：橙色渐变顶条 + 返回 + 标题，头部不放保存按钮 */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={goBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
                padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
              }}>{t('meeting.back', { defaultValue: '返回' })}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>{t('meeting.addToBlacklist', { defaultValue: '手動加入黑名單' })}</h2>
          </div>
        </div>
      </div>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('meeting.whileRestrictedThisEmployee', { defaultValue: '被限制期間該員工無法新建或改期預約' })}
        description={t('meeting.onlyBookingAndRescheduling', { defaultValue: '只影響新建與改期；已有會議與其簽到不受影響，需要一併處理請到「預約記錄」代取消。到期後由日期自動失效，不需人工解除。' })}
      />

      <Form form={form} layout="vertical" disabled={!canEdit || submitting} initialValues={{ days: 7 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6, background: '#fff1f0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <StopOutlined style={{ fontSize: 14, color: '#FF4D4F' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('meeting.restrictionTargetPeriod', { defaultValue: '限制對象與期限' })}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('meeting.multiplePeopleEachIs', { defaultValue: '可多選，逐人寫入並分別給出結論' })}</span>
          </div>
          <Form.Item label={t('meeting.restrictedPerson', { defaultValue: '被限制人員' })} name="userIds" rules={[{ required: true, message: t('meeting.pleaseSelectPeople', { defaultValue: '請選擇人員' }) }]}
            extra={t('meeting.searchByNameOr2', { defaultValue: '搜尋姓名或工號，可多選' })}>
            <EmployeeSelect placeholder={t('meeting.searchByNameOr3', { defaultValue: '搜尋姓名或工號（可多選）' })} />
          </Form.Item>
          <div style={gridStyle}>
            <Form.Item label={t('meeting.restrictionDays', { defaultValue: '限制天數' })} name="days" rules={[{ required: true, message: t('meeting.pleaseEnterTheNumber', { defaultValue: '請填寫天數' }) }]}
              extra={t('meeting.countedFromTodayExpires', { defaultValue: '自今日起算，到期自動失效' })}>
              <InputNumber min={1} max={365} style={{ width: '100%' }} addonAfter={t('meeting.days', { defaultValue: '天' })} />
            </Form.Item>
          </div>
          {/* 原因独占一整行（§C.4.1）：这是处置凭据，写不下就等于没写 */}
          <Form.Item label={t('meeting.reason', { defaultValue: '原因' })} name="reason" rules={[
            { required: true, message: t('meeting.pleaseEnterTheReason', { defaultValue: '請填寫原因' }) },
            { max: 200, message: t('meeting.reasonCannotExceed200', { defaultValue: '原因不得超過 200 字' }) },
          ]}>
            <RemarkTextArea placeholder={t('meeting.eGThreeBookings', { defaultValue: '例：連續三次預約後未到場且未取消' })} maxLength={200} />
          </Form.Item>
        </div>
      </Form>

      {/* 逐人写入结果：成功与失败分开列，避免"提交了一次却不知道谁没生效" */}
      {(results.ok.length > 0 || results.failed.length > 0) && (
        <div style={{ ...cardStyle, background: '#FAFAFA', border: '1px solid #f0f0f0', boxShadow: 'none' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>{t('meeting.writeResult', { defaultValue: '本次寫入結果' })}</div>
          <div style={{ fontSize: 12, color: '#52C41A', marginBottom: 4 }}>
            {t('meeting.successCount', { count: results.ok.length, defaultValue: '成功 {{count}} 條' })}
          </div>
          {results.failed.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#FF4D4F', lineHeight: 1.9 }}>
              {results.failed.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* 底部操作栏（§C.5） */}
      <div className="form-footer">
        <Button onClick={goBack}>{t('meeting.back', { defaultValue: '返回' })}</Button>
        {canEdit && (
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={() => void handleSubmit()}>
            {t('meeting.confirmAdd', { defaultValue: '確認新增' })}
          </Button>
        )}
      </div>
    </div>
  )
}
