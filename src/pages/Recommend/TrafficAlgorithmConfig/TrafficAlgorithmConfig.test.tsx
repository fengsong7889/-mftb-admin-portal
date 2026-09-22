import { useEffect, useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Button, ConfigProvider, Form, Input, InputNumber, type FormInstance } from 'antd'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TrafficAlgorithmConfig from './index'
import useTrafficAlgorithmForm from './useTrafficAlgorithmForm'
import { readTrafficParams, TRAFFIC_FIELD_NAMES } from './config'
import type { AdAlgorithm } from '../../../api/adPromotion'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), create: vi.fn(), update: vi.fn(), saved: vi.fn(),
  t: (key: string) => key,
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(),
  message: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../../../api/adPromotion', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/adPromotion')>(),
  fetchAdAlgorithmDetail: mocks.fetch, createAdAlgorithm: mocks.create, updateAdAlgorithm: mocks.update,
}))

type Controller = ReturnType<typeof useTrafficAlgorithmForm>
interface HarnessProps {
  id?: string
  readOnly?: boolean
  bind: (form: FormInstance, controller: Controller) => void
}
function Harness({ id = '', readOnly = false, bind }: HarnessProps) {
  const [form] = Form.useForm()
  const [meta, setMeta] = useState<{ updatedBy?: string; updatedAt?: string } | null>(null)
  const controller = useTrafficAlgorithmForm({ enabled: true, algorithmId: id, readOnly, form, onLoaded: setMeta, onSaved: mocks.saved })
  useEffect(() => bind(form, controller), [form, controller, bind])
  return (
    <>
      <output aria-label="加载状态">{controller.loadState}</output>
      <output aria-label="更新人">{meta?.updatedBy}</output>
      {controller.loadState === 'error' && <div role="alert">{controller.loadError}<Button onClick={controller.retry}>重试</Button></div>}
      <Form form={form} layout="vertical" initialValues={{ ...readTrafficParams({}), name: '午餐投流', brand: 1 }}
        disabled={readOnly || controller.loadState !== 'ready' || controller.saving} onValuesChange={controller.clearErrors}>
        <Form.Item name="name" label="算法名称" rules={[{ required: true }]}><Input /></Form.Item>
        <Form.Item name="brand" label="品牌" rules={[{ required: true }]}><InputNumber /></Form.Item>
        <TrafficAlgorithmConfig form={form} readOnly={readOnly} errors={controller.errors} />
      </Form>
      {!readOnly && <Button loading={controller.saving} disabled={controller.loadState !== 'ready'} onClick={controller.handleSave}>保存配置</Button>}
    </>
  )
}

function mountConfig(props: Omit<HarnessProps, 'bind'> = {}) {
  let form: FormInstance
  let controller: Controller
  const view = render(<ConfigProvider theme={{ token: { motion: false } }}><Harness {...props} bind={(nextForm, nextController) => { form = nextForm; controller = nextController }} /></ConfigProvider>)
  return { ...view, get form() { return form }, get controller() { return controller } }
}
const fixture = (params: Record<string, unknown> = {}): AdAlgorithm => ({
  id: 7, algoCode: 'SFLL0007', algoName: '午餐投流', algoType: 15, brand: 'flashBee', updatedBy: '测试运营',
  params: JSON.stringify({ ...readTrafficParams({}), consistencyCheckInterval: 10, ...params }),
})

beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue(fixture())
  mocks.create.mockReset().mockResolvedValue(fixture())
  mocks.update.mockReset().mockResolvedValue(fixture())
  mocks.saved.mockClear()
})

