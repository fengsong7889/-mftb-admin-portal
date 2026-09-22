/**
 * 耗材领用 独立表单页
 *
 * 遵循 form-page-style 规范：橙色渐变顶条 + 返回 + 模块卡片 + 底部操作栏
 * 明细为动态行（耗材 + 数量 + 出库仓库），提交前 custom-confirm-modal 二次确认
 * 支持管理员/物资部代员工领用（选择领用人），也支持员工自己领用
 */
import { useState, useEffect, useMemo } from 'react'
import { Button, Form, Input, InputNumber, Select, Modal, message, Space } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import {
  fetchConsumableItemOptions, submitConsumableClaim, type ConsumableItem,
} from '../../../api/consumable'
import { fetchLocationList, type AssetLocation } from '../../../api/eam'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { useAuth } from '../../../contexts/AuthContext'

interface LineForm {
  itemId?: number
  qty?: number
  locationId?: number
}
interface FormValues {
  applicantId?: number
  reason: string
  remark?: string
  items: LineForm[]
}

interface Props {
  onBack: () => void
}

export default function ClaimForm({ onBack }: Props) {
  const { user } = useAuth()
  const [form] = Form.useForm<FormValues>()
  const [items, setItems] = useState<ConsumableItem[]>([])
  const [locations, setLocations] = useState<AssetLocation[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [employeeLoading, setEmployeeLoading] = useState(false)

  useEffect(() => {
    fetchConsumableItemOptions().then(setItems).catch((e: Error) => message.error(e.message))
    fetchLocationList().then(setLocations).catch(() => { /* 仓库可空，降级为空列表 */ })
    // 加载员工选项（applicantId = sys_user 主键 id）
    setEmployeeLoading(true)
    fetchEmployees({ page: 1, size: 200, employmentStatus: 'active' }).then((res) => {
      const list = res.records || []
      setEmployees(list)
      // 默认选中当前登录人（按工号匹配）
      const me = user?.empId ? list.find(e => e.empId === user.empId) : undefined
      if (me) form.setFieldsValue({ applicantId: me.id })
    }).catch(() => { /* 忽略 */ }).finally(() => setEmployeeLoading(false))
  }, [form, user?.empId])

  const applicantOptions = employees.map(e => {
    const extra = [e.department, e.position].filter(Boolean).join(' / ')
    return { label: `${e.name}（${e.empId}）${extra ? ' · ' + extra : ''}`, value: e.id }
  })

  const itemOptions = items.map(it => ({
    label: `${it.name}${it.spec ? ' / ' + it.spec : ''}（可用 ${it.availableQty} ${it.unit}）`,
    value: it.id,
  }))
  const locationOptions = locations.map(l => ({ label: l.name, value: l.id }))

  const findItem = (id?: number) => items.find(it => it.id === id)

  const doSubmit = async (values: FormValues) => {
    const payload = {
      applicantId: values.applicantId ?? undefined,
      reason: values.reason.trim(),
      remark: values.remark,
      items: values.items
        .filter(l => l && l.itemId != null && (l.qty ?? 0) > 0)
        .map(l => ({ itemId: l.itemId as number, qty: l.qty as number, locationId: l.locationId ?? 0 })),
    }
    if (payload.items.length === 0) {
      message.warning('請至少添加一項耗材')
      return
    }
    setSubmitting(true)
    try {
      await submitConsumableClaim(payload)
      message.success('領用已提交，待倉管發放')
      onBack()
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '提交失敗')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      return // 校验失败，antd 已提示
    }
    const lines = (values.items || []).filter(l => l && l.itemId != null && (l.qty ?? 0) > 0)
    const totalQty = lines.reduce((s, l) => s + (l.qty ?? 0), 0)
    const applicantName = employees.find(e => e.id === values.applicantId)?.name ?? '当前登録人'
    Modal.confirm({
      title: '確認領用？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>領用人：</span><b>{applicantName}</b></div>
          <div className="confirm-info-row"><span>明細數量：</span><b>{lines.length} 項 / 共 {totalQty}</b></div>
          <div className="confirm-info-row"><span>領用事由：</span><b>{values.reason}</b></div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#8C8C8C' }}>提交後進入待發放，倉管確認發放時扣減庫存並結轉實際成本。</div>
        </div>
      ),
      okText: '確認領用',
      cancelText: '取消',
      onOk: () => doSubmit(values),
    })
  }

  return (
    <>
      {/* 顶部标题栏 */}
      <div style={{ position: 'relative', background: '#fff', marginBottom: 16, borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)', backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite' }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >返回</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#262626' }}>耗材領用</h2>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical" initialValues={{ items: [{}] }}>
        {/* 领用信息 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#1890ff' }}>📝</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>领用信息</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Form.Item label="領用人" name="applicantId" rules={[{ required: true, message: '請選擇領用人' }]}>
              <Select
                placeholder="請選擇領用人"
                showSearch
                optionFilterProp="label"
                loading={employeeLoading}
                options={applicantOptions}
              />
            </Form.Item>
            <Form.Item label="領用事由" name="reason" rules={[{ required: true, message: '請填寫領用事由' }]} style={{ marginBottom: 0 }}>
              <Input placeholder="如：日常辦公消耗補充" maxLength={200} />
            </Form.Item>
          </div>
          <Form.Item label="備註" name="remark" style={{ marginBottom: 0 }}>
            <Input placeholder="選填" allowClear maxLength={200} />
          </Form.Item>
        </div>

        {/* 领用明细 */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 14, color: '#FA8C16' }}>🧾</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>领用明细</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>

          <Form.List name="items">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '2.4fr 1fr 1.6fr 90px 40px', gap: 12, marginBottom: 12, alignItems: 'start' }}>
                    <Form.Item {...field} name={[field.name, 'itemId']} rules={[{ required: true, message: '選擇耗材' }]} style={{ marginBottom: 0 }}>
                      <Select placeholder="選擇耗材" showSearch optionFilterProp="label" options={itemOptions} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.items?.[field.name]?.itemId !== cur.items?.[field.name]?.itemId}>
                      {() => {
                        const it = findItem(form.getFieldValue(['items', field.name, 'itemId']))
                        const max = it ? (it.perClaimLimit > 0 ? Math.min(it.perClaimLimit, it.availableQty) : it.availableQty) : undefined
                        return (
                          <Form.Item {...field} name={[field.name, 'qty']} rules={[{ required: true, message: '數量' }]} style={{ marginBottom: 0 }}>
                            <InputNumber min={1} max={max && max > 0 ? max : undefined} precision={0} style={{ width: '100%' }} placeholder="數量" />
                          </Form.Item>
                        )
                      }}
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, 'locationId']} style={{ marginBottom: 0 }}>
                      <Select placeholder="請選擇出庫倉庫" allowClear options={locationOptions} />
                    </Form.Item>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.items?.[field.name]?.itemId !== cur.items?.[field.name]?.itemId}>
                      {() => {
                        const it = findItem(form.getFieldValue(['items', field.name, 'itemId']))
                        return (
                          <div style={{ fontSize: 12, color: '#8C8C8C', paddingTop: 6 }}>
                            {it ? `可用 ${it.availableQty}${it.perClaimLimit > 0 ? ` / 限領 ${it.perClaimLimit}` : ''}` : '—'}
                          </div>
                        )
                      }}
                    </Form.Item>
                    <Button type="text" danger icon={<DeleteOutlined />} disabled={fields.length <= 1}
                      onClick={() => remove(field.name)} style={{ marginTop: 2 }} />
                  </div>
                ))}
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({})}>添加明細</Button>
              </>
            )}
          </Form.List>
        </div>
      </Form>

      {/* 底部操作栏 */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" loading={submitting} onClick={handleSubmit}>確認領用</Button>
        </Space>
      </div>
    </>
  )
}
