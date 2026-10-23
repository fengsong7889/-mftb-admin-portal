/**
 * RDM 页面返回落点回归。
 *
 * 历史 bug：从需求详情新建子任务、保存后被 push 到一条新详情记录，用户点返回先落回
 * 表单页、再点才回到更早的详情页，连续建任务时无限往返。
 * 这里钉住两条判据：有站内历史必须 go(-1)，直接打开（key=default）才 replace 到兜底路径。
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { hasInAppHistory, INITIAL_LOCATION_KEY, useRdmBack } from './useRdmBack'

function Probe({ fallback }: { fallback: string }) {
  const goBack = useRdmBack(fallback)
  const location = useLocation()
  return (
    <>
      <button onClick={goBack}>go-back</button>
      <output data-testid="location">{location.pathname + location.search}</output>
    </>
  )
}

describe('hasInAppHistory', () => {
  it('初始加载 key 为 default 视为无站内历史', () => {
    expect(hasInAppHistory(INITIAL_LOCATION_KEY)).toBe(false)
    expect(hasInAppHistory('4f2a1c')).toBe(true)
  })
})

describe('useRdmBack', () => {
  it('有站内历史时回退到上一页，而不是 push 兜底路径', () => {
    render(
      <MemoryRouter initialEntries={['/rdm-detail?id=9&tab=task', '/rdm-task?reqId=9']}>
        <Probe fallback="/rdm-detail?id=9" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('go-back'))
    // 回到进入表单前的详情记录（含 tab 与 from），不是兜底路径
    expect(screen.getByTestId('location')).toHaveTextContent('/rdm-detail?id=9&tab=task')
  })

  it('直接打开页面（无站内历史）时 replace 到兜底路径，不退出站点', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/rdm-task', search: '?reqId=9', key: INITIAL_LOCATION_KEY }]}>
        <Probe fallback="/rdm-detail?id=9" />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('go-back'))
    expect(screen.getByTestId('location')).toHaveTextContent('/rdm-detail?id=9')
  })
})
