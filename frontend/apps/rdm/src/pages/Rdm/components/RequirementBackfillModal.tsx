import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert, DatePicker, Modal } from 'antd'
import type { Dayjs } from 'dayjs'
import RemarkTextArea from '@/components/RemarkTextArea'
import EmployeeSelect from '@/components/EmployeeSelect'

/**
 * 存量導入需求批量補錄受理信息彈窗。
 *
 * <p>為什麼需要補錄而不是「把狀態改回去」：導入時已生成 approved PRD，
 * 回退狀態會出現「狀態說還沒寫 PRD、庫裡卻有定稿 PRD」的矛盾；
 * 這裡只補「承諾出 PRD 日期 + 產品任務」，需求狀態保持不變。
 *
 * <p>校驗只是 UX 攔截：狀態範圍、產品經理資格、冪等全部由服務端重新判定，
 * 前端隱藏/禁用不構成安全邊界。
 */
export interface RequirementBackfillPayload {
  /** 承諾出 PRD 日期（YYYY-MM-DD） */
  promisedPrdDate: string
  /** 補齊/改派的產品經理；留空沿用需求現有受理人 */
  pmUserId?: number
  remark?: string
}

interface RequirementBackfillModalProps {
  open: boolean
  /** 當前勾選條數（僅用於展示） */
  count: number
  saving: boolean
  onClose: () => void
  onSubmit: (payload: RequirementBackfillPayload) => void | Promise<void>
}

export default function RequirementBackfillModal({
  open,
  count,
  saving,
  onClose,
  onSubmit,
}: RequirementBackfillModalProps) {
  const { t } = useTranslation()
  const [promisedDate, setPromisedDate] = useState<Dayjs | null>(null)
  const [pmUserId, setPmUserId] = useState<number>()
  const [remark, setRemark] = useState('')

  // 每次打开重置：上一批的日期/选人不能带到下一批，否则容易把 A 批的承诺日写到 B 批
  useEffect(() => {
    if (open) {
      setPromisedDate(null)
      setPmUserId(undefined)
      setRemark('')
    }
  }, [open])

  const submit = () => {
    if (!promisedDate) {
      return
    }
    void onSubmit({
      promisedPrdDate: promisedDate.format('YYYY-MM-DD'),
      pmUserId,
      remark: remark.trim() || undefined,
    })
  }

  return (
    <Modal
      title={t('rdm.batchBackfill.title')}
      open={open}
      onCancel={onClose}
      onOk={submit}
      okText={t('rdm.batchBackfill.confirm')}
      cancelText={t('rdm.batchBackfill.cancel')}
      confirmLoading={saving}
      okButtonProps={{ disabled: !promisedDate }}
      destroyOnHidden
      width={520}
    >
      <div className="confirm-info-card" style={{ marginBottom: 16 }}>
        <div className="confirm-info-row">
          <span>{t('rdm.batchBackfill.selected')}</span>
          <b>{t('rdm.batchBackfill.count', { count })}</b>
        </div>
      </div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={t('rdm.batchBackfill.scopeHint')}
      />
      <div className="rdm-action-modal-label">{t('rdm.batchBackfill.promisedDate')}</div>
      <DatePicker
        style={{ width: '100%' }}
        value={promisedDate}
        onChange={setPromisedDate}
        placeholder={t('rdm.batchBackfill.promisedDatePlaceholder')}
      />
      <div className="rdm-action-modal-label" style={{ marginTop: 12 }}>{t('rdm.batchBackfill.pm')}</div>
      <EmployeeSelect
        single
        value={pmUserId}
        onChange={ids => setPmUserId(ids[0])}
        placeholder={t('rdm.batchBackfill.pmPlaceholder')}
        style={{ width: '100%' }}
      />
      <div className="rdm-action-modal-label" style={{ marginTop: 12 }}>{t('rdm.batchBackfill.remark')}</div>
      <RemarkTextArea
        placeholder={t('rdm.batchBackfill.remarkPlaceholder')}
        value={remark}
        onChange={e => setRemark(e.target.value)}
      />
      <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 8 }}>
        {t('rdm.batchBackfill.hint')}
      </div>
    </Modal>
  )
}
