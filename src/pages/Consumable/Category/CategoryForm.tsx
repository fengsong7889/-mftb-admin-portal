/**
 * 耗材分类 新增/编辑独立表单页
 *
 * 完全对齐资产分类（AssetCategory/CategoryForm.tsx）的布局规范：
 * - 顶部标题栏（橙色渐变动画条 + 返回按钮 + 标题）
 * - 模块卡片（图标 + 标题 + 表单字段）
 * - 底部操作栏（取消 + 保存）
 *
 * 编码规则：HC 前缀 + 分层递进（HC01, HC01-01, HC01-01-01）
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, TreeSelect, Space, Spin, message, Select,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, FolderOutlined,
} from '@ant-design/icons'
import {
  fetchConsumableCategories, createConsumableCategory, updateConsumableCategory,
  type ConsumableCategory,
} from '../../../api/consumable'
import { buildTree, toTreeSelectData } from '../../AssetManagement/eamUtils'
import { generateConsumableCategoryCode } from '../../../utils/generateCode'

interface FormValues {
  code: string
  name: string
  parentId?: number
  status: 'enabled' | 'disabled'
  remark?: string
}

interface Props {
  id?: number
  parentId?: number
  onBack: () => void
}

export default function CategoryForm({ id, parentId, onBack }: Props) {
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [treeData, setTreeData] = useState<ReturnType<typeof toTreeSelectData>>([])
  const [existingCodes, setExistingCodes] = useState<string[]>([])
  const [idToCode, setIdToCode] = useState<Map<number, string>>(new Map())

  const loadOptions = useCallback(async () => {
    const list = await fetchConsumableCategories()
    const tree = buildTree(list)
    setTreeData(toTreeSelectData(tree, isEdit && id ? [id] : [], 3))
    setExistingCodes(list.map(c => c.code))
    setIdToCode(new Map(list.map((c: ConsumableCategory) => [c.id, c.code])))
    return list
  }, [id, isEdit])

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadOptions()
      .then((list) => {
        if (!alive) return
        if (isEdit && id) {
          const cur = list.find((c: ConsumableCategory) => c.id === id)
          if (cur) {
            form.setFieldsValue({
              code: cur.code,
              name: cur.name,
              parentId: cur.parentId || undefined,
              status: cur.status || 'enabled',
              remark: cur.remark,
            })
          }
        } else {
          form.setFieldsValue({ parentId: parentId || undefined, status: 'enabled' })
          // 新增模式：自动生成编码（HC 前缀）
          const parentCat = parentId ? list.find((c: ConsumableCategory) => c.id === parentId) : undefined
          const autoCode = generateConsumableCategoryCode(
            list.map((c: ConsumableCategory) => c.code),
            parentId,
            parentCat?.code,
          )
          form.setFieldsValue({ code: autoCode })
        }
      })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [form, id, isEdit, loadOptions, parentId])

  /** 上级分类变更时重新生成编码 */
  const handleParentChange = (newParentId?: number) => {
    if (isEdit) return
    const parentCode = newParentId ? idToCode.get(newParentId) : undefined
    const autoCode = generateConsumableCategoryCode(existingCodes, newParentId, parentCode)
    form.setFieldsValue({ code: autoCode, parentId: newParentId })
  }

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const payload = {
        code: v.code.trim(),
        name: v.name.trim(),
        parentId: v.parentId || 0,
        sortOrder: 0,
        status: v.status || 'enabled',
        remark: v.remark,
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateConsumableCategory(id, payload)
        message.success('修改成功')
      } else {
        await createConsumableCategory(payload)
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
              {isEdit ? '編輯耗材分類' : '新增耗材分類'}
            </h2>
          </div>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical">
        {/* ====== 基本信息 ====== */}
        <div style={cardShellStyle}>
          {cardTitle(<FolderOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#E6F7FF', '基本信息')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="分類編碼" name="code"
              rules={[{ required: true, message: '請填寫分類編碼' }]}
            >
              <Input
                placeholder="系統自動生成"
                disabled={!isEdit}
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
            <Form.Item
              label="分類名稱" name="name"
              rules={[{ required: true, message: '請填寫分類名稱' }]}
            >
              <Input placeholder="請輸入分類名稱" allowClear />
            </Form.Item>
            <Form.Item label="狀態" name="status">
              <Select>
                <Select.Option value="enabled">啟用</Select.Option>
                <Select.Option value="disabled">停用</Select.Option>
              </Select>
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="上級分類" name="parentId" style={{ marginBottom: 0 }}>
              <TreeSelect
                treeData={treeData}
                placeholder="請選擇上級分類"
                allowClear
                treeDefaultExpandAll
                onChange={handleParentChange}
              />
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
