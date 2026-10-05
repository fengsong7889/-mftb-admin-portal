/**
 * 提交需求 —— 全员需求入口（表单页，独立页面非弹窗）
 *
 * 交互要点：
 * 1. 需求定位支持「针对现有系统/菜单/功能」与「全新需求」两条路径；
 * 2. 受理路径支持「直接指定产品经理（显示负载）」与「提交技术部统一分发」；
 * 3. 执行顺序：表单校验 → 二次确认弹窗 → 提交（禁止先弹框后校验）。
 */
import { useEffect, useMemo, useState } from 'react'
import { Button, Cascader, Checkbox, DatePicker, Form, Input, Modal, Radio, Select, Space, Tooltip, Upload, message } from 'antd'
import type { RcFile } from 'antd/es/upload'
import {
  AimOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  NodeIndexOutlined,
  RollbackOutlined,
  SaveOutlined,
  SendOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import RdmFormHeader from './components/RdmFormHeader'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  createRequirement,
  fetchFunctionPoints,
  fetchMenuTree,
  fetchProductOptions,
  uploadAttachment,
  type RdmMenuTreeNode,
  type RdmProductOption,
  type RdmRequirementForm,
} from '../../api/rdm'
import SimilarNotice from './components/SimilarNotice'
import {
  RDM_ANCHOR_LABEL,
  RDM_ANCHOR_TYPE,
  RDM_COMPLEXITY_LABEL,
  RDM_PRIORITY,
  RDM_PRIORITY_LABEL,
  RDM_PRIORITY_SLA_DAYS,
  RDM_REQ_TYPE,
  RDM_REQ_TYPE_LABEL,
  type RdmAnchorType,
  type RdmComplexity,
  type RdmPriority,
  type RdmReqType,
} from '../../constants/rdm'
import './index.css'

const { TextArea } = Input

/** 表单内部结构（含级联字段，提交时转换为接口入参） */
interface FormValues {
  title: string
  reqType: RdmReqType
  priority: RdmPriority
  complexity?: RdmComplexity
  expectDate?: dayjs.Dayjs
  anchorType: RdmAnchorType
  menuPath?: (string | number)[]
  functionPoint?: string
  anchorName?: string
  anchorDesc?: string
  description: string
  expectResult?: string
  businessValue?: string
  assignMode: 'PM' | 'POOL'
  pmUserId?: number
  needApproval?: boolean
}

