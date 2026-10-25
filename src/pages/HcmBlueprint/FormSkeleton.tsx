/**
 * 新增 / 辦理表單骨架（階段 B 預覽）
 *
 * 按 §C 表單頁規範：橙色漸變頂條 + 橙色返回按鈕 + 藍色標題，模塊分組用白色 div 卡片，
 * Form layout="vertical" + 3 列 grid，底部 `.form-footer`（取消 + 保存）。
 * 階段 B 不接後端，保存按鈕只提示「未接通」，用於評審字段與分組是否夠用。
 */
import { Button, DatePicker, Form, Input, Select, message } from 'antd'
import type { ReactNode } from 'react'
import { ArrowLeftOutlined, SaveOutlined, UserOutlined, SettingOutlined } from '@ant-design/icons'
import type { HcmDemo, HcmSystemBlueprint } from './blueprint'

const cardStyle: React.CSSProperties = {
  border: '1px solid #e8eaed',
  borderRadius: 8,
  background: '#fff',
  padding: '20px 24px',
  marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
}

function CardTitle({ icon, title, tone }: { icon: ReactNode; title: string; tone: 'blue' | 'orange' }) {
  const palette = tone === 'blue'
    ? { bg: '#e6f7ff', color: '#1890ff' }
    : { bg: '#fff7e6', color: '#fa8c16' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: palette.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: 14, color: palette.color, display: 'inline-flex' }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
    </div>
  )
}

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 16,
}

export default function FormSkeleton({ blueprint, demo }: { blueprint: HcmSystemBlueprint; demo: HcmDemo }) {
  const [form] = Form.useForm()

  const handleSave = () => {
    // 階段 B：不調接口，僅提示；第二階段接後端後改為提交 + 二次確認
    message.info('階段 B 預覽：後端尚未接通，保存不會落庫')
  }

  return (
    <div className="content-area">
      {/* 頁面頭部：橙色漸變頂條 + 橙色返回 + 藍色標題（§C.2） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3,
          background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%',
          animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="primary"
              icon={<ArrowLeftOutlined />}
              onClick={() => message.info('階段 B 預覽：返回行為待第二階段接路由')}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              返回
            </Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              新增{demo.entity}
            </h2>
          </div>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            系統 {blueprint.code} · 預覽骨架
          </span>
        </div>
      </div>

      <Form form={form} layout="vertical">
        <div style={cardStyle}>
          <CardTitle icon={<UserOutlined />} title={`${demo.entity}基本信息`} tone="blue" />
          <div style={gridStyle}>
            {demo.formFields.map((field, index) => (
              <Form.Item
                key={field}
                name={`f${index}`}
                label={field}
                rules={index === 0 ? [{ required: true, message: `請填寫${field}` }] : undefined}
              >
                {field.includes('日期') ? <DatePicker style={{ width: '100%' }} />
                  : field.includes('備註') || field.includes('描述') ? <Input.TextArea rows={3} maxLength={200} showCount />
                    : <Input placeholder={`請輸入${field}`} />}
              </Form.Item>
            ))}
          </div>
        </div>

        <div style={cardStyle}>
          <CardTitle icon={<SettingOutlined />} title="生效與審批" tone="orange" />
          <div style={gridStyle}>
            <Form.Item name="effectiveDate" label="生效日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="approvalFlow" label="審批流程">
              <Select placeholder="選擇審批流程" options={[]} />
            </Form.Item>
            <Form.Item name="attachments" label="附件">
              <Input placeholder="上傳入口（第二階段接入）" disabled />
            </Form.Item>
          </div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            批准不等於已生效：審批通過後由生效任務按生效日期寫入任職事實，兩者狀態分開記錄。
          </div>
        </div>
      </Form>

      {/* 底部操作：統一 .form-footer，禁止內聯樣式覆蓋 */}
      <div className="form-footer">
        <Button onClick={() => message.info('階段 B 預覽：尚未接通')}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave}>保存</Button>
      </div>
    </div>
  )
}
