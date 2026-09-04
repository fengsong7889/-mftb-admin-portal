import { useEffect, useState } from 'react'
import { Button, Tag, Spin, Tooltip, message } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppstoreOutlined, TeamOutlined, EyeOutlined, BarChartOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons'
import DetailPageHeader from '../../components/DetailPageHeader'
import {
  fetchModels,
  getDeptAuthGroupById,
  type AiModel,
  type DeptAuthGroupDetail,
} from '../../api'

/* ────────────────── 能力常量 ────────────────── */

const CAPABILITY_FIELDS = [
  { key: 'visionSupport' as const, label: '視覺', color: '#722ED1' },
  { key: 'functionCalling' as const, label: '工具', color: '#1890FF' },
  { key: 'jsonMode' as const, label: 'JSON', color: '#13C2C2' },
  { key: 'streaming' as const, label: '流式', color: '#52C41A' },
  { key: 'thinkingMode' as const, label: '思考', color: '#E8720C' },
]

const MODEL_TYPE_TAG: Record<string, string> = {
  chat: 'processing', completion: 'blue', embedding: 'purple', token_count: 'default',
}
const MODEL_TYPE_LABEL: Record<string, string> = {
  chat: '對話', completion: '文本生成', embedding: '向量嵌入', token_count: 'Token 計數',
}

