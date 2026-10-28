#!/usr/bin/env node
/**
 * P4 成本汇总（方案 §8.1.7）：读 engineering/p4-billing-sample-*.json，按天汇总并给降配/双服务估算。
 *
 * 为什么单独一个脚本：文档里的钱数必须能被复核，而不是「凭截图心算」。
 * 只做四则运算；不抓取、不连接 Sealos。
 *
 * 用法：node scripts/p4-cost-report.mjs [--file engineering/p4-billing-sample-2026-10-28.json]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const args = process.argv.slice(2)
const i = args.indexOf('--file')
const file = path.resolve(ROOT, i >= 0 && args[i + 1] ? args[i + 1] : 'engineering/p4-billing-sample-2026-10-28.json')
const data = JSON.parse(fs.readFileSync(file, 'utf8'))

const sum = (rows, pick) => rows.reduce((n, r) => n + pick(r), 0)
const money = (n) => `¥${n.toFixed(4)}`
const share = (part, total) => `${((part / total) * 100).toFixed(1)}%`

const byDate = {}
for (const r of data.rows) (byDate[r.date] ??= []).push(r)

console.log(`P4 成本汇总：${data.app}（样本 ${data.rows.length} 行，区间 ${data.range}）`)
for (const [date, rows] of Object.entries(byDate)) {
  const total = sum(rows, (r) => r.total)
  const cpu = sum(rows, (r) => r.cpuAmount)
  const mem = sum(rows, (r) => r.memAmount)
  const net = sum(rows, (r) => r.networkAmount)
  const hours = rows.length
  console.log(
    `  ${date}  ${String(hours).padStart(2)}h  合计 ${money(total)}  ` +
    `CPU ${money(cpu)}(${share(cpu, total)})  内存 ${money(mem)}(${share(mem, total)})  ` +
    `网络 ${money(net)}(${share(net, total)})  均 ${money(total / hours)}/h  ` +
    `均核 ${(sum(rows, (r) => r.cpu) / hours).toFixed(3)}  均内存 ${(sum(rows, (r) => r.memGi) / hours).toFixed(3)} Gi`,
  )
}

// 场景估算用「已读满 24h」的最后一天，避免把部分日外推成日均
const fullDates = Object.entries(byDate).filter(([, rows]) => rows.length >= 24).map(([d]) => d)
const baseDate = fullDates[fullDates.length - 1]
if (!baseDate) {
  console.log('\n（没有满 24 小时的样本，跳过场景估算）')
  process.exit(0)
}
const rows = byDate[baseDate]
const cpu = sum(rows, (r) => r.cpuAmount)
const mem = sum(rows, (r) => r.memAmount)
const net = sum(rows, (r) => r.networkAmount)
const totals = rows.map((r) => r.total).sort((a, b) => a - b)
const median = (totals[11] + totals[12]) / 2

console.log(`\n场景估算（以 ${baseDate} 的单价与网络费为口径，元/天）`)
console.log(`  当前 1核+1Gi          ${money(cpu + mem + net)}`)
console.log(`  0.5核+1Gi（CPU 减半） ${money(cpu * 0.5 + mem + net)}`)
console.log(`  0.5核+0.5Gi           ${money(cpu * 0.5 + mem * 0.5 + net)}（内存峰值已超 1Gi，0.5Gi 不可行）`)
console.log(`  双服务 各1核+1Gi      ${money((cpu + mem) * 2 + net)}`)
console.log(`  双服务 各0.5核+1Gi    ${money(cpu + mem * 2 + net)}`)
console.log(`\n小时费用：谷 ${money(totals[0])} / 中位 ${money(median)} / 峰 ${money(totals[totals.length - 1])}`)
console.log('目标：≤ ¥1.0000/天（方案 §8.1.7）')
