#!/usr/bin/env node
/**
 * 就绪探针测量（方案 §8.1.6）：对 /api/health/ready 做稳态采样，或在发布窗口内测「启动→就绪」耗时。
 *
 * 为什么不用压测工具：这里要回答的是两个具体问题——
 *   1) 稳态下就绪端点是否稳定 200、响应多快（p95）；
 *   2) 滚更新后，新实例从进程启动到「迁移完成、可接流量」用了多久。
 * 两者都只需要轻量轮询，不产生业务写入，也不携带任何凭据。
 *
 * 用法：
 *   node scripts/measure-readiness.mjs                     # 稳态采样 30 次
 *   node scripts/measure-readiness.mjs --samples 50
 *   node scripts/measure-readiness.mjs --wait              # 发布窗口：脚本先启动，再触发重启
 *   node scripts/measure-readiness.mjs --watch-restart     # 发布窗口：等到「不可用→恢复」并计时（无需集群权限）
 *   node scripts/measure-readiness.mjs --url http://127.0.0.1:8080/api/health/ready
 * 退出码：0 正常/已恢复；1 出现非 200 或等待超时（稳态采样）；3 观察窗口内未发生重启（滚动更新未中断服务）
 */
const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const url = valueOf('url', 'https://dacnhtyrpxhc.sealoshzh.site/api/health/ready')
const samples = Number(valueOf('samples', 30))
const interval = Number(valueOf('interval', 200))
const waitMode = args.includes('--wait')
const watchRestart = args.includes('--watch-restart')
const waitTimeoutSec = Number(valueOf('timeout', 600))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function probeOnce() {
  const started = Date.now()
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    const body = await res.text()
    return { status: res.status, ms: Date.now() - started, body: body.slice(0, 120) }
  } catch (err) {
    return { status: 0, ms: Date.now() - started, body: `请求失败：${err instanceof Error ? err.message : String(err)}` }
  }
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

if (watchRestart) {
  // 发布窗口测量（无需集群权限）：先等到一次「不可用」（连接失败或非 200），
  // 再等连续 3 次 200；两段耗时即「服务中断窗口」与「恢复耗时」。
  // 滚动更新若保持旧实例在线，可能始终 200——那也是一种结论：本次发布未中断服务。
  const start = Date.now()
  let sawGap = false
  let gapStart = 0
  let last = null
  let okStreak = 0
  const timeline = []
  const log = (line) => { timeline.push(line); console.log(line) }

  while ((Date.now() - start) / 1000 < waitTimeoutSec) {
    last = await probeOnce()
    const t = ((Date.now() - start) / 1000).toFixed(1)
    if (!sawGap) {
      if (last.status !== 200) {
        sawGap = true
        gapStart = Date.now()
        log(`[${t}s] 检测到不可用：status=${last.status} ${last.body}`)
      }
    } else if (last.status === 200) {
      okStreak += 1
      if (okStreak >= 3) {
        const gapSec = (Date.now() - gapStart) / 1000
        log(`[${t}s] 已连续 3 次 200，恢复`)
        console.log(`\n结果：不可用→恢复耗时 ${gapSec.toFixed(1)}s（此间包含进程启动、迁移与就绪校验）`)
        console.log('说明：该窗口是「服务不可用时长」；若旧实例仍在服务而新实例未就绪，外部只会看到 200，不代表新实例已就绪。')
        process.exit(0)
      }
    } else {
      okStreak = 0
    }
    await sleep(1500)
  }
  if (!sawGap) {
    console.log(`\n观察 ${waitTimeoutSec}s 未检测到不可用：本次发布期间服务始终 200（滚动更新未中断）。`)
    process.exit(3)
  }
  console.error(`\n❌ 不可用后 ${waitTimeoutSec}s 内未恢复，最后：${last?.status} ${last?.body ?? ''}`)
  process.exit(1)
}

if (waitMode) {
  // 发布窗口用法：先跑本命令，再到 Sealos 触发重启；脚本轮询到 200 即输出耗时
  const start = Date.now()
  let last = null
  while ((Date.now() - start) / 1000 < waitTimeoutSec) {
    last = await probeOnce()
    if (last.status === 200) {
      console.log(`✅ 已就绪：等待 ${((Date.now() - start) / 1000).toFixed(1)}s（含触发前的空转，按实际重启时刻扣减）`)
      process.exit(0)
    }
    await sleep(2000)
  }
  console.error(`❌ ${waitTimeoutSec}s 内未就绪，最后一次：${last?.status} ${last?.body ?? ''}`)
  process.exit(1)
}

const results = []
for (let i = 0; i < samples; i++) {
  results.push(await probeOnce())
  if (i < samples - 1) await sleep(interval)
}

const ok = results.filter((r) => r.status === 200)
const bad = results.filter((r) => r.status !== 200)
const ms = ok.map((r) => r.ms)
console.log(`就绪探针采样：${url}`)
console.log(`  次数 ${samples}，成功 ${ok.length}，失败 ${bad.length}`)
if (ms.length) {
  console.log(
    `  响应耗时 ms：min ${Math.min(...ms)} / p50 ${percentile(ms, 50)} / p95 ${percentile(ms, 95)} / ` +
    `p99 ${percentile(ms, 99)} / max ${Math.max(...ms)}`,
  )
}
for (const b of bad.slice(0, 5)) console.log(`  ✗ ${b.status} ${b.body}`)
console.log('\n说明：这是「外部到就绪端点」的延迟，含公网 RTT；不等于业务接口 p95，也不替代 APM。')
process.exit(bad.length ? 1 : 0)
