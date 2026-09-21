/**
 * 遺失單詳情頁
 *
 * 分區展示：處理狀態、資產/持有快照、報失信息、找回與驗收、關聯單據、操作日誌
 * 根據狀態顯示不同操作按鈕：尋找中→編輯/找回/核銷/跟進，待驗收→驗收處置
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Descriptions, Tag, Timeline, Spin, Modal, Form, Input, DatePicker, Select, message,
} from 'antd'
import {
  EditOutlined, SearchOutlined, StopOutlined, PlusCircleOutlined, CheckCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import DetailPageHeader from '../../../components/DetailPageHeader'
import {
  fetchLossDetail, updateLoss, recoverLoss, inspectLoss, writeOffLoss, addLossEvent,
  type LossRow, type LossUpdateDTO,
} from '../../../api/eamLoss'

interface Props {
  lossId: number
  onBack: () => void
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  searching: { color: 'orange', label: '尋找中' },
  found_pending: { color: 'blue', label: '待驗收' },
  recovered: { color: 'green', label: '已找回' },
  written_off: { color: 'default', label: '已核銷' },
}

const EVENT_TYPE_MAP: Record<string, string> = {
  create: '登記遺失',
  edit: '修改資料',
  recover: '登記找回',
  inspect: '驗收處置',
  write_off: '遺失核銷',
  follow_up: '跟進記錄',
  compensation_linked: '關聯賠付',
}

const INSPECTION_MAP: Record<string, string> = {
  normal: '正常歸位',
  damaged: '轉維修',
  scrapped: '實物報廢',
}

const detailCardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

export default function LossDetail({ lossId, onBack }: Props) {
  const [loss, setLoss] = useState<LossRow | null>(null)
  const [loading, setLoading] = useState(false)

  // 弹窗状态
  const [editOpen, setEditOpen] = useState(false)
  const [recoverOpen, setRecoverOpen] = useState(false)
  const [inspectOpen, setInspectOpen] = useState(false)
  const [writeOffOpen, setWriteOffOpen] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [editForm] = Form.useForm()
  const [recoverForm] = Form.useForm()
  const [inspectForm] = Form.useForm()
  const [writeOffForm] = Form.useForm()
  const [eventForm] = Form.useForm()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchLossDetail(lossId)
      setLoss(data)
    } catch {
      message.error('加載遺失單失敗')
    } finally {
      setLoading(false)
    }
  }, [lossId])

  useEffect(() => { loadData() }, [loadData])

  const reload = () => { loadData() }

  /* ---- 编辑 ---- */
  const handleEdit = async () => {
    try {
      const values = await editForm.validateFields()
      setSubmitting(true)
      const dto: LossUpdateDTO = {
        lossDate: values.lossDate.format('YYYY-MM-DD'),
        lossReason: values.lossReason,
        lastKnownLocation: values.lastKnownLocation,
        changeReason: values.changeReason,
      }
      await updateLoss(lossId, dto)
      message.success('修改成功')
      setEditOpen(false)
      reload()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || '修改失敗')
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- 找回 ---- */
  const handleRecover = async () => {
    try {
      const values = await recoverForm.validateFields()
      setSubmitting(true)
      await recoverLoss(lossId, {
        recoveredDate: values.recoveredDate.format('YYYY-MM-DD'),
        recoveredLocation: values.recoveredLocation,
        recoveredNote: values.recoveredNote,
      })
      message.success('找回登記成功')
      setRecoverOpen(false)
      reload()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || '登記失敗')
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- 验收 ---- */
  const handleInspect = async () => {
    try {
      const values = await inspectForm.validateFields()
      setSubmitting(true)
      await inspectLoss(lossId, {
        inspectionResult: values.inspectionResult,
        inspectionDate: values.inspectionDate.format('YYYY-MM-DD'),
        inspectionNote: values.inspectionNote,
        receiveDepartment: values.receiveDepartment,
      })
      message.success('驗收處置成功')
      setInspectOpen(false)
      reload()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || '驗收失敗')
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- 核销 ---- */
  const handleWriteOff = async () => {
    try {
      const values = await writeOffForm.validateFields()
      setSubmitting(true)
      await writeOffLoss(lossId, {
        writeOffDate: values.writeOffDate.format('YYYY-MM-DD'),
        writeOffReason: values.writeOffReason,
      })
      message.success('核銷成功')
      setWriteOffOpen(false)
      reload()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || '核銷失敗')
    } finally {
      setSubmitting(false)
    }
  }

  /* ---- 跟进 ---- */
  const handleAddEvent = async () => {
    try {
      const values = await eventForm.validateFields()
      setSubmitting(true)
      await addLossEvent(lossId, { eventDesc: values.eventDesc })
      message.success('跟進記錄已添加')
      setEventOpen(false)
      eventForm.resetFields()
      reload()
    } catch (err: any) {
      if (err?.errorFields) return
      message.error(err?.response?.data?.message || '添加失敗')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !loss) {
    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
  }

  const statusInfo = STATUS_MAP[loss.status] || { color: 'default', label: loss.status }
  const isSearching = loss.status === 'searching'
  const isFoundPending = loss.status === 'found_pending'

  // 操作按钮
  const headerExtra = (
    <div style={{ display: 'flex', gap: 8 }}>
      {isSearching && (
        <>
          <Button icon={<EditOutlined />} onClick={() => {
            editForm.setFieldsValue({
              lossDate: loss.lossDate ? dayjs(loss.lossDate) : null,
              lossReason: loss.lossReason,
              lastKnownLocation: loss.lastKnownLocation,
            })
            setEditOpen(true)
          }}>修改資料</Button>
          <Button type="primary" icon={<SearchOutlined />} onClick={() => {
            recoverForm.setFieldsValue({ recoveredDate: dayjs() })
            setRecoverOpen(true)
          }}>登記找回</Button>
          <Button icon={<PlusCircleOutlined />} onClick={() => setEventOpen(true)}>追加跟進</Button>
          <Button danger icon={<StopOutlined />} onClick={() => {
            writeOffForm.setFieldsValue({ writeOffDate: dayjs() })
            setWriteOffOpen(true)
          }}>遺失核銷</Button>
        </>
      )}
      {isFoundPending && (
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => {
          inspectForm.setFieldsValue({ inspectionDate: dayjs() })
          setInspectOpen(true)
        }}>驗收處置</Button>
      )}
    </div>
  )

  return (
    <>
      <DetailPageHeader
        title={`遺失單 ${loss.lossNo}`}
        tags={<Tag color={statusInfo.color}>{statusInfo.label}</Tag>}
        meta={`${loss.assetNo} · ${loss.originalHolderName || '-'} · ${loss.createdAt}`}
        onBack={onBack}
        extra={headerExtra}
      />

      {/* 基本信息 */}
      <div style={detailCardStyle}>
        <h4 style={{ marginBottom: 16, fontWeight: 600, fontSize: 15 }}>報失信息</h4>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="遺失單號">{loss.lossNo}</Descriptions.Item>
          <Descriptions.Item label="來源">{loss.sourceType === 'return' ? '歸還驗收' : loss.sourceType === 'direct' ? '主動報失' : loss.sourceType}</Descriptions.Item>
          <Descriptions.Item label="登記人">{loss.reporterName || '-'}</Descriptions.Item>
          <Descriptions.Item label="未結天數">{loss.openDays != null ? `${loss.openDays} 天` : '-'}</Descriptions.Item>
          <Descriptions.Item label="遺失日期">{loss.lossDate || '-'}</Descriptions.Item>
          <Descriptions.Item label="遺失原因" span={3}>{loss.lossReason || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* 资产/持有快照 */}
      <div style={detailCardStyle}>
        <h4 style={{ marginBottom: 16, fontWeight: 600, fontSize: 15 }}>資產與持有人快照</h4>
        <Descriptions column={4} size="small">
          <Descriptions.Item label="資產編號">{loss.assetNo}</Descriptions.Item>
          <Descriptions.Item label="資產名稱">{loss.assetName}</Descriptions.Item>
          <Descriptions.Item label="品牌">{loss.brand || '-'}</Descriptions.Item>
          <Descriptions.Item label="分類">{loss.assetType || '-'}</Descriptions.Item>
          <Descriptions.Item label="原持有人">{loss.originalHolderName || '-'}</Descriptions.Item>
          <Descriptions.Item label="原部門">{loss.originalDepartment || '-'}</Descriptions.Item>
          <Descriptions.Item label="最後已知位置" span={2}>{loss.lastKnownLocation || '-'}</Descriptions.Item>
        </Descriptions>
      </div>

      {/* 找回信息 */}
      {loss.recoveredDate && (
        <div style={detailCardStyle}>
          <h4 style={{ marginBottom: 16, fontWeight: 600, fontSize: 15 }}>找回信息</h4>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="找回日期">{loss.recoveredDate}</Descriptions.Item>
            <Descriptions.Item label="找回地點">{loss.recoveredLocation || '-'}</Descriptions.Item>
            <Descriptions.Item label="找回登記人">{loss.recoveredByName || '-'}</Descriptions.Item>
            <Descriptions.Item label="找回說明">{loss.recoveredNote || '-'}</Descriptions.Item>
          </Descriptions>
        </div>
      )}

      {/* 验收信息 */}
      {loss.inspectionResult && (
        <div style={detailCardStyle}>
          <h4 style={{ marginBottom: 16, fontWeight: 600, fontSize: 15 }}>驗收處置</h4>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="驗收結果">{INSPECTION_MAP[loss.inspectionResult] || loss.inspectionResult}</Descriptions.Item>
            <Descriptions.Item label="驗收日期">{loss.inspectionDate || '-'}</Descriptions.Item>
            <Descriptions.Item label="驗收說明" span={2}>{loss.inspectionNote || '-'}</Descriptions.Item>
          </Descriptions>
        </div>
      )}

      {/* 核销信息 */}
      {loss.writeOffDate && (
        <div style={detailCardStyle}>
          <h4 style={{ marginBottom: 16, fontWeight: 600, fontSize: 15 }}>核銷信息</h4>
          <Descriptions column={4} size="small">
            <Descriptions.Item label="核銷日期">{loss.writeOffDate}</Descriptions.Item>
            <Descriptions.Item label="核銷原因" span={3}>{loss.writeOffReason || '-'}</Descriptions.Item>
          </Descriptions>
        </div>
      )}

      {/* 关联单据 */}
      {(loss.compensationId || loss.repairId || loss.scrapId) && (
        <div style={detailCardStyle}>
          <h4 style={{ marginBottom: 16, fontWeight: 600, fontSize: 15 }}>關聯單據</h4>
          <Descriptions column={4} size="small">
            {loss.compensationId && <Descriptions.Item label="賠付單">{loss.compensationNo || `#${loss.compensationId}`}</Descriptions.Item>}
            {loss.repairId && <Descriptions.Item label="維修記錄">#{loss.repairId}</Descriptions.Item>}
            {loss.scrapId && <Descriptions.Item label="報廢記錄">#{loss.scrapId}</Descriptions.Item>}
          </Descriptions>
        </div>
      )}

      {/* 操作日志 */}
      <div style={detailCardStyle}>
        <h4 style={{ marginBottom: 16, fontWeight: 600, fontSize: 15 }}>操作日誌</h4>
        {loss.events && loss.events.length > 0 ? (
          <Timeline
            items={loss.events.map((e) => ({
              children: (
                <div>
                  <div style={{ fontWeight: 500 }}>
                    {EVENT_TYPE_MAP[e.eventType] || e.eventType}
                    <span style={{ color: '#8C8C8C', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>{e.createdAt}</span>
                    <span style={{ color: '#8C8C8C', fontWeight: 400, marginLeft: 8, fontSize: 12 }}>{e.operatorName}</span>
                  </div>
                  <div style={{ color: '#595959', fontSize: 13 }}>{e.eventDesc}</div>
                </div>
              ),
            }))}
          />
        ) : (
          <div style={{ color: '#8C8C8C' }}>暫無操作記錄</div>
        )}
      </div>

      {/* ---- 编辑弹窗 ---- */}
      <Modal title="修改遺失資料" open={editOpen} onCancel={() => setEditOpen(false)} onOk={handleEdit} confirmLoading={submitting} okText="保存">
        <Form form={editForm} layout="vertical">
          <Form.Item name="lossDate" label="遺失日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="lossReason" label="報失原因" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="lastKnownLocation" label="最後已知位置"><Input /></Form.Item>
          <Form.Item name="changeReason" label="修改原因" rules={[{ required: true, message: '請填寫修改原因' }]}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* ---- 找回弹窗 ---- */}
      <Modal title="登記找回" open={recoverOpen} onCancel={() => setRecoverOpen(false)} onOk={handleRecover} confirmLoading={submitting} okText="確認登記">
        <Form form={recoverForm} layout="vertical">
          <Form.Item name="recoveredDate" label="找回日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="recoveredLocation" label="找回地點"><Input /></Form.Item>
          <Form.Item name="recoveredNote" label="找回說明"><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      {/* ---- 验收弹窗 ---- */}
      <Modal title="驗收處置" open={inspectOpen} onCancel={() => setInspectOpen(false)} onOk={handleInspect} confirmLoading={submitting} okText="確認驗收">
        <Form form={inspectForm} layout="vertical">
          <Form.Item name="inspectionResult" label="驗收結果" rules={[{ required: true }]}>
            <Select options={[
              { value: 'normal', label: '正常歸位' },
              { value: 'damaged', label: '轉維修' },
              { value: 'scrapped', label: '實物報廢' },
            ]} />
          </Form.Item>
          <Form.Item name="inspectionDate" label="驗收日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="receiveDepartment" label="接收部門（正常歸位時必填）"><Input /></Form.Item>
          <Form.Item name="inspectionNote" label="驗收說明"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* ---- 核销弹窗 ---- */}
      <Modal title="遺失核銷" open={writeOffOpen} onCancel={() => setWriteOffOpen(false)} onOk={handleWriteOff} confirmLoading={submitting} okText="確認核銷" okButtonProps={{ danger: true }}>
        <Form form={writeOffForm} layout="vertical">
          <Form.Item name="writeOffDate" label="核銷日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="writeOffReason" label="核銷原因" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>

      {/* ---- 跟进弹窗 ---- */}
      <Modal title="追加跟進" open={eventOpen} onCancel={() => setEventOpen(false)} onOk={handleAddEvent} confirmLoading={submitting} okText="保存">
        <Form form={eventForm} layout="vertical">
          <Form.Item name="eventDesc" label="跟進描述" rules={[{ required: true, message: '請填寫跟進描述' }]}>
            <Input.TextArea rows={4} placeholder="記錄查找進展、線索等信息" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
