/**
 * 資產分類 新增/編輯獨立表單頁
 *
 * - 通過 props.id 區分模式：無 id = 新增，有 id = 編輯
 * - 分模塊佈局：頂部標題欄 → 基本信息卡片 → 底部操作欄
 * - 分類僅做層級歸類，參數配置由「品牌型號庫」負責
 * - 底部「取消 + 保存」（全局表單規範）
 */
import { useState, useEffect, useCallback } from 'react'
import {
  Button, Form, Input, TreeSelect, Space, Spin, message, Select, InputNumber,
} from 'antd'
import {
  ArrowLeftOutlined, SaveOutlined, FolderOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import {
  fetchCategoryList, createCategory, updateCategory,
  type AssetCategory,
} from '../../../api/eam'
import { buildTree, toTreeSelectData } from '../eamUtils'
import { generateCategoryCode } from '../../../utils/generateCode'

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
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [treeData, setTreeData] = useState<ReturnType<typeof toTreeSelectData>>([])
  const [existingCodes, setExistingCodes] = useState<string[]>([])
  const [idToCode, setIdToCode] = useState<Map<number, string>>(new Map())

  const loadOptions = useCallback(async () => {
    const list = await fetchCategoryList()
    const tree = buildTree(list)
    setTreeData(toTreeSelectData(tree, isEdit && id ? [id] : [], 3))
    setExistingCodes(list.map(c => c.code))
    setIdToCode(new Map(list.map((c: AssetCategory) => [c.id, c.code])))
    return list
  }, [id, isEdit])

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadOptions()
      .then((list) => {
        if (!alive) return
        if (isEdit && id) {
          const cur = list.find((c: AssetCategory) => c.id === id)
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
          // 新增模式：自动生成编码
          const parentCat = parentId ? list.find((c: AssetCategory) => c.id === parentId) : undefined
          const autoCode = generateCategoryCode(
            list.map((c: AssetCategory) => c.code),
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
    const autoCode = generateCategoryCode(existingCodes, newParentId, parentCode)
    form.setFieldsValue({ code: autoCode, parentId: newParentId })
  }

  const handleSubmit = async () => {
    try {
      const v = await form.validateFields()
      const payload = {
        code: v.code.trim(),
        name: v.name.trim(),
        parentId: v.parentId || 0,
        status: v.status || 'enabled',
        sort: 1,
        remark: v.remark,
        paramTemplate: [],
      }
      setSubmitting(true)
      if (isEdit && id) {
        await updateCategory(id, payload)
        message.success(t('asset.updateSuccess'))
      } else {
        await createCategory(payload)
        message.success(t('asset.createSuccess'))
      }
      onBack()
    } catch (e: unknown) {
      if (e instanceof Error && e.message) message.error(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  /* ── 樣式 ── */
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
      {/* ====== 頂部標題欄 ====== */}
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
            >{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? t('asset.categoryEditTitle') : t('asset.categoryAddTitle')}
            </h2>
          </div>
        </div>
      </div>

      <Form<FormValues> form={form} layout="vertical">
        {/* ====== 基本信息 ====== */}
        <div style={cardShellStyle}>
          {cardTitle(<FolderOutlined style={{ fontSize: 14, color: '#1890ff' }} />, '#E6F7FF', t('asset.sectionBasic'))}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item
              label="分类编码" name="code"
              rules={[{ required: true, message: '请输入分类编码' }]}
            >
              <Input
                placeholder="系统自动生成"
                disabled={!isEdit}
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
            <Form.Item
              label="分类名称" name="name"
              rules={[{ required: true, message: '请输入分类名称' }]}
            >
              <Input placeholder="请输入分类名称" allowClear />
            </Form.Item>
            <Form.Item label="状态" name="status">
              <Select>
                <Select.Option value="enabled">启用</Select.Option>
                <Select.Option value="disabled">禁用</Select.Option>
              </Select>
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item label="上级分类" name="parentId" style={{ marginBottom: 0 }}>
              <TreeSelect
                treeData={treeData}
                placeholder="请选择上级分类"
                allowClear
                treeDefaultExpandAll
                onChange={handleParentChange}
              />
            </Form.Item>
          </div>
          <Form.Item label={t('asset.colRemark')} name="remark" style={{ marginBottom: 0 }}>
            <Input.TextArea
              placeholder={t('asset.remarkPh')}
              maxLength={300}
              showCount
              rows={4}
            />
          </Form.Item>
        </div>
      </Form>

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