describe('投流配置交互与保存', () => {
  it('高级组默认折叠，全部字段仍注册且摘要跟随修改', async () => {
    const view = mountConfig()
    const heading = screen.getByRole('button', { name: '高级策略', expanded: false })
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    expect(view.form.getFieldsError().map(field => field.name[0])).toEqual(expect.arrayContaining(TRAFFIC_FIELD_NAMES))
    fireEvent.change(screen.getByRole('spinbutton', { name: '同商家最多展示' }), { target: { value: '7' } })
    await waitFor(() => expect(screen.getByLabelText('投流配置概览')).toHaveTextContent('同店 2 小时 / 7 次'))
    fireEvent.click(heading)
    expect(screen.getByRole('spinbutton', { name: '商家标签衰减周期' })).toHaveValue('7')
    fireEvent.change(screen.getByRole('spinbutton', { name: '商家标签衰减周期' }), { target: { value: '12' } })
    fireEvent.click(heading)
    expect(view.form.getFieldValue('merchantDecayDays')).toBe(12)
    expect(screen.queryByRole('spinbutton', { name: '商家标签衰减周期' })).not.toBeInTheDocument()
  })

  it('隐藏组的错误自动展开并定位，未通过校验不调用 API', async () => {
    const view = mountConfig()
    const scroll = vi.spyOn(view.form, 'scrollToField').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '高级策略', expanded: true })).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByRole('alert')).toHaveTextContent('数据一致性检查周期')
    await waitFor(() => expect(scroll).toHaveBeenCalledWith('consistencyCheckInterval', expect.any(Object)))
    expect(mocks.create).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /保存配置/ })).not.toBeDisabled()
    scroll.mockRestore()
  })

  it('关闭相似推荐和售罄过滤时不校验隐藏子项，保存 false、0 和检查周期', async () => {
    const view = mountConfig()
    await act(async () => {
      view.form.setFieldsValue({ consistencyCheckInterval: 17, statusRest: true, explorationSlots: 0, dwellTimeThreshold: null, productCheckInterval: null })
    })
    fireEvent.click(screen.getByRole('switch', { name: '浏览后相似推荐' }))
    fireEvent.click(screen.getByRole('switch', { name: '售罄与下架过滤' }))
    expect(screen.queryByRole('spinbutton', { name: '停留时长门槛' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0].params).toMatchObject({
      consistencyCheckInterval: 17, statusRest: true, statusClosed: false, explorationSlots: 0,
      generativeRecommendEnabled: false, soldOutFilterEnabled: false, dwellTimeThreshold: null, productCheckInterval: null,
    })
    fireEvent.click(screen.getByRole('switch', { name: '浏览后相似推荐' }))
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: '停留时长门槛' })).toBeInTheDocument())
    expect(view.form.getFieldValue('dwellTimeThreshold')).toBeNull()
  })

  it('冷启动全部取消后无法保存，并定位所在组', async () => {
    const view = mountConfig()
    await act(async () => { view.form.setFieldsValue({ consistencyCheckInterval: 10, newUserDimensions: [] }) })
    const scroll = vi.spyOn(view.form, 'scrollToField').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('冷启动排序维度至少选择'))
    expect(mocks.create).not.toHaveBeenCalled()
    scroll.mockRestore()
  })

  it('编辑保留旧策略、隐藏参数和扩展字段，不把目标说明写成新策略', async () => {
    mocks.fetch.mockResolvedValue(fixture({
      merchantExposureStrategy: 'legacy-strategy', generativeRecommendEnabled: false,
      generativePriorityMode: 'hybrid', generativePriorityMode2: 'trafficBalance', generativeSkipMerchantCount: 0,
      extraRule: { keep: true },
    }))
    mountConfig({ id: '7' })
    await waitFor(() => expect(screen.getByLabelText('更新人')).toHaveTextContent('测试运营'))
    expect(screen.getByText('当前保存策略：legacy-strategy')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(mocks.update.mock.calls[0]).toEqual([7, expect.objectContaining({ params: expect.objectContaining({
      merchantExposureStrategy: 'legacy-strategy', generativeRecommendEnabled: false,
      generativePriorityMode: 'hybrid', generativePriorityMode2: 'trafficBalance', generativeSkipMerchantCount: 0,
      consistencyCheckInterval: 10, extraRule: { keep: true },
    }) })])
  })

  it('加载失败时即使直接调用保存也不会覆盖；重试成功后才可保存', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('网络异常'))
    const view = mountConfig({ id: '7' })
    await waitFor(() => expect(screen.getByLabelText('加载状态')).toHaveTextContent('error'))
    expect(screen.getByRole('button', { name: /保存配置/ })).toBeDisabled()
    await act(async () => { await view.controller.handleSave() })
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /重\s*试/ }))
    await waitFor(() => expect(screen.getByLabelText('加载状态')).toHaveTextContent('ready'))
    expect(screen.getByRole('button', { name: /保存配置/ })).not.toBeDisabled()
  })

  it('损坏的 JSON 不允许以默认参数覆盖', async () => {
    mocks.fetch.mockResolvedValue({ ...fixture(), params: '{broken' })
    const view = mountConfig({ id: '7' })
    await waitFor(() => expect(screen.getByLabelText('加载状态')).toHaveTextContent('error'))
    await act(async () => { await view.controller.handleSave() })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('保存锁覆盖校验和请求阶段，重复调用只产生一次请求', async () => {
    let resolveRequest!: (value: AdAlgorithm) => void
    mocks.create.mockImplementation(() => new Promise<AdAlgorithm>(resolve => { resolveRequest = resolve }))
    const view = mountConfig()
    await act(async () => { view.form.setFieldsValue({ consistencyCheckInterval: 10 }) })
    act(() => { void view.controller.handleSave(); void view.controller.handleSave() })
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(view.controller.saving).toBe(true)
    await act(async () => { resolveRequest(fixture()) })
    await waitFor(() => expect(view.controller.saving).toBe(false))
    expect(mocks.saved).toHaveBeenCalledTimes(1)
  })

  it('详情模式只读，无保存入口，仍可展开高级分组', async () => {
    const view = mountConfig({ id: '7', readOnly: true })
    await waitFor(() => expect(screen.getByLabelText('加载状态')).toHaveTextContent('ready'))
    expect(screen.queryByRole('button', { name: '保存配置' })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '偏好识别最低分' })).toBeDisabled()
    const navigation = screen.getByRole('navigation', { name: '投流配置分组导航' })
    fireEvent.click(within(navigation).getByRole('button', { name: '高级策略' }))
    expect(screen.getByRole('spinbutton', { name: '数据一致性检查周期' })).toBeDisabled()
    await act(async () => { await view.controller.handleSave() })
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
