/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useLocation } from 'react-router-dom'
import { Button, Form, Input, message, Space, Card, Tag, Breadcrumb } from 'antd'
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons'
import PRDEditor from '../../components/PRDEditor'
import { getPagePRD } from '../../components/PageDescriptions'
import { getCustomTips, saveCustomTips, deleteCustomTips, type CustomPageTips } from '../../utils/customTipsStorage'
import './index.css'

export default function PageDescriptionEditor() {
  const { t } = useTranslation('common')
  const navigate = useNavigate()
  const location = useLocation()
  const [form] = Form.useForm()
  const [pageTitle, setPageTitle] = useState('')
  const [pageModule, setPageModule] = useState('')
  const [customTips, setCustomTips] = useState<CustomPageTips | null>(null)
  const [pagePrd, setPagePrd] = useState<Record<string, any> | null>(null)
  const [loading, setLoading] = useState(false)
  const [prdContent, setPrdContent] = useState<{
    description?: string
    features?: { label: string; desc: string }[]
    searchConditions?: { label: string; desc: string }[]
    fields?: { label: string; desc: string }[]
    actions?: string[]
  } | undefined>(undefined)

  // 获取当前编辑的页面路径（从 URL 参数或 state 中获取）
  const searchParams = new URLSearchParams(location.search)
  const targetPath = searchParams.get('path') || '/'

  useEffect(() => {
    // 加载页面信息
    const prd = getPagePRD(targetPath)
    const custom = getCustomTips(targetPath)
    
    setPagePrd(prd)
    
    if (prd) {
      setPageTitle(prd.title)
      setPageModule(prd.module)
    }

    setCustomTips(custom)
    
    // 加载PRD结构化内容
    if (custom?.prdContent && typeof custom.prdContent === 'object') {
      setPrdContent(custom.prdContent)
    } else {
      setPrdContent({})
    }
    
    // 填充表单:优先显示自定义内容,如果没有则显示系统默认内容
    const formData = {
      tips: custom?.tips?.join('\n') || prd?.tips?.join('\n') || '',
    }
    
    form.setFieldsValue(formData)
  }, [targetPath, form])

  // 保存编辑
  const handleSave = () => {
    form.validateFields().then(values => {
      setLoading(true)
      
      try {
        const tips: CustomPageTips = {
          prdContent: prdContent,
          tips: values.tips ? values.tips.split('\n').filter((s: string) => s.trim()) : undefined,
        }
        
        // 如果所有字段都为空,提示用户
        if (!tips.prdContent && !tips.tips) {
          message.warning(t('saveAtLeastOne'))
          setLoading(false)
          return
        }
        
        saveCustomTips(targetPath, tips)
        setCustomTips(tips)
        
        message.success(t('saveSuccess'))
        
        // 返回上一页
        setTimeout(() => {
          navigate(-1)
        }, 500)
      } catch (error) {
        console.error('保存失败:', error)
        message.error(t('saveFailedRetry'))
      } finally {
        setLoading(false)
      }
    }).catch(error => {
      console.error('表单验证失败:', error)
      message.error(t('checkFormInput'))
    })
  }

  // 恢复默认
  const _handleReset = () => {
    const pagePrd = getPagePRD(targetPath)
    
    // 清空PRD结构化内容
    setPrdContent({})
    
    form.setFieldsValue({
      tips: pagePrd?.tips?.join('\n') || '',
    })

    deleteCustomTips(targetPath)
    setCustomTips(null)
    
    message.success(t('resetToDefault'))
  }

  // 返回上一页
  const handleBack = () => {
    navigate(-1)
  }

  return (
    <div className="page-description-editor" style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
      {/* 面包屑导航 */}
      <Breadcrumb style={{ marginBottom: 16 }}>
        <Breadcrumb.Item>
          <span onClick={handleBack} style={{ cursor: 'pointer' }}>{t('homePage')}</span>
        </Breadcrumb.Item>
        <Breadcrumb.Item>{t('uiDescEdit')}</Breadcrumb.Item>
      </Breadcrumb>

      {/* 页面标题 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              🐝 {t('editUiDesc')} - {pageTitle || t('unknownPage')}
            </h2>
            <div style={{ marginTop: 8, color: '#666', fontSize: 13 }}>
              <span>{t('moduleLabel')}{pageModule || '-'}</span>
              <span style={{ marginLeft: 16 }}>{t('pagePathLabel')}{targetPath}</span>
              {customTips && <Tag color="orange" style={{ marginLeft: 16 }}>{t('hasCustomContent')}</Tag>}
            </div>
          </div>
          <Space>
            <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>
              {t('back')}
            </Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
              {t('save')}
            </Button>
          </Space>
        </div>
      </Card>

      {/* 编辑表单 - PRD需求文档编辑界面 */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          {t('structuredEditHint')}
        </div>
        <PRDEditor
          initialContent={prdContent}
          defaultPRD={pagePrd || undefined}
          onChange={setPrdContent}
        />
      </Card>
      
      {/* 小蜜蜂知识库内容 */}
      <Form form={form} layout="vertical">
        <Card 
          title={t('bubbleTipContent')} 
          style={{ marginBottom: 16 }}
          extra={
            customTips?.tips && customTips.tips.length > 0 ? (
              <Tag color="blue">{t('savedCount', { count: customTips.tips.length })}</Tag>
            ) : null
          }
        >
          <Form.Item
            name="tips"
            extra={t('tipPerLineHint')}
          >
            <Input.TextArea
              rows={6}
              placeholder={pagePrd?.tips?.join('\n') || t('bubblePlaceholder')}
              style={{ fontFamily: 'monospace', fontSize: 14 }}
            />
          </Form.Item>
        </Card>
      </Form>

      {/* 底部操作栏 */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: '#999', fontSize: 12 }}>
            {customTips?.lastEdited && (
              <span>{t('lastEditTime')}{customTips.lastEdited}</span>
            )}
          </div>
          <Space>
            <Button onClick={handleBack}>{t('cancel')}</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={loading}>
              {t('saveAndReturn')}
            </Button>
          </Space>
        </div>
      </Card>
    </div>
  )
}