export default function RequirementSubmit() {
  const navigate = useNavigate()
  const [form] = Form.useForm<FormValues>()
  const [menuTree, setMenuTree] = useState<RdmMenuTreeNode[]>([])
  const [pmOptions, setPmOptions] = useState<RdmProductOption[]>([])
  const [functionPoints, setFunctionPoints] = useState<{ key: string; title: string }[]>([])
  const [submitting, setSubmitting] = useState(false)
  /** 已上传附件（含 Base64 dataUrl；screenshot 标记作为现状主图） */
  const [attachments, setAttachments] = useState<{
    name: string; fileType: string; fileSize: number; dataUrl: string
  }[]>([])
  const [uploading, setUploading] = useState(false)

  /** 上传一个文件到需求附件（失败已经请求层统一提示） */
  const handleUpload = async (file: File) => {
    if (attachments.length >= 5) {
      message.warning('最多上傳 5 個附件')
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadAttachment(file)
      setAttachments(prev => [...prev, {
        name: uploaded.name,
        fileType: uploaded.fileType,
        fileSize: uploaded.fileSize,
        dataUrl: uploaded.dataUrl,
      }])
      message.success('附件已上傳')
    } catch (err) {
      message.error(err instanceof Error && err.message ? err.message : '附件上傳失敗')
    } finally {
      setUploading(false)
    }
  }

  const assignMode = Form.useWatch('assignMode', form)
  // 查重联动：标题与期望结果变化时提示相似需求（仅提示，不拦提交）
  const titleValue = Form.useWatch('title', form)
  const expectValue = Form.useWatch('expectResult', form)
  const anchorType = Form.useWatch('anchorType', form)
  const menuPath = Form.useWatch('menuPath', form)
  const pmUserId = Form.useWatch('pmUserId', form)

  /** 是否针对现有入口（非「全新需求」时需要选择菜单定位） */
  const needLocate = anchorType !== RDM_ANCHOR_TYPE.NONE

  useEffect(() => {
    fetchMenuTree().then(setMenuTree).catch(() => setMenuTree([]))
    fetchProductOptions().then(setPmOptions).catch(() => setPmOptions([]))
  }, [])

  /** 选中菜单后拉取该菜单的功能点候选 */
  useEffect(() => {
    const menuKey = menuPath?.[1] ? String(menuPath[1]) : undefined
    if (!menuKey) {
      setFunctionPoints([])
      return
    }
    fetchFunctionPoints(menuKey).then(setFunctionPoints).catch(() => setFunctionPoints([]))
  }, [menuPath])

  const menuCascaderOptions = useMemo(
    () => menuTree.map(sys => ({
      value: sys.key,
      label: sys.title,
      children: (sys.children ?? []).map(menu => ({ value: menu.key, label: menu.title })),
    })),
    [menuTree],
  )

  const selectedPm = useMemo(
    () => pmOptions.find(p => p.userId === pmUserId),
    [pmOptions, pmUserId],
  )

  /** 菜单路径 → 可读名称（系统 / 菜单） */
  const resolveMenuLabels = (path?: (string | number)[]) => {
    if (!path || path.length === 0) return { systemName: undefined as string | undefined, menuName: undefined as string | undefined }
    const sys = menuTree.find(s => s.key === String(path[0]))
    const menu = sys?.children?.find(m => m.key === String(path[1]))
    return { systemName: sys?.title, menuName: menu?.title }
  }

  /** 提交前二次确认（先校验后弹框） */
  const handleSubmit = async () => {
    const values = await form.validateFields()
    const pm = pmOptions.find(p => p.userId === values.pmUserId)
    const { menuName } = resolveMenuLabels(values.menuPath)
    const anchorDesc = values.anchorName || values.functionPoint || menuName || '全新需求'

    Modal.confirm({
      title: '確認提交需求？',
      className: 'custom-confirm-modal',
      icon: <div className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></div>,
      content: (
        <div className="confirm-info-card">
          <div className="confirm-info-row"><span>需求標題：</span><b>{values.title}</b></div>
          <div className="confirm-info-row"><span>需求類型：</span><b>{RDM_REQ_TYPE_LABEL[values.reqType]}</b></div>
          <div className="confirm-info-row"><span>優先級：</span><b>{RDM_PRIORITY_LABEL[values.priority]}</b></div>
          <div className="confirm-info-row">
            <span>需求定位：</span>
            <b>{values.anchorType === RDM_ANCHOR_TYPE.NONE ? '全新需求' : `${RDM_ANCHOR_LABEL[values.anchorType]} · ${anchorDesc}`}</b>
          </div>
          <div className="confirm-info-row">
            <span>受理路徑：</span>
            <b>{values.assignMode === 'PM' ? `指定產品經理（${pm?.name ?? '-'}）` : '提交技術部統一分配'}</b>
          </div>
          <div className="confirm-info-row">
            <span>審批要求：</span>
            <b>{values.needApproval === false ? '免審批直達技術部' : '需上級/指定人審批後到達技術部'}</b>
          </div>
          {values.expectDate && (
            <div className="confirm-info-row"><span>期望完成：</span><b>{values.expectDate.format('YYYY-MM-DD')}</b></div>
          )}
        </div>
      ),
      okText: '確認提交',
      cancelText: '返回修改',
      onOk: async () => {
        setSubmitting(true)
        try {
          const payload: RdmRequirementForm = {
            title: values.title,
            reqType: values.reqType,
            priority: values.priority,
            complexity: values.complexity,
            expectDate: values.expectDate?.format('YYYY-MM-DD'),
            description: values.description,
            expectResult: values.expectResult,
            businessValue: values.businessValue,
            targets: [{
              anchorType: values.anchorType,
              systemCode: values.menuPath?.[0] ? String(values.menuPath[0]) : undefined,
              menuKey: values.menuPath?.[1] ? String(values.menuPath[1]) : undefined,
              anchorName: values.anchorName ?? values.functionPoint,
              anchorDesc: values.anchorDesc,
              // 首张图片作为现状主图，跟随定位对象展示
              screenshotUrl: attachments.find(a => a.fileType.startsWith('image/'))?.dataUrl,
            }],
            assignMode: values.assignMode,
            pmUserId: pm?.userId,
            pmName: pm?.name,
            needApproval: values.needApproval !== false,
            attachments: attachments.map(a => ({
              fileName: a.name,
              storagePath: a.dataUrl,
              fileType: a.fileType,
              fileSize: a.fileSize,
            })),
          }
          const created = await createRequirement(payload, 'submit')
          message.success(`需求已提交，編號 ${created.reqNo}`)
          navigate(`/rdm-detail?id=${created.id}`)
        } catch {
          message.error('提交失敗，請重試')
        } finally {
          setSubmitting(false)
        }
      },
    })
  }

  /** 保存草稿（不做二次确认，仅轻校验） */
  const handleSaveDraft = async () => {
    const values = await form.validateFields(['title', 'reqType', 'priority', 'description'])
    await createRequirement({
      title: values.title,
      reqType: values.reqType,
      priority: values.priority,
      description: values.description ?? '',
      targets: [],
      assignMode: 'POOL',
    }, 'draft')
    message.success('已保存草稿')
    navigate('/rdm-requirement?scope=mine')
  }

  return (
    <div className="content-area">
      {/* ── 页面头部（统一组件）── */}
      <RdmFormHeader
        title="提交需求"
        backText="返回工作台"
        onBack={() => navigate('/rdm-workbench')}
        meta="支持對現有菜單/功能提出優化，也可提出全新菜單或系統級需求；提交後按規則流轉至審批人與技術部"
      />

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          anchorType: RDM_ANCHOR_TYPE.MENU,
          reqType: RDM_REQ_TYPE.OPTIMIZE,
          priority: RDM_PRIORITY.P2,
          assignMode: 'POOL',
          needApproval: true,
        }}
      >
        {/* ── ① 需求定位 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#E6F7FF', color: '#1890FF' }}><AimOutlined /></span>
            需求定位
            <Tooltip title="選擇需求針對的具體系統/菜單/功能，產研可直達現場，減少反覆溝通">
              <InfoCircleOutlined style={{ color: '#8C8C8C', fontSize: 12 }} />
            </Tooltip>
          </div>
          <Form.Item label="需求針對對象" name="anchorType">
            <Radio.Group optionType="button" buttonStyle="solid">
              {(Object.keys(RDM_ANCHOR_LABEL) as RdmAnchorType[]).map(key => (
                <Radio.Button key={key} value={key}>{RDM_ANCHOR_LABEL[key]}</Radio.Button>
              ))}
            </Radio.Group>
          </Form.Item>
          {needLocate && (
            <Space style={{ width: '100%' }} size={12} align="start">
              <Form.Item label="系統 / 菜單" name="menuPath" rules={[{ required: true, message: '請選擇所屬系統與菜單' }]}>
                <Cascader
                  style={{ width: 320 }}
                  options={menuCascaderOptions}
                  placeholder="例：廣告推薦系統 / 報表分析"
                  showSearch
                />
              </Form.Item>
              <Form.Item label="功能點（可多選，最後一項為自定義）" name="functionPoint">
                <Select
                  style={{ width: 260 }}
                  allowClear
                  disabled={functionPoints.length === 0}
                  placeholder={functionPoints.length ? '選擇已有功能點' : '該菜單暫無功能點清單'}
                  options={functionPoints.map(fp => ({ value: fp.title, label: fp.title }))}
                />
              </Form.Item>
              <Form.Item label="具體位置/按鈕名稱" name="anchorName">
                <Input style={{ width: 220 }} placeholder="例：報表右上角導出按鈕" />
              </Form.Item>
            </Space>
          )}
          <Form.Item label="定位補充說明 / 現狀截圖" name="anchorDesc">
            <TextArea rows={2} placeholder="描述當前該位置的操作路徑；可上傳截圖或文檔附件作為現狀依據" />
          </Form.Item>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Space size={12}>
              <Upload
                multiple
                showUploadList={false}
                beforeUpload={(file: RcFile) => { void handleUpload(file); return false }}
              >
                <Button icon={<CameraOutlined />} loading={uploading}>上傳現狀截圖 / 附件</Button>
              </Upload>
              <span style={{ fontSize: 12, color: '#8C8C8C' }}>
                支持圖片與 pdf/doc/xls/ppt/zip，單個不超過 5MB，最多 5 個
              </span>
            </Space>
            {attachments.length > 0 && (
              <Space size={8} wrap>
                {attachments.map((att, idx) => {
                  const isImage = att.fileType.startsWith('image/')
                  return (
                    <div key={`${att.name}-${idx}`} style={{
                      position: 'relative', border: '1px solid #e8eaed', borderRadius: 6,
                      padding: 6, background: '#FAFBFC', maxWidth: 180,
                    }}>
                      {isImage ? (
                        <img src={att.dataUrl} alt={att.name} style={{ width: 156, height: 88, objectFit: 'cover', borderRadius: 4 }} />
                      ) : (
                        <div style={{ width: 156, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#8C8C8C' }}>
                          {att.name}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#8C8C8C', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 156 }}>
                        {att.name} · {(att.fileSize / 1024).toFixed(0)} KB
                      </div>
                      <Button
                        type="link"
                        size="small"
                        danger
                        style={{ position: 'absolute', top: 2, right: 2, padding: '0 4px' }}
                        onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                      >
                        ×
                      </Button>
                    </div>
                  )
                })}
              </Space>
            )}
          </Space>
        </div>

        {/* ── ② 需求内容 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#FFF7E6', color: '#E8720C' }}><FileTextOutlined /></span>
            需求內容
          </div>
          <Form.Item
            label="需求標題"
            name="title"
            rules={[{ required: true, message: '請填寫需求標題' }, { max: 80, message: '不超過 80 字' }]}
          >
            <Input placeholder="一句話說清要做什麼，例：推薦報表支持自定義時間區間導出" showCount maxLength={80} />
          </Form.Item>
          <SimilarNotice title={titleValue} expectText={expectValue} />
          <Space size={12} style={{ flexWrap: 'wrap' }}>
            <Form.Item label="需求類型" name="reqType" rules={[{ required: true, message: '請選擇需求類型' }]}>
              <Select
                style={{ width: 180 }}
                options={Object.entries(RDM_REQ_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
            <Form.Item label="優先級" name="priority" rules={[{ required: true, message: '請選擇優先級' }]}>
              <Select
                style={{ width: 200 }}
                options={Object.entries(RDM_PRIORITY_LABEL).map(([value, label]) => ({
                  value,
                  label: `${label}（產研承諾 ${RDM_PRIORITY_SLA_DAYS[value as RdmPriority]} 天內響應）`,
                }))}
              />
            </Form.Item>
            <Form.Item label="預期規模" name="complexity">
              <Select
                style={{ width: 140 }}
                allowClear
                placeholder="由產品經理評估"
                options={Object.entries(RDM_COMPLEXITY_LABEL).map(([value, label]) => ({ value, label }))}
              />
            </Form.Item>
            <Form.Item label="期望完成時間" name="expectDate">
              <DatePicker style={{ width: 160 }} placeholder="選填" minDate={dayjs()} />
            </Form.Item>
          </Space>
          <Form.Item
            label="現狀與痛點"
            name="description"
            rules={[{ required: true, message: '請描述當前是怎麼做的、遇到什麼問題' }]}
          >
            <TextArea rows={4} placeholder={'例：現在導出只能選「本月/上個月」兩個固定區間，跨月對帳要反覆切換導出再手動合併，財務每月多花 6 小時且容易錯。'} />
          </Form.Item>
          <Form.Item label="期望結果（做成什麼樣就滿足）" name="expectResult">
            <TextArea rows={3} placeholder="例：報表頁可自定義開始/結束日期，一次導出任意區間，文件名帶上區間信息。" />
          </Form.Item>
          <Form.Item label="業務價值（可量化最佳，用於產研排優先）" name="businessValue">
            <TextArea rows={2} placeholder="例：每月節省財務與運營 6 人時；避免手工合併導致的口徑錯誤。" />
          </Form.Item>
        </div>

        {/* ── ③ 受理路径 ── */}
        <div className="rdm-form-section">
          <div className="rdm-form-section-title">
            <span className="rdm-icon-block" style={{ background: '#F9F0FF', color: '#722ED1' }}><NodeIndexOutlined /></span>
            受理路徑
          </div>
          <div className="rdm-assign-card">
            <div
              className={`rdm-assign-option ${assignMode === 'POOL' ? 'active' : ''}`}
              onClick={() => form.setFieldValue('assignMode', 'POOL')}
            >
              <div className="rdm-assign-option-title">
                <TeamOutlined style={{ color: assignMode === 'POOL' ? '#E8720C' : '#8C8C8C' }} />
                提交技術部統一分配（推薦）
              </div>
              <div className="rdm-assign-option-desc">
                需求進入需求池，由技術部負責人瞭解後分發給對應產品經理，避免找錯人。
              </div>
            </div>
            <div
              className={`rdm-assign-option ${assignMode === 'PM' ? 'active' : ''}`}
              onClick={() => form.setFieldValue('assignMode', 'PM')}
            >
              <div className="rdm-assign-option-title">
                <CheckCircleOutlined style={{ color: assignMode === 'PM' ? '#E8720C' : '#8C8C8C' }} />
                我已知道對口的產品經理
              </div>
              <div className="rdm-assign-option-desc">直接指定受理人，跳過需求池分配，響應更快。</div>
            </div>
          </div>
          <Form.Item name="assignMode" hidden><Input /></Form.Item>
          {assignMode === 'PM' && (
            <Form.Item
              label="產品經理"
              name="pmUserId"
              rules={[{ required: true, message: '請選擇產品經理' }]}
              style={{ marginTop: 12 }}
              extra={selectedPm ? `當前在途需求 ${selectedPm.activeCount} 個 / 容量 ${selectedPm.capacity} 個，負責域：${selectedPm.domains.join('、')}` : undefined}
            >
              <Select
                style={{ width: 360 }}
                placeholder="選擇產品經理"
                options={pmOptions.map(pm => ({
                  value: pm.userId,
                  label: `${pm.name}（在途 ${pm.activeCount}/${pm.capacity} · ${pm.domains.join('/')}）`,
                }))}
              />
            </Form.Item>
          )}
          {assignMode === 'PM' && selectedPm && (
            <div style={{ maxWidth: 360, marginBottom: 12 }}>
              <div className="rdm-load-bar">
                <div className="rdm-load-bar-inner" style={{ width: `${Math.min((selectedPm.activeCount / selectedPm.capacity) * 100, 100)}%` }} />
              </div>
            </div>
          )}
          <Space size={24} style={{ marginTop: 4 }}>
            <Form.Item name="needApproval" valuePropName="checked" noStyle>
              <Checkbox>需求需經上級 / 指定審批人審批後再送達技術部（普通員工默認開啟）</Checkbox>
            </Form.Item>
          </Space>
          <Form.Item label="業務驗收人" style={{ marginTop: 12 }}
            extra="默認為提交人本人；需求上線後由該同事在「需求驗收」確認交付結果">
            <Input style={{ width: 220 }} value="本人（提交人）" disabled />
          </Form.Item>
        </div>
      </Form>

      {/* ── 底部操作栏 ── */}
      <div className="form-footer">
        <Button icon={<RollbackOutlined />} onClick={() => navigate('/rdm-workbench')}>取消</Button>
        <Button icon={<SaveOutlined />} onClick={handleSaveDraft}>保存草稿</Button>
        <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}>提交需求</Button>
      </div>
    </div>
  )
}
