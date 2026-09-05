import { useEffect, useMemo, useState } from 'react'
import { Button, Tag, Spin, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeftOutlined, EditOutlined, AppstoreOutlined, TeamOutlined, BarChartOutlined } from '@ant-design/icons'
import { fetchModels, type AiModel } from '../../../api'
import { fetchEmployees, type EmployeeItem } from '../../../api/employee'
import AnimatedNumber from '../../../components/AnimatedNumber'
import { ModelAuthSectionReadonly } from './ModelAuthSection'
import { clampModelConfigs, type RoleAuthConfig } from './modelAuthCapability'
import { getRoleAuthByCode } from '../../../api/empAuth'

/**
 * 角色授權 - 詳情獨立頁（參考部門模型權控詳情頁佈局）
 * 分區：统计概览 → 綁定員工（顯示工號） → 授權模型（能力矩陣） → 基础信息
 * 路由：/ai-role-auth-detail?roleId=xxx
 */
export default function EmpRoleAuthDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const roleIdParam = searchParams.get('roleId')

  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<RoleAuthConfig | null>(null)
  const [models, setModels] = useState<AiModel[]>([])
  const [employees, setEmployees] = useState<EmployeeItem[]>([])

  useEffect(() => {
    if (!roleIdParam) {
      message.error('缺少角色 ID')
      navigate('/ai-emp-model-auth#role')
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const [modelList, empResult, detail] = await Promise.all([
          fetchModels({ status: 1 }),
          fetchEmployees({ page: 1, size: 200, status: 1 }),  // 真實員工 API
          getRoleAuthByCode(roleIdParam),
        ])
        if (cancelled) return
        setModels(modelList)
        setEmployees(empResult.records || [])
        setConfig({
          roleId: detail.roleId,
          roleName: detail.roleName,
          description: detail.description ?? '',
          modelConfigs: clampModelConfigs(detail.modelConfigs ?? [], modelList),
          userIds: detail.userIds ?? [],
          dataResidency: detail.dataResidency,
          status: detail.status,
          createdAt: detail.createdAt ?? '',
          updatedBy: detail.updatedBy,
          updatedAt: detail.updatedAt,
        })
      } catch {
        if (!cancelled) message.error('該角色尚未配置模型授權或已被移除')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [roleIdParam, navigate])

  /** 綁定員工 id → 員工信息（真實數據，顯示工號） */
  const boundEmployees = useMemo(() => {
    if (!config) return []
    const empMap = new Map<number, EmployeeItem>()
    employees.forEach((e) => empMap.set(e.id, e))
    return config.userIds
      .map((id) => empMap.get(id))
      .filter((e): e is EmployeeItem => e != null)
  }, [config, employees])

  const handleBack = () => navigate('/ai-emp-model-auth#role')

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!config) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 16, color: '#8C8C8C' }}>角色授權信息加載失敗</div>
        <Button style={{ marginTop: 16 }} onClick={handleBack}>返回列表</Button>
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 頭部概覽卡（全局統一規範：詳情頁紫色頂條 + 橙色返回 + 紫色編輯） */}
      <div style={{
        position: 'relative', background: '#fff', marginBottom: 16,
        borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
      }}>
        <div style={{
          height: 3, background: 'linear-gradient(90deg, #722ED1, #B37FEB, #D3ADF7, #B37FEB, #722ED1)',
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
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff', display: 'flex', alignItems: 'center', gap: 10 }}>
                授權模型詳情-角色
                {config.status === 1 ? <Tag color="success">啟用</Tag> : <Tag color="default">停用</Tag>}
              </h2>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>
                {config.roleName} · 最後更新：{config.updatedBy ?? '-'} · {config.updatedAt ?? '-'}
              </div>
            </div>
          </div>
          <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/ai-role-auth-edit?roleId=${config.roleId}`)}
            style={{
              backgroundColor: '#722ED1', borderColor: '#722ED1', borderRadius: 8,
              height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
              boxShadow: '0 2px 6px rgba(114,46,209,0.25)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>編輯</Button>
        </div>
      </div>

      {/* ══ 分区 1：统计概览（數據指標統計卡標準 12.1） ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChartOutlined style={{ fontSize: 14, color: '#52C41A' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>统计概览</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div key={config.roleId} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#F9F0FF', border: '1px solid #722ED122', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#722ED1' }}>
              <AnimatedNumber value={config.modelConfigs.length} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>授權模型</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#E6F7FF', border: '1px solid #1890FF22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#1890FF' }}>
              <AnimatedNumber value={config.userIds.length} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>綁定員工</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#F6FFED', border: '1px solid #52C41A22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#52C41A' }}>
              <AnimatedNumber value={config.modelConfigs.reduce((s, c) => s + (c.visionSupport + c.functionCalling + c.jsonMode + c.streaming + c.thinkingMode), 0)} />
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>開放能力項</div>
          </div>
          <div style={{ padding: 16, borderRadius: 12, textAlign: 'center', background: '#FFF7E6', border: '1px solid #E8720C22', transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)', cursor: 'default' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#E8720C' }}>
              {config.createdAt?.split('T')[0] ?? '-'}
            </div>
            <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>創建時間</div>
          </div>
        </div>
      </div>

      {/* ═══ 分区 2：绑定员工（顯示工號） ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>綁定員工</span>
          <Tag color="blue">{config.userIds.length} 名員工</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {boundEmployees.map((emp) => (
            <Tag key={emp.id} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>
              {emp.name}（{emp.empId}）
              {emp.department && <span style={{ color: '#8C8C8C', marginLeft: 4 }}>· {emp.department}</span>}
            </Tag>
          ))}
          {boundEmployees.length === 0 && <span style={{ color: '#BFBFBF' }}>暫無綁定員工</span>}
        </div>
      </div>

      {/* ═══ 分区 3：授权模型（能力顆粒度矩陣） ═══ */}
      <ModelAuthSectionReadonly models={models} configs={config.modelConfigs} />

      {/* ═══ 分区 4：基础信息 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AppstoreOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>基础信息</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {([
            { label: '角色名稱', value: config.roleName },
            { label: '描述', value: config.description || '-' },
            { label: '角色類型', value: '自定義角色（非權限系統角色）' },
            { label: '角色狀態', value: config.status === 1 ? '啟用' : '停用' },
            { label: '最後更新人', value: config.updatedBy ?? '-' },
            { label: '創建時間', value: config.createdAt ?? '-' },
            { label: '更新時間', value: config.updatedAt ?? '-' },
          ] as Array<{ label: string; value: string }>).map((item) => (
            <div key={item.label}>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontSize: 14, color: '#262626', fontWeight: 500 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
