import { useState, useEffect } from 'react'
import { Modal, Form, Input, Select, Radio, Divider, Tabs } from 'antd'
import {
  UserOutlined,
  TeamOutlined,
  ApartmentOutlined,
  CrownOutlined,
} from '@ant-design/icons'
import {
  APPROVER_TYPE_LABELS,
  APPROVAL_RULE_LABELS,
  createDefaultApproverConfig,
} from './types'
import type { WorkflowNode, ApproverType, ApprovalRule, ApproverConfig, ApproverSetting } from './types'
import { getApproverOptions } from './options'

interface Props {
  open: boolean
  /** 編輯時傳入已有節點，新增時為 null */
  node: WorkflowNode | null
  /** 新增時的節點排序號 */
  nextSortOrder: number
  onOk: (values: {
    name: string
    approverConfig: ApproverConfig
    ccUserIds: string[]
  }) => void
  onCancel: () => void
}

/** 審批人圖標 */
const approverTypeIcons: Record<ApproverType, React.ReactNode> = {
  person: <UserOutlined />,
  role: <TeamOutlined />,
  department_leader: <ApartmentOutlined />,
  initiator_leader: <CrownOutlined />,
}

/** 品牌 Tab 鍵 */
type BrandTabKey = '1' | '2'
const BRAND_TABS: { key: BrandTabKey; label: string }[] = [
  { key: '1', label: '閃蜂' },
  { key: '2', label: 'mFood' },
]

/** 取得某品牌的配置（不存在時返回空默認） */
function getBrandSetting(config: ApproverConfig | undefined, brand: string, fallbackType: ApproverType): ApproverSetting {
  if (config?.byBrand && config.brands[brand]) {
    return { ...config.brands[brand], approverType: fallbackType }
  }
  return { approverType: fallbackType, approverIds: [], approvalRule: 'any' }
}

