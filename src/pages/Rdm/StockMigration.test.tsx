/**
 * 存量安全遷移 —— 任務30 全流程 / 三鐵律測試
 *
 * 釘死：
 *  1. 未確認不可執行（previewed 時執行入口禁用，僅主責確認可用）；
 *  2. 遷移項標注「遷移生成·未測試/未驗收/未發布」（不偽造證據）；
 *  3. 拒絕盲目回滾的优雅呈现（發現新 V3 事實 → 回退被拒 + 自動暫停 + 請走前滾）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { fetchMigrationBatchDetail, fetchMigrationBatches, rollbackMigrationBatch } from '../../api/rdm'
import StockMigration from './StockMigration'

let canEdit = true
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ hasPermission: () => canEdit, hasMenuPermission: () => canEdit }),
}))

vi.mock('../../api/rdm', () => ({
  fetchMigrationBatches: vi.fn(),
  fetchMigrationBatchDetail: vi.fn(),
  previewStockMigration: vi.fn(),
  confirmMigrationBatch: vi.fn(),
  executeMigrationChunk: vi.fn(),
  pauseMigrationBatch: vi.fn(),
  resumeMigrationBatch: vi.fn(),
  reconcileMigrationBatch: vi.fn(),
  rollbackMigrationBatch: vi.fn(),
}))

function batch(status: string) {
  return {
    batchId: 1, status, chunkSize: 20, previewHash: 'HASH-1', confirmedBy: status === 'previewed' ? null : 9,
    createdAt: '2026-05-01T10:00:00', version: 2, requestId: 'req-1',
    confirmedAt: null, pausedAt: null, pauseReason: null,
    items: [
      { itemId: 10, reqId: 100, targetProjectId: 7, status: 'previewed', blockingReason: null },
    ],
    audits: [
      { id: 1, action: 'PREVIEW', result: 'OK', operatorUserId: 9, beforeVersion: 1, afterVersion: 2, reason: '發起', createdAt: '2026-05-01T10:00:00' },
    ],
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  canEdit = true
  vi.mocked(fetchMigrationBatches).mockResolvedValue([batch('previewed')])
})

function renderPage() {
  return render(<MemoryRouter><StockMigration /></MemoryRouter>)
}

async function openDetail(status: string) {
  vi.mocked(fetchMigrationBatchDetail).mockResolvedValue(batch(status))
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: '查看詳情' }))
  await screen.findByText(/批次 #1 詳情/)
}

describe('StockMigration 未確認不可執行', () => {
  it('previewed 時「執行一個分塊」禁用，僅「主責確認」可用', async () => {
    await openDetail('previewed')
    expect(screen.getByRole('button', { name: /執行一個分塊/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /主責確認/ })).toBeEnabled()
    expect(screen.getByText(/待主責確認：確認前執行入口一律禁用/)).toBeInTheDocument()
  })

  it('非管理員（無 rdm-delivery:edit）時主責確認也禁用', async () => {
    canEdit = false
    await openDetail('previewed')
    expect(screen.getByRole('button', { name: /主責確認/ })).toBeDisabled()
  })
})

describe('StockMigration 不偽造證據', () => {
  it('遷移明細項標注「遷移生成·未測試/未驗收/未發布」', async () => {
    await openDetail('previewed')
    expect(await screen.findByText('遷移生成·未測試/未驗收/未發布')).toBeInTheDocument()
  })
})

describe('StockMigration 拒絕盲目回滾', () => {
  it('發現新 V3 事實時回退被拒 → 优雅呈现「已自動暫停，請走前滾」', async () => {
    vi.mocked(rollbackMigrationBatch).mockResolvedValue({
      batchId: 1, rejected: true, rejectReason: '存在遷移後新生成的 V3 事實，回退會丟失這些事實',
      newFactsByItem: { '10': { test: [1] } }, rolledBackItemIds: [], batchStatus: 'paused',
    } as never)
    await openDetail('running')
    // 點「回退」→ 原因 Modal
    fireEvent.click(screen.getByRole('button', { name: /回退/ }))
    const ta = await screen.findByPlaceholderText('為什麼回退？（發現新 V3 事實將被拒絕）')
    fireEvent.change(ta, { target: { value: '需要回退' } })
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    // 二次確認（靜態 Modal.confirm）
    fireEvent.click(await screen.findByRole('button', { name: /確認回退/ }))
    await waitFor(() => expect(rollbackMigrationBatch).toHaveBeenCalled())
    expect(await screen.findByText(/回退被拒絕：發現新 V3 事實，已自動暫停，請走前滾/)).toBeInTheDocument()
  })
})
