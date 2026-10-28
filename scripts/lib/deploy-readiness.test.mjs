// @vitest-environment node
/**
 * 就绪配置判定单测：锁定「探针/优雅退出缺失必须失败」，避免门禁只在真实集群上才有意义。
 */
import { describe, expect, it } from 'vitest'
import { evaluateDeployment } from './deploy-readiness.mjs'

function deployFixture(overrides = {}) {
  return {
    metadata: { name: 'mftb-admin-backend', namespace: 'ns-test' },
    spec: {
      template: {
        spec: {
          terminationGracePeriodSeconds: overrides.grace ?? 40,
          containers: [{
            name: 'mftb-admin-backend',
            ports: [{ containerPort: 8080 }],
            startupProbe: overrides.noStartup ? undefined : { httpGet: { path: '/api/health/live', port: 8080 } },
            readinessProbe: overrides.noReady ? undefined : { httpGet: { path: '/api/health/ready', port: 8080 } },
            livenessProbe: overrides.badLive
              ? { httpGet: { path: '/api/health', port: 8080 } }
              : { httpGet: { path: '/api/health/live', port: 8080 } },
            lifecycle: overrides.noPreStop ? undefined : { preStop: { exec: { command: ['sh', '-c', 'sleep 5'] } } },
          }],
        },
      },
    },
  }
}

describe('deploy-readiness', () => {
  it('探针齐全 + 宽限期 + preStop → 全部通过', () => {
    const r = evaluateDeployment(deployFixture())
    expect(r.namespace).toBe('ns-test')
    expect(r.failed).toBe(0)
    expect(r.checks).toHaveLength(6)
  })

  it('缺少 readinessProbe → 失败（未就绪实例会接流量）', () => {
    const r = evaluateDeployment(deployFixture({ noReady: true }))
    expect(r.failed).toBeGreaterThan(0)
    expect(r.checks.find((c) => c.name.includes('readinessProbe'))?.ok).toBe(false)
  })

  it('宽限期不足 40s → 失败（小于 shutdown timeout 30s 留不出余量）', () => {
    const r = evaluateDeployment(deployFixture({ grace: 30 }))
    expect(r.checks.find((c) => c.name.includes('terminationGracePeriodSeconds'))?.ok).toBe(false)
  })

  it('liveness 指到依赖数据库的聚合端点 → 失败', () => {
    const r = evaluateDeployment(deployFixture({ badLive: true }))
    expect(r.checks.find((c) => c.name.includes('livenessProbe'))?.ok).toBe(false)
  })

  it('找不到同名容器 → 直接失败而不是报通过', () => {
    const r = evaluateDeployment(deployFixture(), { containerName: 'missing' })
    expect(r.failed).toBe(1)
    expect(r.checks[0].ok).toBe(false)
  })
})
