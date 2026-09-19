/**
 * 供應商管理 新增/編輯獨立表單頁
 *
 * - 編碼由系統自動生成（CGSJ + 6位全局自增，後端 BizSeqService 統一生成），
 *   新增時不可填寫，編輯時只讀展示，均不可修改
 * - 聯繫人改為動態列表（可增刪行），每行含姓名 + 電話 + 啟用開關 + 刪除按鈕
 * - 底部「取消 + 保存」（全局表單規範）
 */
import { useState, useEffect } from 'react'
import {
  Button, Form, Input, Spin, message, Space, Switch, Modal, Row, Col,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, ContactsOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchSupplierList, createSupplier, updateSupplier,
  fetchSupplierContacts,
  type SupplierSaveParams, type SupplierContactItem,
} from '../../../api/eam'

interface FormValues {
  /** 編碼：僅編輯時回填展示，不可修改；新增時由系統自動生成 */
  code?: string
  name: string
  bankName?: string
  bankAccount?: string
  remark?: string
}

interface Props {
  id?: number
  onBack: () => void
}

export default function SupplierForm({ id, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)

  /* ── 聯繫人動態列表 ── */
  const [contacts, setContacts] = useState<SupplierContactItem[]>([])

  useEffect(() => {
    let alive = true
    if (isEdit && id) {
      setLoading(true)
      Promise.all([
        fetchSupplierList(),
        fetchSupplierContacts(id),
      ])
        .then(([list, contactList]) => {
          if (!alive) return
          const cur = list.find((s) => s.id === id)
          if (cur) {
            form.setFieldsValue({
              code: cur.code,
              name: cur.name,
              bankName: cur.bankName,
              bankAccount: cur.bankAccount,
              remark: cur.remark,
            })
          }
          setContacts(contactList || [])
        })
        .catch((e: Error) => message.error(e.message))
        .finally(() => { if (alive) setLoading(false) })
    }
    return () => { alive = false }
  }, [form, id, isEdit])

  /* ── 聯繫人操作 ── */
  const addContact = () => {
    setContacts((prev) => [...prev, { contactName: '', contactPhone: '', status: 'enabled' }])
  }

  const updateContact = (index: number, patch: Partial<SupplierContactItem>) => {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }

  const removeContact = (index: number) => {
    const c = contacts[index]
    if (!c.contactName && !c.contactPhone) {
      // 空行直接刪除
      setContacts((prev) => prev.filter((_, i) => i !== index))
      return
    }
    Modal.confirm({
      title: t('asset.confirmDeleteContact'),
      content: `${c.contactName || t('asset.contactNameEmpty')}`,
      okText: t('common.confirm'),
      okButtonProps: { danger: true },
      cancelText: t('common.cancel'),
      onOk: () => setContacts((prev) => prev.filter((_, i) => i !== index)),
    })
  }

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      // 校驗聯繫人列表（至少有一行填寫了就必須姓名不為空）
      const validContacts = contacts.filter((c) => c.contactName?.trim() || c.contactPhone?.trim())
      const invalidContact = validContacts.find((c) => !c.contactName?.trim())
      if (invalidContact) {
        message.warning(t('asset.fillAllContactNames'))
        return
      }
      const payload: SupplierSaveParams = {
        name: v.name.trim(),
        bankName: v.bankName?.trim(),
        bankAccount: v.bankAccount?.trim(),
        remark: v.remark,
        contacts: validContacts.map((c) => ({
          contactName: c.contactName.trim(),
          contactPhone: c.contactPhone?.trim(),
          status: c.status || 'enabled',
        })),
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateSupplier(id, payload)
        message.success(t('common.updateSuccess'))
      } else {
        await createSupplier(payload)
        message.success(t('common.addSuccess'))
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Spin spinning={loading}>
      {/* ====== 頂部標題欄（橙色漸變頂條） ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
            style={{ backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36, padding: '0 16px', boxShadow: '0 2px 6px rgba(232,114,12,0.25)' }}
          >{t('common.back')}</Button>
          <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
            {isEdit ? t('asset.editSupplierTitle') : t('asset.addSupplierTitle')}
          </h2>
        </div>
      </div>

      {/* ====== 基本信息 ====== */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ContactsOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.basicInfoTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <Form<FormValues> form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                label={t('asset.codeLabel')}
                name="code"
                extra={t('asset.codeAutoGenHint')}
              >
                <Input
                  disabled
                  placeholder={isEdit ? '' : t('asset.autoGenAfterSave')}
                  style={{ fontFamily: 'monospace', color: '#595959' }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                label={t('asset.supplierNameLabel')} name="name"
                rules={[{ required: true, message: t('asset.supplierNamePh') }]}
              >
                <Input placeholder={t('asset.supplierNamePh')} allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label={t('asset.bankNameLabel')} name="bankName">
                <Input placeholder={t('asset.bankNamePh')} allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label={t('asset.bankAccountLabel')} name="bankAccount">
                <Input placeholder={t('asset.bankAccountPh')} allowClear style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label={t('asset.colRemark')} name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea
              placeholder={t('asset.remarkPh')}
              maxLength={300}
              showCount
              rows={4}
            />
          </Form.Item>
        </Form>
      </div>

      {/* ====== 聯繫人列表 ====== */}
      <div style={{
        border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
        padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ContactsOutlined style={{ fontSize: 14, color: '#52c41a' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('asset.contactInfoTitle')}</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>{t('asset.multiContactHint')}</span>
        </div>

        {contacts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#bfbfbf', fontSize: 13 }}>
            {t('asset.noContactYet')}
          </div>
        )}

        {contacts.map((c, idx) => (
          <div key={idx} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 80px 40px', gap: 12,
            alignItems: 'start', marginBottom: 12,
            padding: '12px 16px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0',
          }}>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{t('asset.contactNameLabel')}</div>
              <Input
                value={c.contactName}
                onChange={(e) => updateContact(idx, { contactName: e.target.value })}
                placeholder={t('asset.contactNamePh')}
                allowClear
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{t('asset.contactPhoneLabel')}</div>
              <Input
                value={c.contactPhone}
                onChange={(e) => updateContact(idx, { contactPhone: e.target.value })}
                placeholder={t('asset.contactPhonePh')}
                allowClear
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{t('asset.enableLabel')}</div>
              <Switch
                checked={c.status !== 'disabled'}
                onChange={(checked) => updateContact(idx, { status: checked ? 'enabled' : 'disabled' })}
                size="small"
              />
            </div>
            <div style={{ paddingTop: 20 }}>
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => removeContact(idx)}
              />
            </div>
          </div>
        ))}

        <Button type="dashed" icon={<PlusOutlined />} onClick={addContact} style={{ width: '100%' }}>
          {t('asset.addContactBtn')}
        </Button>
      </div>

      {/* ====== 底部操作欄 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
