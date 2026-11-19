import { useEffect, useRef, useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Button, ConfigProvider, Form, Input, InputNumber, type FormInstance } from 'antd'
import { beforeEach, beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import TrafficAlgorithmConfig from './index'
import { ClickRecTrial, SimilarityTrial } from './trialCalc'
import useTrafficAlgorithmForm from './useTrafficAlgorithmForm'
import { readTrafficParams, TRAFFIC_FIELD_NAMES, type TrafficFieldName } from './config'
import type { AdAlgorithm } from '@/api/adPromotion'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), create: vi.fn(), update: vi.fn(), saved: vi.fn(), warn: vi.fn(),
  t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
}))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.t }), initReactI18next: { type: '3rdParty', init: () => {} } }))
vi.mock('antd', async importOriginal => ({
  ...await importOriginal<typeof import('antd')>(),
  message: { success: vi.fn(), error: vi.fn(), warning: mocks.warn },
}))
vi.mock('@/api/adPromotion', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/adPromotion')>(),
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
  // 渲染期间同步更新 ref，保证 bind / getter 始终读到最新 controller。
  // 原写法 bind 是每次渲染重建的 inline fn → useEffect 依赖变化 → 每渲染重跑。
  // 过去这会导致无限循环：bind→setMeta→重渲染→新 bind→effect→…
  // 修复 useTrafficAlgorithmForm 后，其 effect 依赖稳定（ref 模式），
  // form.resetFields() 只调一次，循环被打破，这里恢复“每渲染调 bind”的原行为即可。
  const controllerRef = useRef(controller)
  controllerRef.current = controller
  useEffect(() => bind(form, controllerRef.current), [form, controllerRef.current, bind])
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
  const formRef = { current: undefined as FormInstance | undefined }
  const controllerRef = { current: undefined as Controller | undefined }
  const view = render(<ConfigProvider theme={{ token: { motion: false } }}><Harness {...props} bind={(f, c) => { formRef.current = f; controllerRef.current = c }} /></ConfigProvider>)
  return { ...view, get form() { return formRef.current as FormInstance }, get controller() { return controllerRef.current as Controller } }
}
const fixture = (params: Record<string, unknown> = {}): AdAlgorithm => ({
  id: 7, algoCode: 'SFTL0007', algoName: '午餐投流', algoType: 15, brand: 'flashBee', updatedBy: '测试运营',
  params: JSON.stringify({ ...readTrafficParams({}), consistencyCheckInterval: 10, ...params }),
})

beforeAll(async () => { await i18n.changeLanguage('zh-CN') })
beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue(fixture())
  mocks.create.mockReset().mockResolvedValue(fixture())
  mocks.update.mockReset().mockResolvedValue(fixture())
  mocks.saved.mockClear()
  mocks.warn.mockClear()
})