/** 審批人配置彈窗 */
export default function ApproverConfigModal({ open, node, nextSortOrder, onOk, onCancel }: Props) {
  const [form] = Form.useForm()
  const [approverType, setApproverType] = useState<ApproverType>('role')
  const [activeTab, setActiveTab] = useState('default')
  /** 各品牌的獨立配置（通用=default，閃蜂=1，mFood=2） */
  const [brandSettings, setBrandSettings] = useState<Record<string, { approverIds: string[]; approvalRule: ApprovalRule }>>({
    default: { approverIds: [], approvalRule: 'any' },
    '1': { approverIds: [], approvalRule: 'any' },
    '2': { approverIds: [], approvalRule: 'any' },
  })

  const isInitiatorLeader = approverType === 'initiator_leader'

  /* 打開時初始化 */
  useEffect(() => {
    if (!open) return
    if (node) {
      const cfg = node.approverConfig || createDefaultApproverConfig(
        node.approverType || 'role',
        node.approverIds || [],
        node.approvalRule || 'any',
      )
      const type = cfg.default.approverType
      setApproverType(type)
      setBrandSettings({
        default: { approverIds: cfg.default.approverIds, approvalRule: cfg.default.approvalRule },
        '1': {
          approverIds: cfg.brands['1']?.approverIds || [],
          approvalRule: cfg.brands['1']?.approvalRule || 'any',
        },
        '2': {
          approverIds: cfg.brands['2']?.approverIds || [],
          approvalRule: cfg.brands['2']?.approvalRule || 'any',
        },
      })
      setActiveTab('default')
      form.setFieldsValue({
        name: node.name,
        approverType: type,
        approverIds: cfg.default.approverIds,
        approvalRule: cfg.default.approvalRule,
        ccUserIds: node.ccUserIds,
      })
    } else {
      form.resetFields()
      setApproverType('role')
      setActiveTab('default')
      setBrandSettings({
        default: { approverIds: [], approvalRule: 'any' },
        '1': { approverIds: [], approvalRule: 'any' },
        '2': { approverIds: [], approvalRule: 'any' },
      })
      form.setFieldsValue({
        sortOrder: nextSortOrder,
        approverType: 'role',
        approverIds: [],
        approvalRule: 'any',
      })
    }
  }, [open, node, nextSortOrder, form])

  /* 切換品牌 Tab 時，先保存當前 Tab 的表單值到 state，再載入新 Tab 的值 */
  const handleTabChange = (key: string) => {
    // 保存當前 Tab 的數據
    setBrandSettings(prev => ({
      ...prev,
      [activeTab]: {
        approverIds: form.getFieldValue('approverIds') || [],
        approvalRule: form.getFieldValue('approvalRule') || 'any',
      },
    }))
    // 切換到新 Tab
    setActiveTab(key)
    const setting = key === 'default' ? brandSettings.default : brandSettings[key]
    form.setFieldsValue({
      approverIds: setting?.approverIds || [],
      approvalRule: setting?.approvalRule || 'any',
    })
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      // 先把當前 Tab 的最新值寫入 state
      const latestSettings = {
        ...brandSettings,
        [activeTab]: {
          approverIds: values.approverIds || [],
          approvalRule: values.approvalRule || 'any',
        },
      }
      const type = values.approverType as ApproverType
      const result: ApproverConfig = {
        byBrand: false,
        default: { approverType: type, ...latestSettings.default },
        brands: {},
      }
      // 檢查各品牌是否與通用不同
      for (const { key } of BRAND_TABS) {
        const bs = latestSettings[key]
        if (bs && (bs.approverIds.length > 0 || bs.approvalRule !== 'any')) {
          result.byBrand = true
          result.brands[key] = { approverType: type, ...bs }
        }
      }
      onOk({
        name: values.name,
        approverConfig: result,
        ccUserIds: values.ccUserIds || [],
      })
    } catch { /* 表單校驗失敗 */ }
  }

  /** 審批人類型切換 */
  const handleTypeChange = (type: ApproverType) => {
    setApproverType(type)
    if (type === 'initiator_leader') {
      setActiveTab('default')
    }
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TeamOutlined style={{ color: '#E8720C' }} />
          <span>{node ? `審批人設置：${node.name}` : '新增審批節點'}</span>
        </div>
      }
      open={open}
      onOk={handleOk}
      onCancel={onCancel}
      okText="確認"
      cancelText="取消"
      width={640}
      destroyOnClose
      styles={{ body: { maxHeight: '65vh', overflowY: 'auto', padding: '16px 24px' } }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Form.Item name="name" label="節點名稱" rules={[{ required: true, message: '請輸入節點名稱' }]}>
          <Input placeholder="如：業務主管審批" maxLength={30} />
        </Form.Item>

        <Divider style={{ margin: '12px 0' }} />

        {/* 審批人類型（所有品牌共用） */}
        <Form.Item name="approverType" label="審批人類型">
          <Radio.Group onChange={e => handleTypeChange(e.target.value)}>
            {(Object.entries(APPROVER_TYPE_LABELS) as [ApproverType, string][]).map(([key, label]) => (
              <Radio.Button key={key} value={key} style={{ marginBottom: 4 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {approverTypeIcons[key]}{label}
                </span>
              </Radio.Button>
            ))}
          </Radio.Group>
        </Form.Item>

        {/* 直屬領導：無需配置 */}
        {isInitiatorLeader ? (
          <div style={{ padding: '8px 12px', background: '#F6FFED', borderRadius: 6, fontSize: 12, color: '#52C41A', marginBottom: 16 }}>
            <CrownOutlined style={{ marginRight: 4 }} />
            自動取發起人的直屬領導作為審批人，無需手動配置
          </div>
        ) : (
          <>
            {/* 品牌 Tab：通用 / 閃蜂 / mFood */}
            <Tabs
              activeKey={activeTab}
              onChange={handleTabChange}
              items={[
                { key: 'default', label: '通用' },
                ...BRAND_TABS.map(b => ({ key: b.key, label: b.label })),
              ]}
              style={{ marginBottom: 8 }}
            />

            {/* 指定人員 */}
            {approverType === 'person' && (
              <Form.Item name="approverIds" label="選擇人員" rules={[{ required: true, message: '請選擇審批人員' }]}>
                <Select mode="multiple" placeholder="選擇審批人員" options={getApproverOptions('person')} />
              </Form.Item>
            )}

            {/* 指定角色 */}
            {approverType === 'role' && (
              <Form.Item name="approverIds" label="選擇角色" rules={[{ required: true, message: '請選擇審批角色' }]}>
                <Select mode="multiple" placeholder="選擇審批角色" options={getApproverOptions('role')} />
              </Form.Item>
            )}

            {/* 部門負責人 */}
            {approverType === 'department_leader' && (
              <Form.Item name="approverIds" label="選擇部門" rules={[{ required: true, message: '請選擇部門' }]}>
                <Select mode="multiple" placeholder="選擇部門（取該部門負責人為審批人）" options={getApproverOptions('department_leader')} />
              </Form.Item>
            )}

            <Form.Item name="approvalRule" label="審批規則" initialValue="any">
              <Radio.Group>
                {(Object.entries(APPROVAL_RULE_LABELS) as [ApprovalRule, string][]).map(([key, label]) => (
                  <Radio key={key} value={key}>{label}</Radio>
                ))}
              </Radio.Group>
            </Form.Item>
          </>
        )}

        <Divider style={{ margin: '12px 0' }} />

        {/* 抄送 */}
        <Form.Item name="ccUserIds" label="抄送人員">
          <Select mode="multiple" placeholder="選擇抄送人員（可選）" options={getApproverOptions('person')} allowClear />
        </Form.Item>
      </Form>
    </Modal>
  )
}
