import { useEffect, useState } from 'react'
import { Button, Form, Input, Select, Switch, Tag, message, Spin } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, AppstoreOutlined, IdcardOutlined, PoweroffOutlined } from '@ant-design/icons'
import { fetchModels, type AiModel } from '../../../api'
import { POSITION_SEQUENCE_OPTIONS, POSITION_RANK_OPTIONS } from '../../../api/position'
import { ModelAuthSection } from './ModelAuthSection'
import {
  clampModelConfigs,
  type ModelAuthConfig,
} from './modelAuthCapability'
import { createPosStrategy, getPosStrategyById, updatePosStrategy } from '../../../api/empAuth'

/**
 * 按職位授權 - 新增 / 編輯獨立頁（全局統一：取消彈窗，參考部門模型權控）
 * 分區：基础信息 → 適用職位（職級序列 + 職級） → 模型授權配置（能力顆粒度） → 状态配置
 * 路由：/ai-pos-auth-edit（新增）、/ai-pos-auth-edit?id=xxx（編輯）
 */
export default function EmpPosAuthEdit() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ruleId = searchParams.get('id')
  const isEdit = !!ruleId

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ── 基礎數據 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [modelAuths, setModelAuths] = useState<ModelAuthConfig[]>([])
  const [dataResidency, setDataResidency] = useState(0)

  /**
   * 一次性加載：模型列表 +（編輯模式）策略詳情（API）。
   * 合併為單個 effect 以避免「詳情先於模型返回」導致能力回填丟失的競態。
   */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const modelList = await fetchModels({ status: 1 })
        if (cancelled) return
        setModels(modelList)
        if (ruleId) {
          const rule = await getPosStrategyById(ruleId)
          if (cancelled) return
          form.setFieldsValue({
            ruleName: rule.ruleName,
            sequence: rule.sequence ?? [],
            jobLevels: rule.jobLevels ?? [],
            description: rule.description ?? '',
            status: rule.status,
          })
          setModelAuths(clampModelConfigs(rule.modelConfigs ?? [], modelList))
          setDataResidency(rule.dataResidency ?? 0)
        }
      } catch {
        if (!cancelled) {
          message.error(ruleId ? '授權策略不存在或已刪除' : '加載數據失敗')
          if (ruleId) navigate('/ai-emp-model-auth')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [ruleId, form, navigate])

  /* ── 保存（寫後端，首頁「我的授權模型」按策略命中聚合） ── */
  const handleSave = async () => {
    const values = await form.validateFields()

    if (modelAuths.length === 0) {
      message.warning('請至少添加一個授權模型')
      return
    }

    const payload = {
      strategyName: String(values.ruleName).trim(),
      sequences: (values.sequence ?? []) as string[],
      jobLevels: (values.jobLevels ?? []) as string[],
      modelConfigs: modelAuths,
      dataResidency,
      description: (values.description ?? '') as string,
      status: (values.status ?? 1) as number,
    }

    setSaving(true)
    try {
      if (isEdit && ruleId) {
        await updatePosStrategy(ruleId, payload)
        message.success('職位授權策略已更新，匹配的職位自動生效')
      } else {
        await createPosStrategy(payload)
        message.success('職位授權策略已創建，匹配的職位自動生效')
      }
      navigate('/ai-emp-model-auth')
    } catch {
      message.error('保存失敗，請稍後重試')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-emp-model-auth')

  if (loading && !models.length) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 頁面頭部（全局統一：橙色頂條 + 橙色返回按鈕） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
          backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
        }} />
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', animation: 'headerFadeSlideIn 0.5s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button type="primary" icon={<ArrowLeftOutlined />} onClick={handleBack}
              style={{
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>返回</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? '編輯模型授權-職位' : '新增模型授權-職位'}
            </h2>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical" initialValues={{ ruleName: '', sequence: [], jobLevels: [], description: '', status: 1 }}>
        {/* ═══ 分区 1：基础信息 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基础信息</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="ruleName" label="策略名稱" rules={[{ required: true, message: '請輸入策略名稱' }]}>
              <Input placeholder="如：M序列高職級全模型授權" maxLength={50} allowClear />
            </Form.Item>
            <Form.Item name="description" label="描述">
              <Input placeholder="請輸入策略描述（選填）" maxLength={200} allowClear />
            </Form.Item>
          </div>
        </div>

        {/* ═══ 分区 2：适用职位（职级序列 + 职级） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IdcardOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>適用職位</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>職級序列 · 職級</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>匹配所選序列/職級的職位下所有員工自動獲得授權</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="sequence" label="職級序列" rules={[{ required: true, message: '請選擇職級序列' }]}>
              <Select placeholder="選擇序列" options={POSITION_SEQUENCE_OPTIONS} mode="multiple" allowClear maxTagCount="responsive" />
            </Form.Item>
            <Form.Item name="jobLevels" label="職級" rules={[{ required: true, message: '請選擇職級' }]}>
              <Select placeholder="選擇職級" options={POSITION_RANK_OPTIONS} mode="multiple" allowClear maxTagCount="responsive" />
            </Form.Item>
          </div>
        </div>

        {/* ═══ 分区 3：模型授权配置（能力顆粒度，用戶自行添加） ═══ */}
        <ModelAuthSection models={models} value={modelAuths} onChange={setModelAuths} dataResidency={dataResidency} onDataResidencyChange={setDataResidency} />

        {/* ═══ 分区 4：状态配置 ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <PoweroffOutlined style={{ fontSize: 14, color: '#E8720C' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>状态配置</span>
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>可编辑</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ background: '#FFF7E6', padding: 16, borderRadius: 8, border: '1px solid #FFE7BA' }}>
            <Form.Item
              name="status"
              label="啟用狀態"
              getValueFromEvent={(checked) => checked ? 1 : 0}
              getValueProps={(value) => ({ checked: value === 1 })}
              style={{ marginBottom: 0 }}
              extra="停用後匹配該策略的職位將立即失去對應模型訪問權"
            >
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 底部操作按鈕（全局統一：取消 + 保存） */}
      <div className="form-footer">
        <Button onClick={handleBack}>取消</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
          保存
        </Button>
      </div>
    </div>
  )
}
