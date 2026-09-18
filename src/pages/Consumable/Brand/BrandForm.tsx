/**
 * 耗材品牌 新增/编辑独立表单页
 *
 * 对齐资产分类表单页的布局规范：
 * - 顶部标题栏（橙色渐变动画条 + 返回按钮 + 标题）
 * - 模块卡片（图标 + 标题 + 表单字段）
 * - 底部操作栏（取消 + 保存）
 *
 * 编码规则：CB 前缀（CB01, CB02, CB03 ...）
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, Space, Spin, message, Select,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, TagOutlined,
} from '@ant-design/icons'
import {
  fetchConsumableBrandDetail, createConsumableBrand, updateConsumableBrand,
  fetchConsumableBrands,
} from '../../../api/consumable'

interface FormValues {
  code: string
  name: string
  nameEn?: string
  categoryType: 'ASSET' | 'CONSUMABLE' | 'BOTH'
  status: 'enabled' | 'disabled'
  remark?: string
}

interface Props {
  id?: number
  onBack: () => void
}

/** 生成耗材品牌编码（CB 前缀） */
function generateBrandCode(existingCodes: string[]): string {
  let maxSeq = 0
  for (const code of existingCodes) {
    if (code.startsWith('CB')) {
      const seq = parseInt(code.slice(2), 10)
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq
    }
  }
  return `CB${String(maxSeq + 1).padStart(2, '0')}`
}

const CATEGORY_TYPE_OPTIONS = [
  { label: '僅耗材', value: 'CONSUMABLE' },
  { label: '資產+耗材', value: 'BOTH' },
  { label: '僅資產', value: 'ASSET' },
]

export default function BrandForm({ id, onBack }: Props) {
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)

  const loadBrand = useCallback(async () => {
    if (!isEdit || !id) return null
    return fetchConsumableBrandDetail(id)
  }, [id, isEdit])

  useEffect(() => {
    let alive = true
    setLoading(true)

    if (isEdit && id) {
      loadBrand()
        .then((brand) => {
          if (!alive || !brand) return
          form.setFieldsValue({
            code: brand.code,
            name: brand.name,
            nameEn: brand.nameEn,
            categoryType: brand.categoryType,
            status: brand.status,
            remark: brand.remark,
          })
        })
        .catch((e: Error) => message.error(e.message))
        .finally(() => { if (alive) setLoading(false) })
    } else {
      // 新增模式：自动生成编码
      fetchConsumableBrands()
        .then((list) => {
          if (!alive) return
          const autoCode = generateBrandCode(list.map(b => b.code ?? ''))
          form.setFieldsValue({
            code: autoCode,
            status: 'enabled',
            categoryType: 'CONSUMABLE',
          })
        })
        .catch((e: Error) => message.error(e.message))
        .finally(() => { if (alive) setLoading(false) })
    }

    return () => { alive = false }
  }, [form, id, isEdit, loadBrand])

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const payload = {
        code: v.code?.trim(),
        name: v.name.trim(),
        nameEn: v.nameEn?.trim(),
        categoryType: v.categoryType,
        status: v.status || 'enabled',
        remark: v.remark,
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateConsumableBrand(id, payload)
        message.success('修改成功')
      } else {
        await createConsumableBrand(payload)
        message.success('新增成功')
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ── 样式 ── */
  const cardShellStyle: React.CSSProperties = {
    border: '1px solid #e8eaed', borderRadius: 8, background: '#fff',
    padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
  }

  const cardTitle = (icon: React.ReactNode, iconBg: string, title: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )

  return (
    <Spin spinning={loading}>
      {/* ====== 顶部标题栏 ====== */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={onBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C',
                borderRadius: 8, height: 36, padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? '編輯耗材品牌' : '新增耗材品牌'}
            </h2>
          </div>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical">
        {/* ====== 基本信息 ====== */}
        <div style={cardShellStyle}>
          {cardTitle(<TagOutlined style={{ fontSize: 14, color: '#FA8C16' }} />, '#FFF7E6', '基本信息')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="品牌編碼" name="code"
              rules={[{ required: true, message: '請填寫品牌編碼' }]}
            >
              <Input
                placeholder="系統自動生成"
                disabled={!isEdit}
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
            <Form.Item
              label="品牌名稱" name="name"
              rules={[{ required: true, message: '請填寫品牌名稱' }]}
            >
              <Input placeholder="如：得力" allowClear />
            </Form.Item>
            <Form.Item label="英文名" name="nameEn">
              <Input placeholder="如：Deli" allowClear />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="適用範圍" name="categoryType"
              rules={[{ required: true, message: '請選擇適用範圍' }]}
            >
              <Select options={CATEGORY_TYPE_OPTIONS} />
            </Form.Item>
            <Form.Item label="狀態" name="status">
              <Select>
                <Select.Option value="enabled">啟用</Select.Option>
                <Select.Option value="disabled">停用</Select.Option>
              </Select>
            </Form.Item>
          </div>
          <Form.Item label="備註" name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea
              placeholder="選填"
              maxLength={300}
              showCount
              rows={4}
            />
          </Form.Item>
        </div>
      </Form>

      {/* ====== 底部操作栏 ====== */}
      <div className="form-footer">
        <Space>
          <Button onClick={onBack}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            保存
          </Button>
        </Space>
      </div>
    </Spin>
  )
}