describe('投流配置交互与保存', () => {
  it('频控组默认折叠，全部字段仍注册且摘要跟随修改', async () => {
    const view = mountConfig()
    const heading = screen.getByRole('button', { name: '频控与触发', expanded: false })
    expect(heading).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('历史策略说明（不参与当前排序）')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '曝光比例试算' })).not.toBeInTheDocument()
    // 标签统计范围已固定为全部历史，不再挂载表单控件，其余字段仍全部注册。
    const fixedStats: TrafficFieldName[] = ['merchantKeywordStatsMode', 'merchantKeywordStatsDays', 'userKeywordStatsMode', 'userKeywordStatsDays']
    const registeredNames = view.form.getFieldsError().map(field => field.name[0])
    expect(registeredNames).toEqual(expect.arrayContaining(
      TRAFFIC_FIELD_NAMES.filter(name => !fixedStats.includes(name)),
    ))
    fireEvent.click(heading)
    fireEvent.change(screen.getByRole('spinbutton', { name: '同商家最多展示' }), { target: { value: '7' } })
    await waitFor(() => expect(screen.getByLabelText('投流配置概览')).toHaveTextContent('同店 2 小时 / 7 次'))
    // 标签衰减已并入「标签与兴趣匹配」组（默认展开）。
    expect(screen.getByRole('spinbutton', { name: '商家标签衰减周期' })).toHaveValue('7')
    fireEvent.change(screen.getByRole('spinbutton', { name: '商家标签衰减周期' }), { target: { value: '12' } })
    fireEvent.click(heading)
    expect(view.form.getFieldValue('merchantDecayDays')).toBe(12)
    expect(screen.queryByRole('spinbutton', { name: '同商家最多展示' })).not.toBeInTheDocument()
    // 全量字段注册断言 + 折叠展开切换，在高负载机器上易超默认 60s，显式放宽。
  }, 120000)

  it('隐藏组的错误自动展开并定位，未通过校验不调用 API', async () => {
    const view = mountConfig()
    const scroll = vi.spyOn(view.form, 'scrollToField').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '基础与可用性', expanded: true })).toHaveAttribute('aria-expanded', 'true'))
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
      consistencyCheckInterval: 17, statusRest: true, statusClosed: false, coverageFilterEnabled: false, matchThreshold: 30,
      generativeRecommendEnabled: false, soldOutFilterEnabled: false, dwellTimeThreshold: null, productCheckInterval: null,
    })
    fireEvent.click(screen.getByRole('switch', { name: '浏览后相似推荐' }))
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: '停留时长门槛' })).toBeInTheDocument())
    expect(view.form.getFieldValue('dwellTimeThreshold')).toBeNull()
    // 全量字段挂载 + 两次开关切换，在高负载机器上易超默认 60s，显式放宽。
  }, 120000)

  it('冷启动全部取消后无法保存，并定位所在组', async () => {
    const view = mountConfig()
    await act(async () => { view.form.setFieldsValue({ consistencyCheckInterval: 10, newUserDimensions: [] }) })
    const scroll = vi.spyOn(view.form, 'scrollToField').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('冷启动排序维度至少选择'))
    expect(mocks.create).not.toHaveBeenCalled()
    scroll.mockRestore()
  })

  it('冷启动三维度自由勾选、末项拦截、优先级可调，子配置随勾选联动', async () => {
    const view = mountConfig()
    const traffic = screen.getByRole('checkbox', { name: /剩余流量包/ })
    const quality = screen.getByRole('checkbox', { name: /商家质量分/ })
    const distance = screen.getByRole('checkbox', { name: /距离/ })
    // 默认距离＋流量勾选，三卡均可切换（不再锁定勾选）
    expect(distance).toBeChecked()
    expect(traffic).toBeChecked()
    expect(quality).not.toBeChecked()
    expect(distance).not.toBeDisabled()
    expect(traffic).not.toBeDisabled()
    expect(screen.getByText(/等权综合/)).toBeInTheDocument()
    // 标题问号弹层展示实现规则（综合分/归一/组合场景/示例/同分兜底）
    fireEvent.click(screen.getByRole('img', { name: '冷启动排序维度规则' }))
    expect(await screen.findByText('综合分公式')).toBeInTheDocument()
    expect(screen.getByText(/组合场景/)).toBeInTheDocument()
    // 勾选质量分→优选线出现
    fireEvent.click(quality)
    await waitFor(() => expect(view.form.getFieldValue('newUserDimensions')).toEqual(['distance', 'remainingTraffic', 'qualityScore']))
    expect(screen.getByRole('spinbutton', { name: '综合评分优选线' })).toBeInTheDocument()
    // 取消质量分→优选线隐藏但历史值保留
    fireEvent.click(quality)
    await waitFor(() => expect(screen.queryByRole('spinbutton', { name: '综合评分优选线' })).not.toBeInTheDocument())
    expect(view.form.getFieldValue('qualityScoreThreshold')).toBe(3.5)
    // 取消距离→仅剩流量；方向配置仍在
    fireEvent.click(distance)
    await waitFor(() => expect(view.form.getFieldValue('newUserDimensions')).toEqual(['remainingTraffic']))
    expect(screen.getByRole('combobox', { name: '流量包排序方向' })).toBeInTheDocument()
    // 末项取消被拦截：警告＋值不变＋仍勾选
    fireEvent.click(traffic)
    await waitFor(() => expect(mocks.warn).toHaveBeenCalled())
    expect(view.form.getFieldValue('newUserDimensions')).toEqual(['remainingTraffic'])
    expect(traffic).toBeChecked()
    // 单维度可保存，顺序即优先级
    await act(async () => { view.form.setFieldsValue({ consistencyCheckInterval: 10 }) })
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0].params.newUserDimensions).toEqual(['remainingTraffic'])
    // 全量字段挂载＋多次勾选联动，高负载机器易超默认 60s，显式放宽。
  }, 120000)

  it('编辑不显示已退役的历史策略说明，旧策略与隐藏参数仍归档保留', async () => {
    mocks.fetch.mockResolvedValue(fixture({
      merchantExposureStrategy: 'legacy-strategy', generativeRecommendEnabled: false,
      generativePriorityMode: 'hybrid', generativePriorityMode2: 'trafficBalance', generativeSkipMerchantCount: 0,
      extraRule: { keep: true },
    }))
    mountConfig({ id: '7' })
    await waitFor(() => expect(screen.getByLabelText('更新人')).toHaveTextContent('测试运营'))
    expect(screen.queryByText('历史策略说明（不参与当前排序）')).not.toBeInTheDocument()
    expect(screen.queryByText('历史保存策略：legacy-strategy')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '曝光比例试算' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(mocks.update.mock.calls[0]).toEqual([7, expect.objectContaining({ params: expect.objectContaining({
      generativeRecommendEnabled: false,
      legacyTrafficParams: expect.objectContaining({ merchantExposureStrategy: 'legacy-strategy',
        generativePriorityMode: 'hybrid', generativePriorityMode2: 'trafficBalance', generativeSkipMerchantCount: 0 }),
      consistencyCheckInterval: 10, extraRule: { keep: true },
    }) })])
    expect(mocks.update.mock.calls[0][1].params).not.toHaveProperty('merchantExposureStrategy')
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
    // 两次全量字段挂载 + 重试，在高负载机器上易超默认 60s，显式放宽。
  }, 120000)

  it('损坏的 JSON 不允许以默认参数覆盖', async () => {
    mocks.fetch.mockResolvedValue({ ...fixture(), params: '{broken' })
    const view = mountConfig({ id: '7' })
    await waitFor(() => expect(screen.getByLabelText('加载状态')).toHaveTextContent('error'))
    await act(async () => { await view.controller.handleSave() })
    expect(mocks.update).not.toHaveBeenCalled()
    // 全量字段挂载 + 错误态渲染，在高负载机器上易超默认 60s，显式放宽。
  }, 120000)

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

  it('标签统计范围不再提供选择器，固定口径卡展示且旧自定义周期保存时归一', async () => {
    mocks.fetch.mockResolvedValue(fixture({ merchantKeywordStatsMode: 'custom', merchantKeywordStatsDays: 30 }))
    mountConfig({ id: '7' })
    await waitFor(() => expect(screen.getByLabelText('加载状态')).toHaveTextContent('ready'))
    expect(screen.queryByRole('combobox', { name: '商家标签统计范围' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '用户标签统计范围' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('标签统计范围固定口径')).toHaveTextContent('全部历史')
    expect(screen.getByRole('note', { name: '标签统计范围固定口径' })).toHaveTextContent('自定义周期因技术实现难度已取消')
    expect(screen.getByLabelText('投流配置概览')).toHaveTextContent('全部历史（固定口径）')
    expect(screen.getByLabelText('投流配置概览')).toHaveTextContent('旧自定义周期已失效')
    expect(screen.getByText('历史记录中保存的自定义周期已不再生效，保存后统一按全部历史口径执行。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledTimes(1))
    expect(mocks.update.mock.calls[0][1].params).toMatchObject({
      merchantKeywordStatsMode: 'all', merchantKeywordStatsDays: 30,
      userKeywordStatsMode: 'all', userKeywordStatsDays: 30,
    })
    // 旧记录加载 + 保存归一断言，在高负载机器上易超默认 60s，显式放宽。
  }, 120000)

  it('详情模式只读，无保存入口，仍可展开基础分组', async () => {
    const view = mountConfig({ id: '7', readOnly: true })
    await waitFor(() => expect(screen.getByLabelText('加载状态')).toHaveTextContent('ready'))
    expect(screen.queryByRole('button', { name: '保存配置' })).not.toBeInTheDocument()
    expect(screen.queryByText('历史策略说明（不参与当前排序）')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '曝光比例试算' })).not.toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: '用户偏好识别最低分' })).toBeDisabled()
    const navigation = screen.getByRole('navigation', { name: '投流配置分组导航' })
    fireEvent.click(within(navigation).getByRole('button', { name: '基础与可用性' }))
    expect(screen.getByRole('spinbutton', { name: '数据一致性检查周期' })).toBeDisabled()
    await act(async () => { await view.controller.handleSave() })
    expect(mocks.update).not.toHaveBeenCalled()
    // 只读态全量字段禁用断言，在高负载机器上易超默认 60s，显式放宽。
  }, 120000)

  it('投流坑位排序置末且与冷启动/相似推荐独立；预设回写因子，自定义勾选子集，相似可切独立优先级', async () => {
    const view = mountConfig()
    const navigation = screen.getByRole('navigation', { name: '投流配置分组导航' })
    const navNames = within(navigation).getAllByRole('button').map(b => b.textContent)
    expect(navNames).toEqual(['基础与可用性', '标签与兴趣匹配', '冷启动推荐', '相似推荐', '频控与触发', '投流坑位排序'])
    expect(screen.getByRole('button', { name: '投流坑位排序', expanded: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '冷启动推荐', expanded: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '相似推荐', expanded: true })).toBeInTheDocument()
    // 默认匹配优先：单轴排序，不展示因子勾选；摘要显示按匹配得分
    expect(screen.queryByRole('checkbox', { name: '匹配分' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('共用排序规则摘要')).toHaveTextContent('匹配优先')
    expect(screen.getByLabelText('共用排序规则摘要')).toHaveTextContent('按匹配得分')
    const preset = screen.getByRole('combobox', { name: '排序策略' })
    fireEvent.mouseDown(preset)
    fireEvent.click(await screen.findByText('消耗优先'))
    await waitFor(() => expect(view.form.getFieldValue('rankFactors')).toEqual([]))
    // 纯余量排序：同分决胜不含「按流量包方向」，且存量 trafficDirection 被修正
    expect(view.form.getFieldValue('rankTieBreak')).toBe('quality')
    const tie = screen.getByRole('combobox', { name: '同分决胜' })
    fireEvent.mouseDown(tie)
    const tieOpt = await screen.findByRole('option', { name: '质量分高者优先' })
    const tieDrop = tieOpt.closest('.ant-select-dropdown') as HTMLElement
    expect(within(tieDrop).queryByRole('option', { name: '按流量包方向' })).not.toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    fireEvent.mouseDown(preset)
    fireEvent.click(await screen.findByText('自定义因子'))
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: '匹配分' })).toHaveLength(1))
    expect(screen.getByRole('checkbox', { name: '匹配分' })).not.toBeDisabled()
    // 自定义＝勾选子集：默认回退匹配/质量/距离，取消匹配分后仅余质量/距离
    fireEvent.click(screen.getByRole('checkbox', { name: '匹配分' }))
    await waitFor(() => expect(view.form.getFieldValue('rankFactors')).toEqual(['quality', 'distance']))
    // 相似推荐切独立配置：出现独立排序策略（预设单轴，其因子勾选亦隐藏）
    const scope = screen.getByRole('combobox', { name: '优先级来源' })
    fireEvent.mouseDown(scope)
    fireEvent.click(await screen.findByText('独立配置'))
    await waitFor(() => expect(screen.getByRole('combobox', { name: '独立排序策略' })).toBeInTheDocument())
    expect(screen.getAllByRole('checkbox', { name: '匹配分' })).toHaveLength(1)
    // 多次 antd Select 开合 + 全量字段挂载，在低配/高负载机器上易超默认 60s，显式放宽。
  }, 180000)

  it('时段优先开关控制补齐策略可见性', async () => {
    mountConfig()
    const sw = screen.getByRole('switch', { name: '时段优先' })
    expect(sw).toBeChecked()
    expect(screen.getByRole('combobox', { name: '候选不足补齐' })).toBeInTheDocument()
    fireEvent.click(sw)
    await waitFor(() => expect(screen.queryByRole('combobox', { name: '候选不足补齐' })).not.toBeInTheDocument())
    fireEvent.click(sw)
    await waitFor(() => expect(screen.getByRole('combobox', { name: '候选不足补齐' })).toBeInTheDocument())
  }, 120000)

  it('只选同类目时融合旧字段不阻断保存，两种算法始终可选；用户协同勾选后门槛随模式出现', async () => {
    const view = mountConfig()
    // 用户协同为一期正式模式：默认未勾选，勾选后出现独立相似度门槛
    const userSimilar = screen.getByRole('checkbox', { name: '用户协同推荐' })
    expect(userSimilar).not.toBeChecked()
    expect(screen.queryByRole('spinbutton', { name: '相似用户最低相似度' })).not.toBeInTheDocument()
    fireEvent.click(userSimilar)
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: '相似用户最低相似度' })).toBeInTheDocument())
    // 按坑位选来源：第 2 位仅 2 家时出现；取消勾选后来源回退到已勾选模式
    expect(screen.getByRole('combobox', { name: '第 1 位优先来源' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '第 2 位优先来源' })).not.toBeInTheDocument()
    await act(async () => { view.form.setFieldsValue({ generativeMerchantCount: 2, similarRecSlot1Source: 'userSimilar' }) })
    expect(screen.getByRole('combobox', { name: '第 2 位优先来源' })).toBeInTheDocument()
    await act(async () => { view.form.setFieldsValue({ consistencyCheckInterval: 10,
      similarRecModes: ['sameCategory'], similarAnchor: 'blend', similarBlendRatio: null, similarityMetric: 'weightedJaccard' }) })
    expect(screen.getByRole('combobox', { name: '相似度算法' })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: '相似度门槛' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    const params = mocks.create.mock.calls[0][0].params
    expect(params.similarityMetric).toBe('weightedJaccard')
    expect(params.similarRecSlot1Source).toBe('sameCategory')
    expect(params).not.toHaveProperty('similarRecPriority')
    expect(params.newUserDimensions).toEqual(['distance', 'remainingTraffic'])
    expect(params).not.toHaveProperty('similarBlendRatio')
    expect(params).not.toHaveProperty('explorationSlots')
    expect(params).not.toHaveProperty('qualityFilterEnabled')
    // 与下一条同形：全量字段挂载 + 勾选联动 + 保存断言，默认 60s 在高负载机器上会假红。
  }, 120000)

  it('普通协同独立开关、关闭保留门槛，点击后关闭不影响普通协同保存', async () => {
    const view = mountConfig()
    const toggle = screen.getByRole('switch', { name: '启用用户协同补充' })
    expect(toggle).not.toBeChecked()
    expect(screen.queryByRole('spinbutton', { name: '协同补充最低用户相似度' })).not.toBeInTheDocument()
    fireEvent.click(toggle)
    const threshold = await screen.findByRole('spinbutton', { name: '协同补充最低用户相似度' })
    fireEvent.change(threshold, { target: { value: '85' } })
    await waitFor(() => expect(view.form.getFieldValue('matchingUserSimilarThreshold')).toBe(85))
    // 点击后关闭不影响普通协同；门槛与开关独立保存
    fireEvent.click(screen.getByRole('switch', { name: '浏览后相似推荐' }))
    await act(async () => { view.form.setFieldsValue({ consistencyCheckInterval: 10, userSimilarThreshold: null }) })
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.create.mock.calls[0][0].params).toMatchObject({ matchingUserSimilarEnabled: true,
      matchingUserSimilarThreshold: 85, generativeRecommendEnabled: false, userSimilarThreshold: null })
    // 关闭协同后门槛原值保留
    await act(async () => { view.form.setFieldsValue({ matchingUserSimilarEnabled: false }) })
    fireEvent.click(screen.getByRole('button', { name: /保存配置/ }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2))
    expect(mocks.create.mock.calls[1][0].params).toMatchObject({ matchingUserSimilarEnabled: false, matchingUserSimilarThreshold: 85 })
    // 全量字段挂载 + 两次保存，在高负载机器上易超默认 60s，显式放宽。
  }, 120000)

  it('普通协同试算补满三位不受点击后两家限制，已满不补、只读也不写配置', async () => {
    const values = readTrafficParams({ matchingUserSimilarEnabled: true, generativeRecommendEnabled: false })
    const before = structuredClone(values)
    render(<Form disabled><SimilarityTrial values={values} /></Form>)
    fireEvent.click(screen.getByRole('button', { name: '相似度试算' }))
    const dialog = within(await screen.findByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: '协同补充案例' }))
    const result = dialog.getByLabelText('普通投流最终名单')
    expect(result.querySelectorAll('strong')).toHaveLength(3)
    expect(result).toHaveTextContent('直接兴趣匹配')
    expect(result).toHaveTextContent('用户协同补充')
    expect(result).not.toHaveTextContent('商家 D')
    expect(dialog.getByLabelText('协同计算过程')).toHaveTextContent('非投流·不推荐')
    const slots = dialog.getByRole('spinbutton', { name: '示例普通投流可用坑位' })
    expect(slots).not.toBeDisabled()
    fireEvent.change(slots, { target: { value: '1' } })
    await waitFor(() => expect(result.querySelectorAll('strong')).toHaveLength(1))
    expect(result).not.toHaveTextContent('用户协同补充')
    expect(values).toEqual(before)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('点击后试算读取按坑位优先来源和独立排序，受两家及可用坑位约束且只读不写库', async () => {
    const values = readTrafficParams({ similarRecModes: ['merchantSimilar', 'userSimilar'], generativeMerchantCount: 2 })
    const view = render(<Form disabled><ClickRecTrial values={values} /></Form>)
    fireEvent.click(screen.getByRole('button', { name: '点击后推荐试算' }))
    const dialog = within(await screen.findByRole('dialog'))
    const result = dialog.getByLabelText('点击后最终名单')
    expect(result.querySelectorAll('strong')).toHaveLength(2)
    // 默认 slot1=商家相似、slot2=用户协同 → 两位各来自不同来源
    expect(result).toHaveTextContent('商家相似')
    expect(result).toHaveTextContent('用户协同')
    expect(result).not.toHaveTextContent('商家 A')
    expect(result).not.toHaveTextContent('商家 D')
    expect(dialog.getByLabelText('协同计算过程')).toHaveTextContent('非投流·不推荐')
    // 两位都选协同 → 协同占满两位
    view.rerender(<Form disabled><ClickRecTrial values={{ ...values, similarRecSlot1Source: 'userSimilar', similarRecSlot2Source: 'userSimilar' }} /></Form>)
    expect(result).toHaveTextContent('用户协同')
    expect(result).not.toHaveTextContent('商家相似')
    expect(result.querySelector('strong')).toHaveTextContent('商家 C')
    view.rerender(<Form disabled><ClickRecTrial values={{ ...values, similarRecSlot1Source: 'userSimilar', similarRecSlot2Source: 'userSimilar', similarRankMode: 'independent', similarRankPreset: 'consumeFirst' }} /></Form>)
    expect(result.querySelector('strong')).toHaveTextContent('商家 B')
    const slots = dialog.getByRole('spinbutton', { name: '示例点击后可用投流坑位' })
    expect(slots).not.toBeDisabled()
    fireEvent.change(slots, { target: { value: '0' } })
    await waitFor(() => expect(result.querySelectorAll('strong')).toHaveLength(0))
    expect(values.similarRankMode).toBe('inherit')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('只读表单仍可交互试算，不写入正式配置，案例解释完整向量和冷启动', async () => {
    const values = readTrafficParams({})
    render(<Form disabled><SimilarityTrial values={values} /></Form>)
    fireEvent.click(screen.getByRole('button', { name: '相似度试算' }))
    const dialog = within(await screen.findByRole('dialog'))
    expect(dialog.getByRole('textbox', { name: '用户标签1' })).not.toBeDisabled()
    expect(dialog.getByText('局部试算：当前用户 → 候选商家')).toBeInTheDocument()
    fireEvent.click(dialog.getByRole('button', { name: '强弱偏好' }))
    await waitFor(() => expect(dialog.getByText(/余弦 99.5%/)).toBeInTheDocument())
    expect(dialog.getByText(/余弦 10.0%/)).toBeInTheDocument()
    fireEvent.change(dialog.getAllByRole('spinbutton', { name: '用户分' })[0], { target: { value: '80' } })
    expect(values.userPreferenceMinScore).toBe(10)
    fireEvent.click(dialog.getByRole('button', { name: '无用户偏好' }))
    await waitFor(() => expect(dialog.getByText(/无有效偏好：本例按冷启动规则/)).toBeInTheDocument())
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
