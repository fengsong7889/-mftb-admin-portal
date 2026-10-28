#!/usr/bin/env node
/**
 * 生产就绪配置校验（方案 §8.1.6 的前置门槛，只读）。
 *
 * 为什么需要它：探针/优雅退出如果没有被真正应用到 Deployment，
 * 「启动就绪耗时」根本测不出来，滚动发布也仍可能把流量打到未就绪实例。
 * 本脚本读线上 Deployment 的实际规格逐项判定，避免「文档里有、集群里没有」。
 *
 * 用法：
 *   KUBECONFIG=~/.kube/sealos-readonly.yaml npm run check:deploy
 *   node scripts/verify-deploy-readiness.mjs --namespace ns-xxx [--json]
 *   node scripts/verify-deploy-readiness.mjs --from deploy.json      # 离线校验导出的 Deployment JSON
 * 退出码：0 全部通过；1 有未通过项；2 环境/参数问题（无 kubectl / 读不到 Deployment）。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { evaluateDeployment } from './lib/deploy-readiness.mjs'

const args = process.argv.slice(2)
const valueOf = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const deployment = valueOf('deployment', 'mftb-admin-backend')
const containerName = valueOf('container', deployment)
const fromFile = valueOf('from', '')
const asJson = args.includes('--json')
let namespace = valueOf('namespace', '')

const kubectl = (argv, allowFail = false) => {
  try {
    return execFileSync('kubectl', argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (err) {
    if (allowFail) return ''
    const msg = err?.stderr?.toString()?.trim() || err.message
    console.error(`❌ kubectl 执行失败：${msg}`)
    console.error('   请确认已安装 kubectl，且 KUBECONFIG 指向可读集群（只读权限即可）；或用 --from 读导出文件。')
    process.exit(2)
  }
}

let deploy
if (fromFile) {
  try {
    deploy = JSON.parse(fs.readFileSync(fromFile, 'utf8'))
  } catch (err) {
    console.error(`❌ 无法读取 Deployment JSON「${fromFile}」：${err.message}`)
    process.exit(2)
  }
} else {
  if (!namespace) {
    const found = kubectl(['get', 'deploy', '-A', '-o',
      'jsonpath={range .items[*]}{.metadata.namespace}{"\\t"}{.metadata.name}{"\\n"}{end}'], true)
      .split('\n')
      .map((l) => l.split('\t'))
      .find(([, name]) => name === deployment)
    namespace = found?.[0] ?? ''
  }
  if (!namespace) {
    console.error(`❌ 未找到 Deployment「${deployment}」。请用 --namespace 指定。`)
    process.exit(2)
  }
  deploy = JSON.parse(kubectl(['-n', namespace, 'get', 'deploy', deployment, '-o', 'json']))
}

const result = evaluateDeployment(deploy, { deployment, containerName })
if (asJson) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`Deployment 就绪配置：${result.namespace}/${result.deployment}`)
  for (const c of result.checks) console.log(`  ${c.ok ? '✅' : '❌'} ${c.name}  （${c.detail}）`)
  console.log(
    result.failed
      ? `\n❌ ${result.failed} 项未通过。补丁见 deploy/sealos/backend-probes.patch.yaml（应用属生产变更，需授权）。`
      : '\n✅ 探针/优雅退出已就绪：可在下次滚动发布时运行 npm run measure:ready -- --wait 采集启动耗时。',
  )
}
process.exit(result.failed ? 1 : 0)
