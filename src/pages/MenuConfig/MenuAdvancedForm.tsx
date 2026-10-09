/**
 * 菜单配置 · 高级设置（独立页面，仅内置超管可进入）。
 *
 * 为什么单独成页并收敛权限：菜单 Key 是 `sys_role_menu` / `sys_department_menu` 的授权锚点，
 * 改 Key 会让该菜单的存量授权整体失效；上级/类型变更会重排整个系统的导航结构。
 * 这些都属于「结构变更」，必须与日常的「改菜单名称」分开，避免普通管理员误触。
 * 前端隐藏入口只是防误点，服务端另有守卫。
 *
 */
import { useEffect, useMemo, useState } from 'react'
import { Alert, AutoComplete, Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Tag, message } from 'antd'
import { ArrowLeftOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { createMenu, deleteMenu, fetchMenuList, updateMenu } from '../../api/menu'
import type { MenuPayload, MenuVO } from '../../api/menu'
import { fetchSystemsCatalog, type SystemCatalogItem } from '../../api/systemAuthorization'
import { getSystemDisplayName } from '../../constants/portalSystems'
import { useAuth } from '../../contexts/AuthContext'
import { getMenuIconOptions, renderMenuIcon } from '../../components/MenuIcon'

/** 菜单类型：与 sys_menu.type 一致（1=目录 2=菜单 3=按钮） */
const MENU_TYPE = { DIRECTORY: 1, MENU: 2, BUTTON: 3 } as const

/** Portal 哨兵系统：个人工作台入口，不作为可配置的业务系统 */
const PORTAL_SENTINEL = 'portal'

interface FormValues {
  name: string
  nameEn?: string
  menuKey: string
  path?: string
  parentId?: number
  type: number
  icon?: string
  sort: number
  status: boolean
}

const CARD_STYLE: React.CSSProperties = {
  borderRadius: 8,
  background: '#fff',
  padding: '20px 24px',
  marginBottom: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

export default function MenuAdvancedForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const isSuperAdmin = user?.role === 'admin'

  const menuId = params.get('id') ? Number(params.get('id')) : null
  const systemCode = params.get('system') ?? ''
  const isCreate = menuId == null

  const [form] = Form.useForm<FormValues>()
  const [records, setRecords] = useState<MenuVO[]>([])
  const [systems, setSystems] = useState<SystemCatalogItem[]>([])
  const [current, setCurrent] = useState<MenuVO | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const watchedIcon = Form.useWatch('icon', form)
  const watchedType = Form.useWatch('type', form)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchMenuList(), fetchSystemsCatalog()])
      .then(([list, sysList]) => {
        if (cancelled) return
        const all = list ?? []
        setRecords(all)
        setSystems((sysList ?? []).filter((s) => s.code !== PORTAL_SENTINEL))
        if (menuId != null) {
          const found = all.find((m) => m.id === menuId) ?? null
          setCurrent(found)
          if (found) {
            form.setFieldsValue({
              name: found.name,
              nameEn: found.nameEn ?? '',
              menuKey: found.menuKey,
              path: found.path ?? '',
              parentId: found.parentId ?? undefined,
              type: found.type,
              icon: found.icon ?? '',
              sort: found.sort ?? 0,
              status: found.status === 1,
            })
          }
        } else {
          form.setFieldsValue({ type: MENU_TYPE.MENU, sort: 0, status: true, parentId: undefined })
        }
      })
      .catch(() => {
        // 错误提示由请求层统一处理
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [menuId, form])

  const systemName = useMemo(() => {
    const code = current?.systemCode ?? systemCode
    const sys = systems.find((s) => s.code === code)
    return sys ? getSystemDisplayName(t, sys, i18n.language) : code
  }, [systems, current, systemCode, t, i18n.language])

  /** 上级候选：目录/菜单类型可作父级；新建时只允许挂到当前系统的节点，避免把菜单挂成"孤儿系统" */
  const parentOptions = useMemo(() => {
    const options = records
      .filter((m) => m.type !== MENU_TYPE.BUTTON && m.id !== menuId)
      .filter((m) => (isCreate ? m.systemCode === systemCode : true))
      .map((m) => {
        // 归属提示走统一取名入口，避免下拉里出现 "hr" 这类裸编码与门户名称对不上
        const sys = systems.find((x) => x.code === m.systemCode)
        const suffix = sys ? getSystemDisplayName(t, sys, i18n.language) : m.systemCode
        return { value: m.id, label: suffix ? `${m.name} · ${suffix}` : m.name }
      })
    return isCreate ? [{ value: 0, label: t('menuConfig.topLevelMenuEntry') }, ...options] : options
  }, [records, menuId, isCreate, systemCode, systems, t, i18n.language])

  const typeOptions = useMemo(() => [
    { value: MENU_TYPE.DIRECTORY, label: t('menuConfig.typeDirectory') },
    { value: MENU_TYPE.MENU, label: t('menuConfig.typeMenu') },
    { value: MENU_TYPE.BUTTON, label: t('menuConfig.typeButton') },
  ], [t])

  const handleBack = () => navigate('/menu-config')

  const handleSubmit = async () => {
    let values: FormValues
    try {
      values = await form.validateFields()
    } catch {
      message.warning(t('menuConfig.formIncomplete'))
      return
    }
    const payload: MenuPayload = {
      parentId: values.parentId && values.parentId !== 0 ? values.parentId : null,
      menuKey: values.menuKey.trim(),
      name: values.name.trim(),
      nameEn: values.nameEn?.trim() || undefined,
      path: values.path?.trim() || undefined,
      icon: values.icon?.trim() || undefined,
      type: values.type,
      sort: values.sort ?? 0,
      status: values.status ? 1 : 0,
      // actions 只在编辑时原样回传，新建默认仅查看，避免把后端结构字段清空
      actions: isCreate ? ['view'] : current?.actions ?? ['view'],
    }
    setSubmitting(true)
    try {
      if (isCreate) {
        await createMenu(payload)
        message.success(t('menuConfig.createSuccess'))
      } else {
        await updateMenu(menuId!, { ...payload, component: current?.component || undefined })
        message.success(t('menuConfig.updateSuccess'))
      }
      navigate('/menu-config')
    } catch {
      // 错误提示由请求层统一处理，停留在本页供用户修正
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = () => {
    if (isCreate || menuId == null) return
    const hasChildren = records.some((m) => m.parentId === menuId)
    Modal.confirm({
      title: t('menuConfig.confirmDeleteTitle'),
      content: hasChildren
        ? t('menuConfig.confirmDeleteHasChildren')
        : t('menuConfig.confirmDeleteContent', { name: current?.name ?? '' }),
      className: 'custom-confirm-modal',
      icon: <span className="confirm-icon-wrapper"><span className="confirm-icon-text">!</span></span>,
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        if (hasChildren) {
          message.warning(t('menuConfig.confirmDeleteHasChildren'))
          return
        }
        await deleteMenu(menuId)
        message.success(t('menuConfig.deleteSuccess'))
        navigate('/menu-config')
      },
    })
  }

  if (!isSuperAdmin) {
    return (
      <div className="content-area">
        <Alert
          type="warning"
          showIcon
          message={t('menuConfig.noAdvancedPermission')}
          description={t('menuConfig.noAdvancedPermissionDesc')}
        />
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common.back')}</Button>
        </div>
      </div>
    )
  }

  if (!isCreate && !loading && current == null) {
    return (
      <div className="content-area">
        <Alert type="error" showIcon message={t('menuConfig.menuNotFound')} />
        <div className="form-footer">
          <Button onClick={handleBack}>{t('common.back')}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 页面头部：橙色渐变顶条 + 返回 + 标题（表单页规范 §C.2） */}
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
                backgroundColor: '#E8720C', borderColor: '#E8720C', borderRadius: 8,
                height: 36, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 2px 6px rgba(232,114,12,0.25)',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isCreate ? t('menuConfig.advancedAddTitle') : t('menuConfig.advancedEditTitle')}
            </h2>
            {systemName ? <Tag color="orange" style={{ marginLeft: 4 }}>{systemName}</Tag> : null}
          </div>
        </div>
      </div>

      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('menuConfig.structureWarningTitle')}
        description={t('menuConfig.structureWarningDesc')}
      />

      <Form form={form} layout="vertical">
        {/* 基础信息 */}
        <div style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#e6f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SaveOutlined style={{ fontSize: 14, color: '#1890ff' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#262626' }}>{t('menuConfig.basicInfoSection')}</span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0', marginLeft: 8 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <Form.Item name="name" label={t('menuConfig.menuName')} rules={[{ required: true, message: t('menuConfig.menuNameRequired') }]}>
              <Input placeholder={t('menuConfig.menuNamePlaceholder')} maxLength={50} allowClear />
            </Form.Item>
            <Form.Item name="nameEn" label={t('menuConfig.menuNameEn')}>
              <Input placeholder={t('menuConfig.menuNameEnPlaceholder')} maxLength={100} allowClear />
            </Form.Item>
            <Form.Item
              name="menuKey"
              label={t('menuConfig.menuKey')}
              rules={[{ required: true, message: t('menuConfig.menuKeyRequired') }]}
              extra={isCreate ? undefined : t('menuConfig.menuKeyAnchorHint')}
            >
              <Input placeholder={t('menuConfig.menuKeyPlaceholder')} maxLength={100} allowClear />
            </Form.Item>
            <Form.Item name="path" label={t('menuConfig.routePath')}>
              <Input placeholder={t('menuConfig.routePathPlaceholder')} maxLength={200} allowClear />
            </Form.Item>
            <Form.Item name="parentId" label={t('menuConfig.parentMenu')}>
              <Select
                placeholder={t('menuConfig.parentMenuPlaceholder')}
                options={parentOptions}
                showSearch
                optionFilterProp="label"
                allowClear
              />
            </Form.Item>
            <Form.Item name="type" label={t('menuConfig.menuType')} rules={[{ required: true, message: t('menuConfig.menuTypeRequired') }]}>
              <Select placeholder={t('menuConfig.menuTypePlaceholder')} options={typeOptions} />
            </Form.Item>
            <Form.Item
              name="icon"
              label={t('menuConfig.iconLabel')}
              extra={watchedIcon ? (
                <Space size={6} style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 15, color: '#595959' }}>{renderMenuIcon(watchedIcon) ?? <span style={{ fontSize: 12, color: '#FF4D4F' }}>{t('menuConfig.iconUnknown')}</span>}</span>
                  <span style={{ fontSize: 12, color: '#8C8C8C' }}>{watchedIcon}</span>
                </Space>
              ) : null}
            >
              <AutoComplete
                placeholder={t('menuConfig.iconExtra')}
                allowClear
                showSearch
                filterOption={(input, option) => String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                options={getMenuIconOptions()}
              />
            </Form.Item>
            <Form.Item name="sort" label={t('menuConfig.sortLabel')} extra={t('menuConfig.sortPlaceholder')}>
              <InputNumber min={0} max={9999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="status"
              label={t('menuConfig.statusLabel')}
              valuePropName="checked"
              extra={watchedType === MENU_TYPE.BUTTON ? t('menuConfig.buttonTypeHint') : undefined}
            >
              <Switch checkedChildren="啟用" unCheckedChildren="停用" />
            </Form.Item>
          </div>
        </div>
      </Form>

      {/* 底部操作栏：取消 + 保存（+ 超管专属删除） */}
      <div className="form-footer">
        <Button onClick={handleBack}>{t('common.cancel')}</Button>
        {!isCreate ? (
          <Button danger icon={<DeleteOutlined />} onClick={handleDelete}>{t('common.delete')}</Button>
        ) : null}
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>{t('common.save')}</Button>
      </div>
    </div>
  )
}
