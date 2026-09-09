/**
 * 仓库维护 新增/編輯獨立表單頁
 *
 * - 位置分三類：倉庫 / 樓層 / 辦公室（room 必須掛在 floor 或 warehouse 下）
 * - 底部「取消 + 保存」（全局表單規範）
 */
import { useState, useEffect } from 'react'
import {
  Button, Form, Input, Select, TreeSelect, Row, Col, Space, Spin, message,
} from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchLocationList, createLocation, updateLocation, type AssetLocation,
} from '../../../api/eam'
import { buildTree, toTreeSelectData, type TreeSelectNode } from '../eamUtils'

const TYPE_OPTIONS: { value: AssetLocation['type']; label: string }[] = [
  { value: 'warehouse', label: '倉庫' },
  { value: 'floor', label: '樓層' },
  { value: 'room', label: '辦公室' },
]

interface FormValues {
  name: string
  parentId?: number
  type: AssetLocation['type']
  address?: string
  remark?: string
}

interface Props {
  id?: number
  parentId?: number
  onBack: () => void
}

export default function LocationForm({ id, parentId, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [treeData, setTreeData] = useState<TreeSelectNode[]>([])
  const [existingCode, setExistingCode] = useState<string>('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchLocationList()
      .then((list) => {
        if (!alive) return
        setTreeData(toTreeSelectData(buildTree(list), isEdit && id ? [id] : []))
        if (isEdit && id) {
          const cur = list.find((l) => l.id === id)
          if (cur) {
            setExistingCode(cur.code)
            form.setFieldsValue({
              name: cur.name,
              parentId: cur.parentId || undefined,
              type: cur.type,
              address: cur.address,
              remark: cur.remark,
            })
          }
        } else {
          form.setFieldsValue({ parentId: parentId || undefined, type: 'warehouse' })
        }
      })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [form, id, isEdit, parentId])

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const payload = {
        code: isEdit ? existingCode : '__auto__',
        name: v.name.trim(),
        parentId: v.parentId || 0,
        type: v.type,
        sort: 1,
        address: v.address?.trim(),
        remark: v.remark,
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateLocation(id, payload)
        message.success(t('asset.updateSuccess'))
      } else {
        await createLocation(payload)
        message.success(t('asset.createSuccess'))
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
            {isEdit ? '編輯倉庫' : '新增倉庫'}
          </h2>
        </div>
      </div>

      {/* ====== 表單區 ====== */}
      <div style={{
        background: '#fff', borderRadius: 8, padding: 24,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}>
        <Form<FormValues> form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="編碼">
                <div style={{
                  padding: '4px 11px', background: '#f5f5f5', borderRadius: 6,
                  border: '1px solid #d9d9d9', color: '#8C8C8C', fontSize: 13,
                  fontFamily: 'monospace', lineHeight: '22px',
                }}>
                  {isEdit ? existingCode || '—' : '保存後自動生成'}
                </div>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="倉庫名稱" name="name"
                rules={[{ required: true, message: t('asset.nameRequired') }]}
              >
                <Input placeholder="請輸入倉庫名稱" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="位置類型" name="type"
                rules={[{ required: true }]}
              >
                <Select options={TYPE_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="上級倉庫" name="parentId">
                <TreeSelect
                  treeData={treeData}
                  placeholder="請選擇上級倉庫"
                  allowClear
                  treeDefaultExpandAll
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="倉庫地址" name="address">
                <Input placeholder="請輸入倉庫地址" allowClear />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="備註" name="remark">
                <Input placeholder="請輸入備註" allowClear maxLength={100} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
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
