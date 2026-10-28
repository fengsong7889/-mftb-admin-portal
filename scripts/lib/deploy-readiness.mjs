/**
 * Deployment 就绪配置的判定逻辑（纯函数，可单测）。
 *
 * 为什么抽出来：这些规则决定「发布是否可观测、是否会打到未就绪实例」，
 * 如果只能连真集群才能验证，规则本身就没人敢改。这里只吃 JSON，不发请求。
 */

/**
 * @param {object} deploy Deployment JSON（kubectl get -o json 的结果）
 * @param {{deployment?: string, containerName?: string}} opts
 * @returns {{namespace: string, deployment: string, checks: {name: string, ok: boolean, detail: string}[], failed: number}}
 */
export function evaluateDeployment(deploy, opts = {}) {
  const deployment = opts.deployment ?? deploy?.metadata?.name ?? 'unknown'
  const containerName = opts.containerName ?? deployment
  const podSpec = deploy?.spec?.template?.spec ?? {}
  const container = (podSpec.containers ?? []).find((c) => c.name === containerName)

  const checks = []
  const add = (name, ok, detail) => checks.push({ name, ok, detail })
  if (!container) {
    add(`容器 ${containerName} 存在`, false, 'Deployment 中找不到该容器')
    return { namespace: deploy?.metadata?.namespace ?? '', deployment, checks, failed: checks.length }
  }

  const path = (probe) => probe?.httpGet?.path ?? ''
  const port = (probe) => Number(probe?.httpGet?.port ?? 0)
  const ports = (container.ports ?? []).map((p) => Number(p.containerPort))

  add('terminationGracePeriodSeconds ≥ 40（大于 shutdown timeout 30s）',
    Number(podSpec.terminationGracePeriodSeconds ?? 0) >= 40,
    `当前 ${podSpec.terminationGracePeriodSeconds ?? '未设置（默认 30）'}`)
  add('startupProbe → /api/health/live', path(container.startupProbe) === '/api/health/live',
    `当前 ${path(container.startupProbe) || '未配置'}`)
  add('readinessProbe → /api/health/ready（迁移未完成不接流量）',
    path(container.readinessProbe) === '/api/health/ready',
    `当前 ${path(container.readinessProbe) || '未配置'}`)
  add('livenessProbe → /api/health/live（不依赖数据库）',
    path(container.livenessProbe) === '/api/health/live',
    `当前 ${path(container.livenessProbe) || '未配置'}`)
  add('preStop 存在（先摘流量再优雅退出）', Boolean(container.lifecycle?.preStop),
    container.lifecycle?.preStop ? '已配置' : '未配置')

  const probes = [container.startupProbe, container.readinessProbe, container.livenessProbe].filter(Boolean)
  add('探针端口与容器端口一致',
    probes.length > 0 && probes.every((p) => ports.includes(port(p))),
    probes.length ? `探针端口 ${probes.map(port).join('/')}，容器端口 ${ports.join('/') || '未声明'}` : '无探针')

  return {
    namespace: deploy?.metadata?.namespace ?? '',
    deployment,
    checks,
    failed: checks.filter((c) => !c.ok).length,
  }
}
