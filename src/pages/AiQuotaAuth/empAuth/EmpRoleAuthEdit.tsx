import { useEffect, useMemo, useState } from 'react'
import { Button, Form, Input, Switch, Tag, message, Spin } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, SaveOutlined, AppstoreOutlined, TeamOutlined, PoweroffOutlined } from '@ant-design/icons'
import { fetchModels, type AiModel } from '../../../api'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import { ModelAuthSection } from './ModelAuthSection'
import {
  clampModelConfigs,
  type ModelAuthConfig,
} from './modelAuthCapability'
import { createRoleAuth, fetchRoleAuths, getRoleAuthByCode, updateRoleAuth } from '../../../api/empAuth'

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
  /** 左側已勾選但未移入右側的員工 id */
  const [checkedEmpIds, setCheckedEmpIds] = useState<number[]>([])
  /** 員工搜索關鍵字 */
  const [empSearchKw, setEmpSearchKw] = useState('')

  /**
   * 一次性加載：模型列表 + 員工列表 +（編輯模式）授權配置（API）。
   */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [modelList, empResult] = await Promise.all([
          fetchModels({ status: 1 }),
          fetchEmployees({ page: 1, size: 200, status: 1 }),  // 真實員工 API
        ])
        if (cancelled) return
        setModels(modelList)
        setEmployees(empResult.records || [])

        if (roleIdParam) {
          const config = await getRoleAuthByCode(roleIdParam)
          if (cancelled) return
          form.setFieldsValue({ roleName: config.roleName, description: config.description ?? '', status: config.status ?? 1 })
          setModelAuths(clampModelConfigs(config.modelConfigs ?? [], modelList))
          setBoundUsers(config.userIds ?? [])
          setDataResidency(config.dataResidency ?? 0)
        }
      } catch {
        if (!cancelled) {
          message.error(roleIdParam ? '角色配置不存在或已刪除' : '加載數據失敗')
          if (roleIdParam) navigate('/ai-emp-model-auth#role')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [roleIdParam, form, navigate])

  /* ── 左側可選員工（排除已選 + 搜索過濾） ── */
  const availableEmps = useMemo(
    () => employees.filter((emp) => {
      if (boundUsers.includes(emp.id)) return false
      if (!empSearchKw) return true
      const kw = empSearchKw.toLowerCase()
      return (
        emp.name.toLowerCase().includes(kw) ||
        emp.empId.toLowerCase().includes(kw) ||
        (emp.department || '').toLowerCase().includes(kw)
      )
    }),
    [employees, boundUsers, empSearchKw],
  )

  /* ── 右側已選員工列表（用於 Tag 展示） ── */
  const selectedEmpList = useMemo(
    () => employees.filter((emp) => boundUsers.includes(emp.id)),
    [employees, boundUsers],
  )

  /* ── 保存（寫後端，首頁「我的授權模型」按綁定員工聚合） ── */
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

    const payload = {
      roleName,
      description: ((values.description ?? '') as string).trim(),
      modelConfigs: modelAuths,
      dataResidency,
      userIds: boundUsers,
      status: (values.status ?? 1) as number,
    }

    setSaving(true)
    try {
      if (isEdit && roleIdParam) {
        await updateRoleAuth(roleIdParam, payload)
        message.success('角色授權已更新，綁定員工自動生效')
      } else {
        // 新增前校驗角色名稱唯一（後端 role_code 唯一兜底）
        const existing = await fetchRoleAuths({ name: roleName })
        if (existing.some((c) => c.roleName === roleName)) {
          message.error('角色名稱已存在，請使用其他名稱')
          return
        }
        await createRoleAuth(payload)
        message.success('角色授權已創建，綁定員工自動生效')
      }
      navigate('/ai-emp-model-auth#role')
    } catch {
      message.error('保存失敗，請稍後重試')
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

      <Form form={form} layout="vertical" initialValues={{ roleName: '', description: '', status: 1 }}>
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
            <Form.Item name="description" label="描述">
              <Input placeholder="請輸入角色描述（選填）" maxLength={200} allowClear />
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
          {/* 穿梭框：左側員工列表 + 右側已選標籤（與部門穿梭框規則一致） */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {/* 左側：可選員工 */}
            <div style={{
              flex: 1, border: '1px solid #d9d9d9', borderRadius: 8,
              display: 'flex', flexDirection: 'column', height: 360,
            }}>
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
                background: '#fafafa', borderRadius: '8px 8px 0 0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                  可選員工（{availableEmps.length}）
                </span>
                <a
                  onClick={() => {
                    const unchecked = availableEmps.map((e) => e.id).filter((id) => !boundUsers.includes(id))
                    setCheckedEmpIds(unchecked)
                  }}
                  style={{ fontSize: 12 }}
                >全選</a>
              </div>
              <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <Input
                  placeholder="搜索姓名、工號或部門"
                  allowClear
                  size="small"
                  value={empSearchKw}
                  onChange={(e) => setEmpSearchKw(e.target.value)}
                />
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
                {availableEmps.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#BFBFBF', padding: '40px 0', fontSize: 13 }}>
                    暫無可選員工
                  </div>
                ) : availableEmps.map((emp) => {
                  const checked = checkedEmpIds.includes(emp.id)
                  return (
                    <div
                      key={emp.id}
                      onClick={() => {
                        setCheckedEmpIds((prev) =>
                          checked ? prev.filter((id) => id !== emp.id) : [...prev, emp.id],
                        )
                      }}
                      style={{
                        padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: checked ? '#FFF7E6' : 'transparent',
                        border: `1px solid ${checked ? '#FFE7BA' : 'transparent'}`,
                        marginBottom: 2, transition: 'all 0.15s',
                      }}
                    >
                      <div style={{
                        width: 16, height: 16, borderRadius: 3,
                        border: `1px solid ${checked ? '#E8720C' : '#d9d9d9'}`,
                        background: checked ? '#E8720C' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s', flexShrink: 0,
                      }}>
                        {checked && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, color: '#262626' }}>
                        {emp.name}（{emp.empId}）
                        {emp.department && <span style={{ fontSize: 11, color: '#8C8C8C', marginLeft: 4 }}>— {emp.department}</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 中间：操作按钮 */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
              <Button
                type="primary"
                size="small"
                icon={<span style={{ fontSize: 16 }}>›</span>}
                onClick={() => {
                  const newIds = checkedEmpIds.filter((id) => !boundUsers.includes(id))
                  if (newIds.length === 0) {
                    message.warning('請先勾選要添加的員工')
                    setCheckedEmpIds([])
                    return
                  }
                  setBoundUsers((prev) => [...prev, ...newIds])
                  setCheckedEmpIds([])
                }}
                disabled={checkedEmpIds.length === 0}
                style={{ backgroundColor: '#E8720C', borderColor: '#E8720C' }}
              />
              <Button
                size="small"
                icon={<span style={{ fontSize: 16 }}>‹</span>}
                onClick={() => {
                  setBoundUsers([])
                  setCheckedEmpIds([])
                }}
                disabled={boundUsers.length === 0}
              />
            </div>

            {/* 右側：已選員工（Tag 標籤，支持點擊刪除 + 清空） */}
            <div style={{
              flex: 1, border: '1px solid #d9d9d9', borderRadius: 8,
              display: 'flex', flexDirection: 'column', height: 360,
            }}>
              <div style={{
                padding: '10px 16px', borderBottom: '1px solid #f0f0f0',
                background: '#fafafa', borderRadius: '8px 8px 0 0',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                  已選員工（{boundUsers.length}）
                </span>
                <a onClick={() => { setBoundUsers([]); setCheckedEmpIds([]) }} style={{ fontSize: 12 }}>清空</a>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
                {selectedEmpList.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#BFBFBF', padding: '40px 0', fontSize: 13 }}>
                    請從左側選擇員工
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedEmpList.map((emp) => (
                      <Tag
                        key={emp.id}
                        closable
                        onClose={() => setBoundUsers((prev) => prev.filter((id) => id !== emp.id))}
                        style={{ fontSize: 12, margin: 0 }}
                      >
                        {emp.name}（{emp.empId}）{emp.department && ` — ${emp.department}`}
                      </Tag>
                    ))}
                  </div>
                )}
              </div>
              <div style={{
                padding: '8px 16px', borderTop: '1px solid #f0f0f0', background: '#fafafa',
                borderRadius: '0 0 8px 8px', fontSize: 12, color: '#595959',
              }}>
                共 <strong>{boundUsers.length}</strong> 名員工
              </div>
            </div>
          </div>
        </div>

        {/* ═══ 分区 3：模型授权配置（能力顆粒度，參考職位授權樣式） ═══ */}
        <ModelAuthSection models={models} value={modelAuths} onChange={setModelAuths} dataResidency={dataResidency} onDataResidencyChange={setDataResidency} />

        {/* ═══ 分区 4：状态配置（與職位授權一致） ═══ */}
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
              extra="停用後綁定員工將立即失去該角色授予的模型訪問權"
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
