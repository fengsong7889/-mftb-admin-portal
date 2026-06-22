import { useState, useEffect } from 'react'
import { Form, Input, Button, Card, Space, Divider } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import './PRDEditor.css'

interface PRDContent {
  description?: string
  features?: { label: string; desc: string }[]
  searchConditions?: { label: string; desc: string }[]
  fields?: { label: string; desc: string }[]
  actions?: string[]
}

interface PRDEditorProps {
  initialContent?: PRDContent
  defaultPRD?: any
  onChange?: (content: PRDContent) => void
}

export default function PRDEditor({ initialContent, defaultPRD, onChange }: PRDEditorProps) {
  const [form] = Form.useForm()
  const [content, setContent] = useState<PRDContent>(initialContent || {})

  useEffect(() => {
    if (initialContent) {
      setContent(initialContent)
      form.setFieldsValue({
        description: initialContent.description || defaultPRD?.description || '',
        features: initialContent.features || defaultPRD?.features || [],
        searchConditions: initialContent.searchConditions || defaultPRD?.searchConditions || [],
        fields: initialContent.fields || defaultPRD?.fields || [],
        actions: initialContent.actions || defaultPRD?.actions || [],
      })
    } else if (defaultPRD) {
      // 从默认PRD中转换features格式（如果默认是字符串数组，转换为对象数组）
      const features = Array.isArray(defaultPRD.features)
        ? defaultPRD.features.map((f: any) => {
            if (typeof f === 'string') {
              return { label: f, desc: '' }
            }
            return f
          })
        : []
      
      const searchConditions = Array.isArray(defaultPRD.searchConditions)
        ? defaultPRD.searchConditions.map((s: any) => {
            if (typeof s === 'string') {
              return { label: s, desc: '' }
            }
            return s
          })
        : []
      
      form.setFieldsValue({
        description: defaultPRD.description || '',
        features: features,
        searchConditions: searchConditions,
        fields: defaultPRD.fields || [],
        actions: defaultPRD.actions || [],
      })
    }
  }, [initialContent, defaultPRD, form])

  const handleFormChange = (_: any, allValues: any) => {
    const newContent: PRDContent = {
      description: allValues.description,
      features: allValues.features?.filter((f: any) => f?.label?.trim()) || [],
      searchConditions: allValues.searchConditions?.filter((s: any) => s?.label?.trim()) || [],
      fields: allValues.fields?.filter((f: any) => f?.label?.trim()) || [],
      actions: allValues.actions?.filter((a: string) => a?.trim()) || [],
    }
    setContent(newContent)
    onChange?.(newContent)
  }

  return (
    <div className="prd-editor">
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleFormChange}
        initialValues={{
          description: defaultPRD?.description || '',
          features: defaultPRD?.features || [],
          fields: defaultPRD?.fields || [],
          actions: defaultPRD?.actions || [],
        }}
      >
        {/* 版块1：菜单描述 */}
        <Card className="prd-section" title="📋 菜單描述" bordered={false}>
          <Form.Item
            name="description"
            label="功能描述"
            extra="簡要描述該功能模塊的核心用途"
          >
            <Input.TextArea
              rows={3}
              placeholder="請輸入功能描述..."
              style={{ fontSize: 14 }}
            />
          </Form.Item>
        </Card>

        <Divider />

        {/* 版块2：功能说明 */}
        <Card className="prd-section" title="⭐ 功能說明" bordered={false}>
          <Form.List name="features">
            {(fields, { add, remove }) => (
              <>
                <div className="fields-header">
                  <div className="field-label">功能名稱</div>
                  <div className="field-desc">說明</div>
                  <div className="field-action">操作</div>
                </div>
                {fields.map((field, index) => (
                  <div key={field.key} className="field-row">
                    <Form.Item
                      {...field}
                      name={[field.name, 'label']}
                      style={{ marginBottom: 8 }}
                    >
                      <Input
                        placeholder="功能名稱"
                        style={{ fontWeight: 500 }}
                        disabled
                      />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'desc']}
                      style={{ marginBottom: 8, flex: 1 }}
                    >
                      <Input.TextArea
                        rows={2}
                        placeholder="請描述該功能的含義..."
                        style={{ marginLeft: 12 }}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      style={{ marginLeft: 8 }}
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add()}
                  icon={<PlusOutlined />}
                  style={{ width: '100%', marginTop: 12 }}
                >
                  添加功能
                </Button>
              </>
            )}
          </Form.List>
        </Card>

        <Divider />

        {/* 版块3：查询条件 */}
        <Card className="prd-section" title="🔍 查詢條件" bordered={false}>
          <Form.List name="searchConditions">
            {(fields, { add, remove }) => (
              <>
                <div className="fields-header">
                  <div className="field-label">查詢條件</div>
                  <div className="field-desc">說明</div>
                  <div className="field-action">操作</div>
                </div>
                {fields.map((field, index) => (
                  <div key={field.key} className="field-row">
                    <Form.Item
                      {...field}
                      name={[field.name, 'label']}
                      style={{ marginBottom: 8 }}
                    >
                      <Input
                        placeholder="查詢條件"
                        style={{ fontWeight: 500 }}
                      />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'desc']}
                      style={{ marginBottom: 8, flex: 1 }}
                    >
                      <Input.TextArea
                        rows={2}
                        placeholder="請描述該條件的含義..."
                        style={{ marginLeft: 12 }}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      style={{ marginLeft: 8 }}
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ label: '', desc: '' })}
                  icon={<PlusOutlined />}
                  style={{ width: '100%', marginTop: 12 }}
                >
                  添加查詢條件
                </Button>
              </>
            )}
          </Form.List>
        </Card>

        <Divider />

        {/* 版块4：字段说明 */}
        <Card className="prd-section" title="📝 字段說明" bordered={false}>
          <Form.List name="fields">
            {(fields, { add, remove }) => (
              <>
                <div className="fields-header">
                  <div className="field-label">字段名稱</div>
                  <div className="field-desc">說明</div>
                  <div className="field-action">操作</div>
                </div>
                {fields.map((field, index) => (
                  <div key={field.key} className="field-row">
                    <Form.Item
                      {...field}
                      name={[field.name, 'label']}
                      style={{ marginBottom: 8 }}
                    >
                      <Input
                        placeholder="字段名稱"
                        style={{ fontWeight: 500 }}
                        disabled
                      />
                    </Form.Item>
                    <Form.Item
                      {...field}
                      name={[field.name, 'desc']}
                      style={{ marginBottom: 8, flex: 1 }}
                    >
                      <Input.TextArea
                        rows={2}
                        placeholder="請描述該字段的含義..."
                        style={{ marginLeft: 12 }}
                      />
                    </Form.Item>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      style={{ marginLeft: 8 }}
                    />
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add()}
                  icon={<PlusOutlined />}
                  style={{ width: '100%', marginTop: 12 }}
                >
                  添加字段
                </Button>
              </>
            )}
          </Form.List>
        </Card>

        <Divider />

        {/* 版块5：操作说明 */}
        <Card className="prd-section" title="🔧 操作說明" bordered={false}>
          <Form.List name="actions">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field, index) => (
                  <div key={field.key} className="list-item">
                    <Form.Item
                      {...field}
                      label={`操作 ${index + 1}`}
                      style={{ marginBottom: 8 }}
                    >
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Input.TextArea
                          rows={2}
                          placeholder="請描述操作功能..."
                          style={{ flex: 1 }}
                        />
                        <Button
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => remove(field.name)}
                        />
                      </div>
                    </Form.Item>
                  </div>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add()}
                  icon={<PlusOutlined />}
                  style={{ width: '100%' }}
                >
                  添加操作說明
                </Button>
              </>
            )}
          </Form.List>
        </Card>
      </Form>
    </div>
  )
}
