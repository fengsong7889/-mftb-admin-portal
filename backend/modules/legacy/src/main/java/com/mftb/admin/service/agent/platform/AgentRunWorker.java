package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.agent.AgentOrchestrationService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.List;
import java.util.Map;

/**
 * WP06（仓库内过渡执行器）：领取 {@code ai_run} 队列并调用编排服务执行。
 *
 * <p>为什么需要它：只有运行账本没有执行器时，“受理即持久化”仍然要靠浏览器重放。
 * 本执行器用 CAS 领取（{@code status='queued' → 'running'}）保证同一运行只被一个实例处理，
 * 在步骤边界检查取消标记，异常/超时进入终态，不假装具备 Temporal 的跨实例恢复与定时语义。
 *
 * <p>开关：{@code ai.run.worker-enabled}（默认 false），需要后台执行时设 {@code AI_RUN_WORKER_ENABLED=true}。
 * Temporal 上线后本执行器退役，本类不得再承担审批等待或定时触发。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentRunWorker {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final AgentRunService runs;
    private final AgentOrchestrationService orchestration;
    private final SysUserMapper sysUserMapper;
    /** 租约时长：需大于单次运行最坏耗时（多轮模型调用 + 工具）。 */
    private static final int LEASE_SECONDS = 1800;
    /** 租约过期后的宽限：过期未续租才判崩溃，避免抢占正在执行的运行。 */
    private static final int LEASE_GRACE_MINUTES = 5;
    private static final String OWNER = ownerId();
    /** 与 application.yml 的 ai.run.worker-enabled 对齐；默认关闭，只保留账本与取消语义。 */
    @org.springframework.beans.factory.annotation.Value("${ai.run.worker-enabled:false}")
    private boolean enabled;

    /**
     * 轮询队列。批量上限 5，避免一次领取把线程池占满；单条失败不影响后续。
     * 初始延迟大于全局调度初始延迟（120s），确保迁移与会话表就绪。
     */
    @Scheduled(fixedDelayString = "${ai.run.worker-delay-ms:30000}",
            initialDelayString = "${ai.run.worker-initial-delay-ms:150000}")
    public void poll() {
        if (!enabled) return;
        try {
            runs.markInterruptedRunsUnknown();
        } catch (RuntimeException e) {
            log.warn("[AgentRunWorker] 启动扫描失败 type={}", e.getClass().getSimpleName());
        }
        try {
            // 租约过期才判崩溃：可能已产生副作用，只转 unknown 等人工核实，绝不自动重跑。
            runs.markStaleRunningUnknown(LEASE_GRACE_MINUTES);
        } catch (RuntimeException e) {
            log.warn("[AgentRunWorker] 租约扫描失败 type={}", e.getClass().getSimpleName());
        }
        if (!platformReady()) return;
        for (int i = 0; i < 5; i++) {
            Long runId = claimNext();
            if (runId == null) return;
            try {
                execute(runId);
            } catch (RuntimeException e) {
                log.warn("[AgentRunWorker] 运行执行异常 id={} type={}", runId, e.getClass().getSimpleName());
                safeFinish(runId, "failed", "worker_error");
            }
        }
    }

    private Long claimNext() {
        return runs.claimNext(OWNER, LEASE_SECONDS);
    }

    /**
     * 就绪门：没有数据分级或没有已批准端点时，后台执行只会产生失败运行。
     * 直接不领取，日志提示一次，避免刷屏。
     */
    private boolean platformReady() {
        try {
            Integer classes = jdbc.queryForObject("SELECT COUNT(*) FROM ai_data_class_policy", Integer.class);
            Integer endpoints = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM ai_endpoint_approval WHERE status=1", Integer.class);
            boolean ready = classes != null && classes > 0 && endpoints != null && endpoints > 0;
            if (!ready) log.debug("[AgentRunWorker] 平台未就绪（分级 {} / 端点 {}），暂不领取任务", classes, endpoints);
            return ready;
        } catch (RuntimeException e) {
            log.warn("[AgentRunWorker] 就绪检查失败 type={}", e.getClass().getSimpleName());
            return false;
        }
    }

    private static String ownerId() {
        String host;
        try {
            host = java.net.InetAddress.getLocalHost().getHostName();
        } catch (Exception e) {
            host = "host";
        }
        return (host + "-" + java.util.UUID.randomUUID().toString().substring(0, 8));
    }

    private void execute(long runId) {
        Map<String, Object> run = jdbc.queryForMap("SELECT * FROM ai_run WHERE id=?", runId);
        String requester = String.valueOf(run.get("requester"));
        SysUser operator = sysUserMapper.selectOne(new LambdaQueryWrapper<SysUser>()
                .eq(SysUser::getUsername, requester).last("LIMIT 1"));
        if (operator == null || !Integer.valueOf(1).equals(operator.getStatus())) {
            safeFinish(runId, "failed", "requester_unavailable");
            safeReleaseLease(runId);
            return;
        }
        // 后台线程没有 SecurityContext，而编排层按「当前操作人」校验会话归属与准入，
        // 不注入就只能抛 401 被折叠成 execution_blocked（实测）。执行期间借用发起人身份，
        // finally 必须清理，否则线程池复用会把身份串到下一个任务。
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(requester, null, java.util.List.of());
        auth.setDetails(operator);
        SecurityContextHolder.getContext().setAuthentication(auth);
        try {
            if (runs.cancelRequested(runId)) {
                safeFinish(runId, "cancelled", "cancel_requested");
                return;
            }
            String systemCode = String.valueOf(run.getOrDefault("system_code", "common"));
            String appKey = run.get("app_key") == null ? null : String.valueOf(run.get("app_key"));
            Map<String, Object> input = parse(String.valueOf(run.get("input_json")));
            Object messages = input.get("messages");
            if (!(messages instanceof List<?> list) || list.isEmpty()) {
                safeFinish(runId, "failed", "missing_messages");
                return;
            }
            long stepId = runs.addStep(runId, 1, "MODEL", null, null, "orchestrate");
            long started = System.currentTimeMillis();
            try {
                AgentOrchestrationService.OrchestrateRequest req = new AgentOrchestrationService.OrchestrateRequest();
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> msgs = (List<Map<String, Object>>) list;
                req.setMessages(msgs);
                req.setConversationPk(longOrNull(run.get("conversation_pk")));
                req.setSystemCode(systemCode);
                req.setApplicationKey(appKey);
                Integer appVersion = run.get("app_version") == null ? null : ((Number) run.get("app_version")).intValue();
                if (appVersion != null) req.setApplicationVersion(appVersion);
                AgentOrchestrationService.OrchestrateResult result = orchestration.orchestrate(req, requester);
                boolean ok = result.getErrorKind() == null;
                runs.finishStep(stepId, ok, ok ? "ok" : result.getErrorKind(), System.currentTimeMillis() - started);
                runs.finish(runId, ok ? "succeeded" : "failed", result.getErrorKind(),
                        result.getText() == null ? null : truncate(result.getText(), 4000));
            } catch (RuntimeException e) {
                runs.finishStep(stepId, false, e.getClass().getSimpleName(), System.currentTimeMillis() - started);
                throw e;
            }
        } finally {
            SecurityContextHolder.clearContext();
            safeReleaseLease(runId);
        }
    }

    private void safeReleaseLease(long runId) {
        try {
            runs.releaseLease(runId);
        } catch (RuntimeException e) {
            log.warn("[AgentRunWorker] 释放租约失败 id={} type={}", runId, e.getClass().getSimpleName());
        }
    }

    private void safeFinish(long runId, String status, String errorKind) {
        try {
            runs.finish(runId, status, errorKind, null);
        } catch (RuntimeException e) {
            log.warn("[AgentRunWorker] 终态写入失败 id={} type={}", runId, e.getClass().getSimpleName());
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> parse(String json) {
        if (!StringUtils.hasText(json)) return Map.of();
        try {
            return mapper.readValue(json, Map.class);
        } catch (Exception e) {
            throw new BusinessException("運行輸入已損壞，無法恢復");
        }
    }

    private static Long longOrNull(Object v) {
        if (v instanceof Number n) return n.longValue();
        return null;
    }

    private static String truncate(String s, int max) { return s.length() <= max ? s : s.substring(0, max); }
}
