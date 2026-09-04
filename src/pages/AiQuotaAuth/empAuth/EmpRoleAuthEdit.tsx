import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Tag, Transfer, message, Spin } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, AppstoreOutlined, TeamOutlined } from '@ant-design/icons'
import { fetchModels, type AiModel } from '../../../api'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { ModelAuthSection } from './ModelAuthSection'
import {
  loadRoleAuthConfigs,
  saveRoleAuthConfigs,
  clampModelConfigs,
  type ModelAuthConfig,
  type RoleAuthConfig,
} from './modelAuthCapability'

/**
 * 角色授權 - 新增 / 編輯獨立頁（全局統一：取消彈窗，參考部門模型權控）
 * 分區：基础信息（自定義角色名稱） → 綁定員工（穿梭框，顯示工號） → 模型授權配置（能力顆粒度）
 * 路由：/ai-role-auth-edit（新增）、/ai-role-auth-edit?roleId=xxx（編輯）
 * 
 * 角色為自定義名稱，與權限系統角色無關；員工來自真實 API，顯示工號避免重名
 */
export default function EmpRoleAuthEdit() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roleIdParam = searchParams.get('roleId')
  const isEdit = !!roleIdParam

  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  /* ── 基礎數據 ── */
  const [models, setModels] = useState<AiModel[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])
  const [modelAuths, setModelAuths] = useState<ModelAuthConfig[]>([])
  const [boundUsers, setBoundUsers] = useState<number[]>([])
  const [dataResidency, setDataResidency] = useState(0)
  /** 已有授權配置的角色 id（新增模式下不允許重複配置） */
  const [configuredRoleIds, setConfiguredRoleIds] = useState<string[]>([])

  /**
   * 一次性加載：模型列表 + 員工列表 +（編輯模式）授權配置。
   */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchModels({ status: 1 }),
      fetchEmployees({ page: 1, size: 200, status: 1 }),  // 真實員工 API
    ])
      .then(([modelList, empResult]) => {
        if (cancelled) return
        setModels(modelList)
        setEmployees(empResult.records || [])

        const configs = loadRoleAuthConfigs(modelList)
        setConfiguredRoleIds(configs.map((c) => c.roleId))

        if (roleIdParam) {
          const config = configs.find((c) => c.roleId === roleIdParam)
          if (config) {
            form.setFieldsValue({ roleName: config.roleName })
            setModelAuths(clampModelConfigs(config.modelConfigs, modelList))
            setBoundUsers(config.userIds ?? [])
            setDataResidency(config.dataResidency ?? 0)
          } else {
            message.error('角色配置不存在或已刪除')
            navigate('/ai-emp-model-auth#role')
          }
        }
      })
      .catch(() => { if (!cancelled) message.error('加載數據失敗') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [roleIdParam, form, navigate])

  /** 可選角色名稱（新增模式下排除已配置授權的角色） */
  const existingRoleNames = useMemo(
    () => new Set(configuredRoleIds),
    [configuredRoleIds],
  )

  /* ── Transfer 数据源（绑定员工）：key 必须为字符串，顯示工號避免重名 ── */
  const employeeTransferData = useMemo(
    () => employees.map((emp) => ({
      key: String(emp.id),
      title: `${emp.name}（${emp.empId}）`,  // 顯示姓名 + 工號
      empId: emp.empId,  // 保留工號用於搜索
      department: emp.department || '',
    })),
    [employees],
  )

  /* ── 保存 ── */
  const handleSave = async () => {
    const values = await form.validateFields()
    const roleName = String(values.roleName).trim()
    if (!roleName) {
      message.warning('請輸入角色名稱')
      return
    }
    if (boundUsers.length === 0) {
      message.warning('請至少綁定一名員工')
      return
    }
    if (modelAuths.length === 0) {
      message.warning('請至少添加一個授權模型')
      return
    }

    const now = new Date().toISOString()
    const configs = loadRoleAuthConfigs(models)
    
    // 生成自定義角色 ID
    const roleId = isEdit ? roleIdParam! : `custom_role_${Date.now()}`
    
    // 檢查角色名稱是否重複（新增模式）
    if (!isEdit && configs.some((c) => c.roleName === roleName)) {
      message.error('角色名稱已存在，請使用其他名稱')
      return
    }

    const payload = {
      roleId,
      roleName,
      modelConfigs: modelAuths,
      dataResidency,
      userIds: boundUsers,
      createdAt: isEdit ? configs.find((c) => c.roleId === roleId)?.createdAt ?? now : now,
      updatedBy: 'admin',
      updatedAt: now,
    }

    setSaving(true)
    try {
      const existing = configs.find((c) => c.roleId === roleId)
      if (existing) {
        saveRoleAuthConfigs(configs.map((c) => (c.roleId === roleId ? { ...c, ...payload } : c)))
        message.success('角色授權已更新，綁定員工自動生效')
      } else {
        saveRoleAuthConfigs([...configs, payload])
        message.success('角色授權已創建，綁定員工自動生效')
      }
      navigate('/ai-emp-model-auth#role')
    } finally {
      setSaving(false)
    }
  }

  const handleBack = () => navigate('/ai-emp-model-auth#role')

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
              {isEdit ? '編輯模型授權-角色' : '新增模型授權-角色'}
            </h2>
          </div>
        </div>
      </div>

      <Form form={form} layout="vertical">
        {/* ═══ 分区 1：基础信息（自定義角色名稱） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基础信息</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>{isEdit ? '角色名稱不可變更' : '自定義角色'}</Tag>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Form.Item name="roleName" label="角色名稱" rules={[{ required: true, message: '請輸入角色名稱' }]}>
              <Input
                placeholder="如：AI 研發團隊、數據分析組"
                maxLength={50}
                allowClear
                disabled={isEdit}
              />
            </Form.Item>
            <Form.Item label="說明">
              <div style={{ fontSize: 13, color: '#8C8C8C', paddingTop: 5 }}>
                自定義角色用於批量管理一組員工的模型權限，與權限系統角色無關
              </div>
            </Form.Item>
          </div>
        </div>

        {/* ═══ 分区 2：绑定员工（穿梭框，顯示工號） ═══ */}
        <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>綁定員工</span>
            <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>穿梭框</Tag>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>綁定員工自動獲得該角色的模型授權（顯示工號避免重名）</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          {/* Transfer 獨占一行居中（全局布局規範） */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Transfer
              dataSource={employeeTransferData}
              titles={['可選員工', '已選員工']}
              listStyle={{ width: 380, height: 400 }}
              showSearch
              filterOption={(input, item) => {
                const text = `${item.title} ${item.department}`.toLowerCase()
                return text.includes(input.toLowerCase())
              }}
              render={(item) => (
                <span>
                  {item.title}
                  {item.department && <span style={{ color: '#8C8C8C', fontSize: 11, marginLeft: 4 }}>· {item.department}</span>}
                </span>
              )}
              targetKeys={boundUsers.map(String)}
              onChange={(targetKeys) => setBoundUsers((targetKeys as string[]).map(Number))}
            />
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: '#8C8C8C', textAlign: 'center' }}>
            已綁定 <strong style={{ color: '#1890ff' }}>{boundUsers.length}</strong> 名員工
          </div>
        </div>

        {/* ═══ 分区 3：模型授权配置（能力顆粒度，參考職位授權樣式） ═══ */}
        <ModelAuthSection models={models} value={modelAuths} onChange={setModelAuths} dataResidency={dataResidency} onDataResidencyChange={setDataResidency} />
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
