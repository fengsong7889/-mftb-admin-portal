import { useEffect, useState } from 'react'
import { Button, DatePicker, Form, Input, Radio, Select, message } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  fetchVersionDetail,
  createVersion,
  updateVersion,
  suggestNextVersion,
} from '../../api/versionHistory'

const { TextArea } = Input

export default function VersionHistoryForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [suggesting, setSuggesting] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    setLoading(true)
    fetchVersionDetail(Number(id))
      .then((data) => {
        form.setFieldsValue({
          versionNo: data.versionNo,
          releaseType: data.releaseType,
          releaseDate: data.releaseDate ? dayjs(data.releaseDate) : undefined,
          summary: data.summary,
          frontendChanges: data.frontendChanges,
          backendChanges: data.backendChanges,
          databaseChanges: data.databaseChanges,
          status: data.status,
        })
      })
      .catch(() => {
        message.error(t('versionHistory.notFound'))
        navigate('/version-history')
      })
      .finally(() => setLoading(false))
  }, [id, isEdit, form, navigate, t])

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        ...values,
        releaseDate: values.releaseDate?.format('YYYY-MM-DD'),
      }
      if (isEdit) {
        await updateVersion(Number(id), payload)
        message.success(t('common.updateSuccess'))
      } else {
        await createVersion(payload)
        message.success(t('common.addSuccess'))
      }
      navigate('/version-history')
    } catch {
      /* validation error or api error handled by interceptor */
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = () => navigate('/version-history')

  const handleSuggestVersion = async () => {
    const releaseType = form.getFieldValue('releaseType')
    if (!releaseType) {
      message.warning('請先選擇發布類型')
      return
    }
    try {
      setSuggesting(true)
      const nextVersion = await suggestNextVersion(releaseType)
      form.setFieldsValue({ versionNo: nextVersion })
    } catch {
      message.error('獲取建議版本號失敗')
    } finally {
      setSuggesting(false)
    }
  }

  if (loading) {
    return (
      <div className="content-area" style={{ textAlign: 'center', padding: 80 }}>
        {t('common.loading')}
      </div>
    )
  }

  return (
    <div className="content-area">
      {/* 页面头部（全局统一：橙色顶条 + 橙色返回按钮） */}
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
              }}>{t('common.back')}</Button>
            <div style={{ width: 1, height: 20, background: '#E8E8E8' }} />
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1890ff' }}>
              {isEdit ? t('versionHistory.editVersion') : t('versionHistory.addVersion')}
            </h2>
          </div>
        </div>
      </div>

      {/* 表单区域 */}
      <Form
        form={form}
        layout="vertical"
        style={{ maxWidth: 720 }}
        initialValues={{ releaseType: 'patch', status: 1, releaseDate: dayjs() }}
      >
        <Form.Item
          label={t('versionHistory.versionNo')}
          name="versionNo"
          rules={[
            { required: true, message: t('common.required') },
            { pattern: /^\d+\.\d+\.\d+(\.\d{1,2})?$/, message: '請使用版本格式，如 1.0.0 或 1.0.01' },
          ]}
          extra="重大更新→第二位增长(1.0.0→1.1.0)；功能新增→第三位增长(1.0.0→1.0.1)；問題修復→第四位增长(1.0.0→1.0.01)"
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input placeholder="例：1.0.1 或 1.0.01" style={{ maxWidth: 200 }} />
            {!isEdit && (
              <Button
                type="link"
                size="small"
                loading={suggesting}
                onClick={handleSuggestVersion}
                style={{ padding: '0 4px', fontSize: 12 }}
              >
                自動建議
              </Button>
            )}
          </div>
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Form.Item
            label={t('versionHistory.releaseType')}
            name="releaseType"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <Select
              onChange={() => { form.setFieldsValue({ versionNo: undefined }) }}
              options={[
                { value: 'major', label: t('versionHistory.type_major') },
                { value: 'minor', label: t('versionHistory.type_minor') },
                { value: 'patch', label: t('versionHistory.type_patch') },
              ]}
            />
          </Form.Item>

          <Form.Item
            label={t('versionHistory.releaseDate')}
            name="releaseDate"
            rules={[{ required: true, message: t('common.required') }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>

        <Form.Item
          label={t('versionHistory.summary')}
          name="summary"
          rules={[{ required: true, message: t('common.required') }]}
        >
          <Input.TextArea rows={2} placeholder={t('versionHistory.summary')} />
        </Form.Item>

        <Form.Item label={t('versionHistory.frontendChanges')} name="frontendChanges">
          <TextArea rows={3} placeholder={t('versionHistory.frontendChanges')} />
        </Form.Item>

        <Form.Item label={t('versionHistory.backendChanges')} name="backendChanges">
          <TextArea rows={3} placeholder={t('versionHistory.backendChanges')} />
        </Form.Item>

        <Form.Item label={t('versionHistory.databaseChanges')} name="databaseChanges">
          <TextArea rows={3} placeholder={t('versionHistory.databaseChanges')} />
        </Form.Item>

        <Form.Item
          label={t('versionHistory.status')}
          name="status"
          rules={[{ required: true }]}
        >
          <Radio.Group>
            <Radio value={1}>{t('versionHistory.statusPublished')}</Radio>
            <Radio value={2}>{t('versionHistory.statusDraft')}</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>

      {/* 底部操作按钮（取消/保存） */}
      <div className="form-footer">
        <Button onClick={handleBack}>{t('common.cancel')}</Button>
        <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}