export default function DeptAuthGroupDetail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const groupId = searchParams.get('id')

  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<DeptAuthGroupDetail | null>(null)
  const [models, setModels] = useState<AiModel[]>([])

  useEffect(() => {
    if (!groupId) {
      message.error('缺少策略 ID')
      navigate('/ai-dept-model-auth')
      return
    }
    setLoading(true)
    Promise.all([
      getDeptAuthGroupById(Number(groupId)),
      fetchModels({ status: 1 }),
    ]).then(([data, modelList]) => {
      setDetail(data)
      setModels(modelList)
    }).catch(() => {
      message.error('加載詳情失敗')
    }).finally(() => setLoading(false))
  }, [groupId, navigate])

  const modelMap = new Map(models.map((m) => [m.id, m]))

  const handleBack = () => navigate('/ai-dept-model-auth')

  if (loading) {
    return (
      <div className="content-area" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        <div style={{ fontSize: 16, color: '#8C8C8C' }}>策略信息加載失敗</div>
        <Button style={{ marginTop: 16 }} onClick={handleBack}>返回列表</Button>
      </div>
    )
  }

  const enabledModelCount = detail.modelConfigs.length
  const totalDeptCount = detail.departments.length

  return (
    <div className="content-area">
      {/* 頭部概覽卡（全局統一規範：詳情頁紫色頂條 + 橙色返回 + 權限門控紫色編輯） */}
      <DetailPageHeader
        title="授權模型詳情-部門"
        tags={
          <>
            <Tag color={detail.status === 1 ? 'success' : 'default'} style={{ margin: 0 }}>
              {detail.status === 1 ? '啟用' : '停用'}
            </Tag>
            {detail.dataResidency === 1 && <Tag color="purple" style={{ margin: 0 }}>數據不出域</Tag>}
          </>
        }
        meta={<>{detail.name} · 最後更新：{detail.updatedBy ?? '-'} · {detail.updatedAt ?? '-'}</>}
        onBack={handleBack}
        onEdit={() => navigate(`/ai-dept-auth-edit?id=${detail.id}`)}
        menuKey="ai-dept-model-auth"
      />

      {/* ═══ 分区 1：统计概览 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChartOutlined style={{ fontSize: 14, color: '#52C41A' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>统计概览</span>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {([
            { label: '關聯部門', value: totalDeptCount, color: '#1890FF', bg: '#E6F7FF' },
            { label: '覆蓋人數', value: detail.totalEmployeeCount, color: '#52C41A', bg: '#F6FFED' },
            { label: '授權模型', value: enabledModelCount, color: '#722ED1', bg: '#F9F0FF' },
            { label: '創建時間', value: detail.createdAt?.split(' ')[0] ?? '-', color: '#E8720C', bg: '#FFF7E6', isText: true },
          ] as Array<{ label: string; value: number | string; color: string; bg: string; isText?: boolean }>).map((item) => (
            <div key={item.label} style={{
              padding: '16px', borderRadius: 12, textAlign: 'center',
              background: item.bg, border: `1px solid ${item.color}22`,
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'default',
            }}>
              <div style={{ fontSize: item.isText ? 16 : 22, fontWeight: 700, color: item.color }}>
                {item.isText ? item.value : (typeof item.value === 'number' ? item.value.toLocaleString() : item.value)}
              </div>
              <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ 分区 2：适用部门 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TeamOutlined style={{ fontSize: 14, color: '#1890ff' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>適用部門</span>
          <Tag color="blue">{totalDeptCount} 個部門</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {detail.departments.map((d) => (
            <Tag key={d.deptId} style={{ fontSize: 13, padding: '4px 12px', lineHeight: '24px' }}>
              {d.deptName}（{d.employeeCount} 人）
            </Tag>
          ))}
          {detail.departments.length === 0 && <span style={{ color: '#BFBFBF' }}>暫無關聯部門</span>}
        </div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#595959' }}>
          共覆蓋 <strong>{detail.totalEmployeeCount.toLocaleString()}</strong> 人
        </div>
      </div>

      {/* ═══ 分区 3：授权模型 ═══ */}
      <div style={{ border: '1px solid #e8eaed', borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f9f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EyeOutlined style={{ fontSize: 14, color: '#722ED1' }} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>授權模型</span>
          <Tag color="purple">{enabledModelCount} 個模型</Tag>
          <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {detail.modelConfigs.map((config) => {
            const model = modelMap.get(config.modelId)
            return (
              <div key={config.modelId} style={{
                border: '1px solid #D3ADF7', borderRadius: 10, padding: 16,
                background: '#F9F0FF',
              }}>
                {/* 模型头部 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#262626' }}>
                      {model?.name ?? `模型 #${config.modelId}`}
                    </span>
                    {model?.type && (
                      <Tag color={MODEL_TYPE_TAG[model.type]} style={{ fontSize: 11 }}>
                        {MODEL_TYPE_LABEL[model.type] || model.type}
                      </Tag>
                    )}
                  </div>
                  <Tag color="success" style={{ fontSize: 11 }}>已授權</Tag>
                </div>

                {/* 能力矩阵 */}
                <div style={{ borderTop: '1px solid #E8D5F5', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: '#8C8C8C', marginBottom: 8 }}>能力配置</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {CAPABILITY_FIELDS.map(({ key, label, color }) => {
                      const supported = config[key] === 1
                      return (
                        <div key={key} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '4px 10px', borderRadius: 6,
                          background: supported ? `${color}0A` : '#F5F5F5',
                          border: `1px solid ${supported ? color + '30' : '#E8E8E8'}`,
                        }}>
                          {supported ? (
                            <CheckCircleFilled style={{ fontSize: 12, color }} />
                          ) : (
                            <CloseCircleFilled style={{ fontSize: 12, color: '#BFBFBF' }} />
                          )}
                          <span style={{ fontSize: 12, color: supported ? '#262626' : '#BFBFBF' }}>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
          {detail.modelConfigs.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#BFBFBF' }}>
              暫無授權模型
            </div>
          )}
        </div>
      </div>

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
            { label: '策略名稱', value: detail.name },
            { label: '數據不出域', value: detail.dataResidency === 1 ? '已啟用' : '未啟用' },
            { label: '狀態', value: detail.status === 1 ? '啟用' : '停用' },
            { label: '最後更新人', value: detail.updatedBy ?? '-' },
            { label: '創建時間', value: detail.createdAt ?? '-' },
            { label: '更新時間', value: detail.updatedAt ?? '-' },
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
