/**
 * 資產分類 新增/編輯獨立表單頁
 *
 * - 通過 props.id 區分模式：無 id = 新增，有 id = 編輯
 * - 分模塊佈局：頂部標題欄 → 基本信息卡片 → 底部操作欄
 * - 分類僅做層級歸類，參數配置由「資產品牌型號庫」負責
 * - 底部「取消 + 保存」（全局表單規範）
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Button, Form, Input, TreeSelect, Space, Spin, message, Select, InputNumber, Row, Col, Switch,
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
  bizType?: 'ASSET' | 'CONSUMABLE'
}

interface Props {
  id?: number
  parentId?: number
  /** 新增模式默认业务类型（方案二：统一分类库） */
  bizType?: string
  onBack: () => void
}

export default function CategoryForm({ id, parentId, bizType, onBack }: Props) {
  const { t } = useTranslation()
  const [form] = Form.useForm<FormValues>()
  const isEdit = id != null
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [existingCodes, setExistingCodes] = useState<string[]>([])
  const [idToCode, setIdToCode] = useState<Map<number, string>>(new Map())

  const [allCategories, setAllCategories] = useState<AssetCategory[]>([])
  const [formBizType, setFormBizType] = useState<'ASSET' | 'CONSUMABLE'>(
    bizType === 'CONSUMABLE' ? 'CONSUMABLE' : 'ASSET',
  )

  const loadOptions = useCallback(async () => {
    const list = await fetchCategoryList({ bizType: 'ALL' })
    return list
  }, [])

  /** 根據當前表單業務類型過濾 TreeSelect 數據 */
  const filteredTreeData = useMemo(() => {
    const scoped = allCategories.filter(c => (c.bizType || 'ASSET') === formBizType)
    return toTreeSelectData(buildTree(scoped), isEdit && id ? [id] : [], 3)
  }, [allCategories, formBizType, isEdit, id])

  useEffect(() => {
    let alive = true
    setLoading(true)
    loadOptions()
      .then((list) => {
        if (!alive) return
        setAllCategories(list)
        if (isEdit && id) {
          const cur = list.find((c: AssetCategory) => c.id === id)
          if (cur) {
            const bt = (cur.bizType || 'ASSET') as 'ASSET' | 'CONSUMABLE'
            setFormBizType(bt)
            form.setFieldsValue({
              code: cur.code,
              name: cur.name,
              parentId: cur.parentId || undefined,
              status: cur.status || 'enabled',
              remark: cur.remark,
              bizType: bt,
            })
          }
          setExistingCodes(list.map(c => c.code))
          setIdToCode(new Map(list.map((c: AssetCategory) => [c.id, c.code])))
        } else {
          // 新增模式
          const type: 'ASSET' | 'CONSUMABLE' = bizType === 'CONSUMABLE' ? 'CONSUMABLE' : 'ASSET'
          setFormBizType(type)
          const scoped = list.filter(c => (c.bizType || 'ASSET') === type)
          form.setFieldsValue({ parentId: parentId || undefined, status: 'enabled', bizType: type })
          const parentCat = parentId ? scoped.find((c: AssetCategory) => c.id === parentId) : undefined
          const autoCode = generateCategoryCode(
            scoped.map((c: AssetCategory) => c.code),
            parentId,
            parentCat?.code,
          )
          form.setFieldsValue({ code: autoCode })
          setExistingCodes(scoped.map(c => c.code))
          setIdToCode(new Map(scoped.map((c: AssetCategory) => [c.id, c.code])))
        }
      })
      .catch((e: Error) => message.error(e.message))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [form, id, isEdit, loadOptions, parentId, bizType])

  /** 業務類型切換時，重置上級分類並重新生成編碼 */
  const handleBizTypeChange = (newBizType: string) => {
    const type = newBizType as 'ASSET' | 'CONSUMABLE'
    setFormBizType(type)
    form.setFieldsValue({ parentId: undefined })
    if (!isEdit) {
      const scoped = allCategories.filter(c => (c.bizType || 'ASSET') === type)
      const autoCode = generateCategoryCode(scoped.map((c: AssetCategory) => c.code), undefined, undefined)
      form.setFieldsValue({ code: autoCode, bizType: type })
      setExistingCodes(scoped.map(c => c.code))
      setIdToCode(new Map(scoped.map((c: AssetCategory) => [c.id, c.code])))
    }
  }

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
        bizType: v.bizType || 'ASSET',
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
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
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
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item
                label="分类名称" name="name"
                rules={[{ required: true, message: '请输入分类名称' }]}
              >
                <Input placeholder="请输入分类名称" allowClear />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="业务类型" name="bizType" rules={[{ required: true }]}>
                <Select disabled={isEdit} onChange={handleBizTypeChange}>
                  <Select.Option value="ASSET">资产</Select.Option>
                  <Select.Option value="CONSUMABLE">耗材</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="上级分类" name="parentId">
                <TreeSelect
                  treeData={filteredTreeData}
                  placeholder="请选择上级分类"
                  allowClear
                  treeDefaultExpandAll
                  onChange={handleParentChange}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item label="状态" name="status" style={{ marginBottom: 0 }}>
                <Switch
                  checkedChildren="啟用"
                  unCheckedChildren="停用"
                />
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
