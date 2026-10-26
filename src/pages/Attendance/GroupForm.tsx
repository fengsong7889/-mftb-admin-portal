/**
 * 考勤组 —— 新增 / 编辑 / 详情（独立页面，禁止弹窗）
 *
 * 模式判定：/attendance-group-form            → 新增
 *          /attendance-group-form?id=3        → 编辑
 *          /attendance-group-detail?id=3      → 详情（只读，隐藏底部按钮）
 *
 * 与后端模型的对齐（这是本页最容易做错的地方）：
 * - 判定「某人某天按什么规则出勤」只认 `att_group_member`（带生效区间），
 *   `scopeType`/`scopeText` 只是给管理页看的范围快照，**不参与判定**；
 *   因此本页的成员名单是可保存的真值（`PUT /groups/{id}/members`），
 *   部门树只是"按部门快速挑人"的辅助入口，不再假装成可持久化的规则；
 * - `groupNo` 由编号规则生成，表单只读展示；
 * - `punchSources` 后端存逗号分隔来源码（"1,2"），界面用多选框，提交前拼接；
 * - 保存顺序：先存考勤组拿到 id，再同步成员。新增时同样一次完成，
 *   不让用户"先建组、再回来加人"（漏加人的组当天不产生任何考勤结论）。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Button, Checkbox, Form, Input, InputNumber, Radio, Select, Switch, TreeSelect, message,
} from 'antd'
import {
  ApartmentOutlined, ArrowLeftOutlined, DatabaseOutlined, SaveOutlined, ScheduleOutlined,
  SafetyCertificateOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import DetailPageHeader from '@/components/DetailPageHeader'
import RemarkTextArea from '@/components/RemarkTextArea'
import {
  ENABLE_STATUS, GROUP_TYPE, PUNCH_SOURCE, SCOPE_TYPE, createGroup, fetchGroupDetail, fetchGroupMembers,
  fetchShiftOptions, syncGroupMembers, updateGroup, type GroupPayload,
} from '@/api/attendance'
import { GROUP_TYPE_LABEL_KEY, SCOPE_TYPE_LABEL_KEY } from './meta'
import { fetchDepartments } from '@/api/department'
import { fetchEmployees } from '@/api/employee'
import { buildDeptTree, type DeptNode } from '@/utils/deptTree'
import '@/styles/components.css'

const cardStyle: React.CSSProperties = {
  borderRadius: 8, background: '#fff', padding: '20px 24px', marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

/** 卡片标题行：图标色块 + 标题 + 右侧延伸分隔线（规范 §C.3） */
function CardTitle(props: { icon: React.ReactNode; color: string; bg: string; title: string; hint?: string }) {
  const { icon, color, bg, title, hint } = props
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 14, color }}>{icon}</span>
      </div>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
      {hint && <span style={{ fontSize: 12, color: '#8c8c8c' }}>{hint}</span>}
    </div>
  )
}

const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }

interface GroupFormValues {
  groupNo?: string
  groupName: string
  groupType: number
  scopeType: number
  workPlace: string
  shiftId?: number | null
  lateGraceMin: number
  earlyGraceMin: number
  sources: number[]
  status: string
  remark?: string
}

interface GroupMeta {
  id: number
  groupNo: string
  groupName: string
  status: string
  memberCount?: number | null
  updatedBy?: string | null
  updatedAt?: string | null
}

interface MemberOption {
  value: number
  label: string
}

export default function AttendanceGroupForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const id = searchParams.get('id')
  // HashRouter 下要用路由 pathname 判断模式，window.location.hash 带有 '#' 前缀
  const isDetailMode = location.pathname === '/attendance-group-detail'
  const isEditMode = !!id && !isDetailMode
  const readOnly = isDetailMode

  const [form] = Form.useForm<GroupFormValues>()
  const [meta, setMeta] = useState<GroupMeta | null>(null)
  const [groupType, setGroupType] = useState<number>(GROUP_TYPE.FIXED)
  const [scopeType, setScopeType] = useState<number>(SCOPE_TYPE.DEPT)
  const [shiftOptions, setShiftOptions] = useState<Array<{ id: number; code: string; name: string; flex: boolean }>>([])
  const [deptTree, setDeptTree] = useState<DeptNode[]>([])
  const [deptIds, setDeptIds] = useState<number[]>([])
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [memberLoading, setMemberLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  /** 班次下拉：只列启用中的班次，停用班次不可被新考勤组引用 */
  useEffect(() => {
    fetchShiftOptions().then(setShiftOptions).catch(() => setShiftOptions([]))
    fetchDepartments().then(list => setDeptTree(buildDeptTree(list ?? []))).catch(() => setDeptTree([]))
  }, [])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const [record, members] = await Promise.all([
        fetchGroupDetail(Number(id)),
        fetchGroupMembers(Number(id)),
      ])
      setMeta({
        id: record.id, groupNo: record.groupNo, groupName: record.groupName, status: record.status,
        memberCount: record.memberCount, updatedBy: record.updatedBy, updatedAt: record.updatedAt,
      })
      setGroupType(record.groupType)
      setScopeType(record.scopeType ?? SCOPE_TYPE.DEPT)
      // 已选成员必须先塞进 options，否则多选框只显示 id 数字
      const existing: MemberOption[] = (members ?? []).map(m => ({
        value: m.userId,
        // 选人下拉统一「姓名(工號)」，部门不参与消歧
        label: `${m.empName ?? ''}(${m.empNo ?? ''})`,
      }))
      setMemberOptions(existing)
      setMemberIds(existing.map(o => o.value))
      form.setFieldsValue({
        groupNo: record.groupNo,
        groupName: record.groupName,
        groupType: record.groupType,
        scopeType: record.scopeType ?? SCOPE_TYPE.DEPT,
        workPlace: record.workPlace ?? '',
        shiftId: record.shiftId ?? undefined,
        lateGraceMin: record.lateGraceMin ?? 5,
        earlyGraceMin: record.earlyGraceMin ?? 0,
        sources: record.sources?.length ? record.sources : [PUNCH_SOURCE.DINGTALK],
        status: record.status ?? ENABLE_STATUS.ENABLED,
        remark: record.remark ?? undefined,
      })
      setLoadFailed(false)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [id, form])

  useEffect(() => { load() }, [load])

  /** 员工搜索：按工号/姓名模糊查在职员工，value 用 sys_user.id（成员表按 id 关联） */
  const handleMemberSearch = useCallback(async (keyword: string) => {
    setMemberLoading(true)
    try {
      const res = await fetchEmployees({ page: 1, size: 50, keyword: keyword || undefined, employmentStatus: 'active' })
      const options = (res.records ?? []).map(e => ({
        value: e.id,
        // 选人下拉统一「姓名(工號)」，部门不参与消歧
        label: `${e.name}(${e.empId})`,
      }))
      // 保留已选项的 label：搜索结果不含已选员工时，否则多选框会退化成显示 id
      setMemberOptions(prev => {
        const picked = prev.filter(o => memberIds.includes(o.value) && !options.some(n => n.value === o.value))
        return [...picked, ...options]
      })
    } catch {
      // 请求层已统一提示；搜索失败时保留现有选项，不能把已选成员的 label 清空退化成 id
    } finally {
      setMemberLoading(false)
    }
  }, [memberIds])

  /** 按部门批量载入在职员工：部门只是挑人的辅助入口，真值仍是成员名单 */
  const handleLoadByDept = async () => {
    if (deptIds.length === 0) {
      message.warning(t('attendance.scopeDeptRequired'))
      return
    }
    setMemberLoading(true)
    try {
      const results = await Promise.all(deptIds.map(deptId => fetchEmployees({
        page: 1, size: 200, departmentId: deptId, employmentStatus: 'active',
      })))
      const merged = new Map<number, MemberOption>()
      memberOptions.forEach(o => merged.set(o.value, o))
      results.forEach(res => (res.records ?? []).forEach(e => merged.set(e.id, {
        value: e.id,
        // 选人下拉统一「姓名(工號)」，部门不参与消歧
        label: `${e.name}(${e.empId})`,
      })))
      setMemberOptions([...merged.values()])
      const ids = [...merged.keys()]
      setMemberIds(ids)
      message.success(t('attendance.membersLoaded', { count: ids.length }))
    } catch {
      // 请求层已提示
    } finally {
      setMemberLoading(false)
    }
  }

  const handleBack = () => navigate('/attendance-group')

  const handleSubmit = async () => {
    // 顺序必须是：校验 → 保存（本模块属配置维护，非「提交申请」类，不需二次确认弹窗）
    const values = await form.validateFields()
    if (!values.sources?.length) {
      message.error(t('attendance.sourcesRequired'))
      return
    }
    const payload: GroupPayload = {
      groupName: values.groupName,
      groupType: values.groupType,
      scopeType: values.scopeType,
      // 范围快照只描述「范围类型」，不内嵌成员数：成员数会经 syncMembers 独立维护，
      // 保存后人数一变，快照里的旧数字就与实时「覆蓋人數」列自相矛盾（缺陷 M3）。
      // 人数一律以服务端按当前生效成员算出的 memberCount 列为准。
      scopeText: t(SCOPE_TYPE_LABEL_KEY[values.scopeType] ?? 'attendance.scopeList'),
      workPlace: values.workPlace,
      // 自由工时不绑班次：显式传 null，避免留下上一次选择的班次
      shiftId: values.groupType === GROUP_TYPE.FLEX ? null : (values.shiftId ?? null),
      lateGraceMin: values.lateGraceMin,
      earlyGraceMin: values.earlyGraceMin,
      punchSources: values.sources.join(','),
      status: values.status,
      remark: values.remark ?? null,
    }
    setSubmitting(true)
    try {
      const saved = isEditMode && id
        ? await updateGroup(Number(id), payload)
        : await createGroup(payload)
      // 成员差量同步：后端按「组+人+起始日」关闭旧归属再新增，返回 added/closed 便于如实提示
      const summary = await syncGroupMembers(saved.id, memberIds)
      message.success(isEditMode
        ? t('attendance.groupSavedWithMembers', { added: summary.added ?? 0, closed: summary.closed ?? 0 })
        : t('attendance.groupCreatedWithMembers', { added: summary.added ?? 0 }))
      handleBack()
    } catch {
      // 请求层已统一提示（组名重复、班次停用等），这里只恢复按钮状态
    } finally {
      setSubmitting(false)
    }
  }

  const isFlex = groupType === GROUP_TYPE.FLEX
  const typeOptions = useMemo(
    () => [GROUP_TYPE.FIXED, GROUP_TYPE.ROTATION, GROUP_TYPE.FLEX].map(code => ({
      value: code,
      label: t(GROUP_TYPE_LABEL_KEY[code]),
    })),
    [t],
  )

  return (
    <div className="content-area" style={{ padding: '20px 24px' }}>
      {loadFailed && (
        <Alert
          type="error"
          showIcon
          message={t('common.loadFailed')}
          style={{ marginBottom: 16 }}
          action={<Button size="small" onClick={load}>{t('common.reset')}</Button>}
        />
      )}

      {isDetailMode ? (
        <DetailPageHeader
          title={t('attendance.groupDetail')}
          meta={<>{meta?.groupNo} · {meta?.groupName}</>}
          tags={
            <Switch
              checked={meta?.status === ENABLE_STATUS.ENABLED}
              checkedChildren={t('attendance.enableAction')}
              unCheckedChildren={t('attendance.disableAction')}
              disabled
            />
          }
          onBack={handleBack}
          onEdit={meta ? () => navigate(`/attendance-group-form?id=${meta.id}`) : undefined}
        />
      ) : (
        <div style={{
          position: 'relative', background: '#fff', marginBottom: 16,
          borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            height: 3,
            background: 'linear-gradient(90deg, #E8720C, #F59432, #FFB347, #F59432, #E8720C)',
            backgroundSize: '200% 100%', animation: 'headerGradientShift 4s ease infinite',
          }} />
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Button
                type="primary"
                icon={<ArrowLeftOutlined />}
                onClick={handleBack}
                style={{
                  backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8, height: 36,
                  padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >{t('common.back')}</Button>
              <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
                {isEditMode ? t('attendance.groupEdit') : t('attendance.groupAdd')}
              </h2>
            </div>
          </div>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        disabled={readOnly || loading}
        requiredMark={isDetailMode ? false : true}
        initialValues={{
          groupType: GROUP_TYPE.FIXED,
          scopeType: SCOPE_TYPE.DEPT,
          sources: [PUNCH_SOURCE.DINGTALK],
          lateGraceMin: 5,
          earlyGraceMin: 0,
          status: ENABLE_STATUS.ENABLED,
        }}
      >
        {/* 模块一：基础信息 */}
        <div style={cardStyle}>
          <CardTitle
            icon={<ApartmentOutlined />}
            color="#1890ff"
            bg="#e6f7ff"
            title={t('attendance.groupBasicSection')}
            hint={t('attendance.groupPageHint')}
          />
          <div style={gridStyle}>
            <Form.Item label={t('attendance.groupNo')} name="groupNo" extra={(isEditMode || isDetailMode) ? undefined : t('attendance.groupNoAutoHint')}>
              <Input disabled placeholder={t('attendance.groupNoAuto')} />
            </Form.Item>
            <Form.Item
              label={t('attendance.groupName')}
              name="groupName"
              rules={[{ required: true, message: t('attendance.groupNameRequired') }]}
            >
              <Input placeholder={t('attendance.groupNamePlaceholder')} maxLength={50} />
            </Form.Item>
            <Form.Item
              label={t('common.colStatus')}
              name="status"
              getValueProps={(value: string) => ({ checked: value !== ENABLE_STATUS.DISABLED })}
              getValueFromEvent={(checked: boolean) => (checked ? ENABLE_STATUS.ENABLED : ENABLE_STATUS.DISABLED)}
            >
              <Switch checkedChildren={t('attendance.enableAction')} unCheckedChildren={t('attendance.disableAction')} />
            </Form.Item>
            <Form.Item label={t('attendance.groupType')} name="groupType" rules={[{ required: true }]}>
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                disabled={readOnly}
                onChange={e => setGroupType(e.target.value as number)}
                options={typeOptions}
              />
            </Form.Item>
          </div>
        </div>

        {/* 模块二：成员范围与考勤地 */}
        <div style={cardStyle}>
          <CardTitle
            icon={<SafetyCertificateOutlined />}
            color="#52c41a"
            bg="#f6ffed"
            title={t('attendance.groupScopeSection')}
            hint={t('attendance.workPlaceHint')}
          />
          <div style={gridStyle}>
            <Form.Item label={t('attendance.scopeType')} name="scopeType" rules={[{ required: true }]}>
              <Select
                disabled={readOnly}
                onChange={value => setScopeType(value as number)}
                options={[SCOPE_TYPE.DEPT, SCOPE_TYPE.STORE, SCOPE_TYPE.LIST].map(code => ({
                  value: code,
                  label: t(SCOPE_TYPE_LABEL_KEY[code]),
                }))}
              />
            </Form.Item>
            <Form.Item label={t('attendance.workPlace')} name="workPlace" rules={[{ required: true, message: t('attendance.workPlaceRequired') }]}>
              <Input placeholder={t('attendance.workPlacePlaceholder')} maxLength={100} />
            </Form.Item>
            {scopeType === SCOPE_TYPE.DEPT && (
              <Form.Item label={t('attendance.scopeDeptField')} extra={readOnly ? undefined : t('attendance.scopeDeptHint')}>
                <TreeSelect
                  treeData={deptTree}
                  treeCheckable
                  value={deptIds}
                  onChange={value => setDeptIds((value ?? []) as number[])}
                  showCheckedStrategy={TreeSelect.SHOW_PARENT}
                  placeholder={t('attendance.multiSelectHint')}
                  disabled={readOnly}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            )}
          </div>
          {scopeType === SCOPE_TYPE.DEPT && !readOnly && (
            <Button icon={<TeamOutlined />} loading={memberLoading} onClick={handleLoadByDept} style={{ marginBottom: 16 }}>
              {t('attendance.loadMembersByDept')}
            </Button>
          )}
          <Form.Item
            label={t('attendance.memberList')}
            extra={readOnly ? undefined : t('attendance.memberListHint')}
            style={{ marginBottom: 0 }}
          >
            <Select
              mode="multiple"
              value={memberIds}
              onChange={value => setMemberIds((value ?? []) as number[])}
              onSearch={handleMemberSearch}
              filterOption={false}
              loading={memberLoading}
              disabled={readOnly}
              options={memberOptions}
              placeholder={t('attendance.memberSearchPlaceholder')}
              style={{ width: '100%' }}
              maxTagCount="responsive"
            />
          </Form.Item>
        </div>

        {/* 模块三：班次与宽限 */}
        <div style={cardStyle}>
          <CardTitle
            icon={<ScheduleOutlined />}
            color="#fa8c16"
            bg="#fff7e6"
            title={t('attendance.groupShiftSection')}
            hint={t('attendance.flexNoShift')}
          />
          <div style={gridStyle}>
            <Form.Item
              label={t('attendance.relatedShift')}
              name="shiftId"
              rules={isFlex ? [] : [{ required: true, message: t('attendance.relatedShiftRequired') }]}
            >
              <Select
                disabled={readOnly || isFlex}
                allowClear
                placeholder={isFlex ? t('attendance.flexNoShift') : t('common.pleaseSelect')}
                optionFilterProp="label"
                options={shiftOptions.map(s => ({ value: s.id, label: `${s.code} ${s.name}` }))}
              />
            </Form.Item>
            <Form.Item label={t('attendance.lateGrace')} name="lateGraceMin" rules={[{ required: true }]}>
              <InputNumber min={0} max={120} style={{ width: '100%' }} suffix={t('attendance.unitMinute')} />
            </Form.Item>
            <Form.Item label={t('attendance.earlyGrace')} name="earlyGraceMin" rules={[{ required: true }]}>
              <InputNumber min={0} max={120} style={{ width: '100%' }} suffix={t('attendance.unitMinute')} />
            </Form.Item>
          </div>
        </div>

        {/* 模块四：打卡数据来源 */}
        <div style={cardStyle}>
          <CardTitle
            icon={<DatabaseOutlined />}
            color="#722ed1"
            bg="#f9f0ff"
            title={t('attendance.groupSourceSection')}
            hint={t('attendance.sourcePriorityHint')}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Form.Item label={t('attendance.sourcesEnabled')} name="sources" rules={[{ required: true, message: t('attendance.sourcesRequired') }]}>
              <Checkbox.Group
                disabled={readOnly}
                options={[
                  { value: PUNCH_SOURCE.DINGTALK, label: t('attendance.sourceDingtalkHint') },
                  { value: PUNCH_SOURCE.IMPORT, label: t('attendance.sourceImportLabel') },
                ]}
              />
            </Form.Item>
            <Form.Item label={t('attendance.sourceSyncBatchTitle')} extra={readOnly ? undefined : t('attendance.sourceSyncFailHint')}>
              <Input value={t('attendance.sourceSyncBatch')} disabled />
            </Form.Item>
          </div>
        </div>

        {/* 模块五：备注（独占整行，统一 RemarkTextArea） */}
        <div style={cardStyle}>
          <CardTitle icon={<ApartmentOutlined />} color="#8c8c8c" bg="#f5f5f5" title={t('common.colRemark')} />
          <Form.Item name="remark" style={{ marginBottom: 0 }}>
            <RemarkTextArea placeholder={t('attendance.groupRemarkPlaceholder')} />
          </Form.Item>
        </div>

        {/* 详情页必须以「最后更新」收尾（规范 §D.1）：值来自服务端，禁止用浏览器时间与当前用户伪造 */}
        {isDetailMode && (
          <div style={{
            background: '#fafafa', borderRadius: 8, padding: '12px 24px', border: '1px solid #f0f0f0',
            display: 'flex', justifyContent: 'flex-end', gap: 24,
          }}>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {t('attendance.memberCount')}：<span style={{ color: '#595959' }}>{meta?.memberCount ?? 0} {t('attendance.unitPerson')}</span>
            </span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {t('attendance.lastUpdaterPrefix')}<span style={{ color: '#595959' }}>{meta?.updatedBy ?? '-'}</span>
            </span>
            <span style={{ fontSize: 12, color: '#8C8C8C' }}>
              {t('attendance.lastUpdateTimePrefix')}<span style={{ color: '#595959' }}>{meta?.updatedAt ?? '-'}</span>
            </span>
          </div>
        )}
      </Form>

      {!isDetailMode && (
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common.cancel')}</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
