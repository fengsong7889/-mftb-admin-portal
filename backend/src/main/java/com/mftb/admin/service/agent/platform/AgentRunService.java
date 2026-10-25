package com.mftb.admin.service.agent.platform;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * WP06：持久化运行（Run/Step）。
 *
 * <p>当前为仓库内 JDBC 实现，提供「受理即持久化 + 幂等键 + 取消语义 + 步骤检查点 + 终态查询」，
 * 让浏览器关闭/进程重启后仍能查到这次任务与已完成步骤；真正的跨实例恢复与定时触发需要
 * Temporal（WP06 部署项），在它落地前本服务不声称具备宕机恢复或集群调度能力。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentRunService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public Map<String, Object> create(String requester, String systemCode, String appKey, Integer appVersion,
                                      Long conversationPk, Map<String, Object> input, String idempotencyKey) {
        if (!StringUtils.hasText(requester)) throw new BusinessException(401, "登入身分不可用");
        String key = StringUtils.hasText(idempotencyKey) ? idempotencyKey : "auto-" + UUID.randomUUID();
        if (key.length() > 96) throw new BusinessException("冪等鍵過長");
        List<Map<String, Object>> existing = jdbc.queryForList(
                "SELECT run_no FROM ai_run WHERE idempotency_key=?", key);
        if (!existing.isEmpty()) return get(String.valueOf(existing.get(0).get("run_no")), requester);
        String runNo = "RUN" + java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
                .format(java.time.LocalDateTime.now()) + UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String inputJson;
        try {
            inputJson = mapper.writeValueAsString(input == null ? Map.of() : input);
        } catch (Exception e) {
            throw new BusinessException("運行輸入無法序列化");
        }
        jdbc.update("INSERT INTO ai_run(run_no, app_key, app_version, requester, system_code, conversation_pk, "
                        + "status, idempotency_key, input_json) VALUES(?,?,?,?,?,?,'queued',?,?)",
                runNo, appKey, appVersion, requester,
                StringUtils.hasText(systemCode) ? systemCode : "common", conversationPk, key, inputJson);
        return get(runNo, requester);
    }

    /** 取运行与步骤；只能看自己的运行（审计视角另由管理端授权）。 */
    public Map<String, Object> get(String runNo, String requester) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, run_no, app_key, app_version, requester, system_code, conversation_pk, status, "
                        + "error_kind, cancel_requested, started_at, finished_at, created_at, updated_at "
                        + "FROM ai_run WHERE run_no=?", runNo);
        if (rows.isEmpty()) throw new BusinessException(404, "運行不存在");
        Map<String, Object> row = rows.get(0);
        if (requester != null && !requester.equals(row.get("requester"))) {
            throw new BusinessException(403, "只能查看本人的運行");
        }
        Map<String, Object> out = new LinkedHashMap<>(row);
        out.put("steps", jdbc.queryForList("SELECT step_no, step_type, status, tool_key, proposal_id, detail, "
                + "elapsed_ms, created_at, updated_at FROM ai_run_step WHERE run_id=? ORDER BY step_no",
                ((Number) row.get("id")).longValue()));
        return out;
    }

    public List<Map<String, Object>> list(String requester, String status) {
        StringBuilder sql = new StringBuilder("SELECT run_no, app_key, requester, system_code, status, error_kind, "
                + "started_at, finished_at, created_at FROM ai_run WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (StringUtils.hasText(requester)) { sql.append(" AND requester=?"); args.add(requester); }
        if (StringUtils.hasText(status)) { sql.append(" AND status=?"); args.add(status); }
        sql.append(" ORDER BY id DESC LIMIT 200");
        return jdbc.queryForList(sql.toString(), args.toArray());
    }

    /**
     * 取消：只保证「尚未开始的步骤不再启动」；已发送的外部动作不能假装撤回。
     * 排队中直接终态取消，执行中只置标记由执行器在步骤边界检查。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> cancel(String runNo, String requester) {
        Map<String, Object> row = get(runNo, requester);
        String status = String.valueOf(row.get("status"));
        if (List.of("succeeded", "failed", "cancelled", "unknown").contains(status)) {
            throw new BusinessException(409, "運行已結束，不能取消");
        }
        jdbc.update("UPDATE ai_run SET cancel_requested=1, status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END, "
                + "finished_at=CASE WHEN status='queued' THEN NOW() ELSE finished_at END WHERE run_no=?", runNo);
        return get(runNo, requester);
    }

    public boolean cancelRequested(long runId) {
        Integer flag = jdbc.queryForObject("SELECT cancel_requested FROM ai_run WHERE id=?", Integer.class, runId);
        return Integer.valueOf(1).equals(flag);
    }

    /**
     * 领取排队中的运行并登记租约。只领取 {@code queued}，不抢 {@code running}：
     * 崩溃的运行由租约过期扫描转 {@code unknown}，交人工决定是否重跑，避免重复副作用。
     */
    @Transactional(rollbackFor = Exception.class)
    public Long claimNext(String owner, int leaseSeconds) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id FROM ai_run WHERE status='queued' AND cancel_requested=0 ORDER BY id LIMIT 1");
        if (rows.isEmpty()) return null;
        long id = ((Number) rows.get(0).get("id")).longValue();
        int updated = jdbc.update("UPDATE ai_run SET status='running', lease_owner=?, "
                        + "lease_expires_at=DATE_ADD(NOW(), INTERVAL ? SECOND), attempt=attempt+1, "
                        + "started_at=COALESCE(started_at, NOW()) "
                        + "WHERE id=? AND status='queued' AND cancel_requested=0",
                owner, Math.max(60, leaseSeconds), id);
        return updated == 0 ? null : id;
    }

    /** 长任务续租；租约被他人接管或运行已结束时不续（返回 false）。 */
    @Transactional(rollbackFor = Exception.class)
    public boolean renewLease(long runId, String owner, int leaseSeconds) {
        return jdbc.update("UPDATE ai_run SET lease_expires_at=DATE_ADD(NOW(), INTERVAL ? SECOND) "
                        + "WHERE id=? AND status='running' AND lease_owner=?",
                Math.max(60, leaseSeconds), runId, owner) > 0;
    }

    /** 释放租约（终态后调用），避免看板上出现“仍在执行”的假象。 */
    @Transactional(rollbackFor = Exception.class)
    public void releaseLease(long runId) {
        jdbc.update("UPDATE ai_run SET lease_owner=NULL, lease_expires_at=NULL WHERE id=?", runId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void markRunning(long runId) {
        jdbc.update("UPDATE ai_run SET status='running', started_at=COALESCE(started_at, NOW()) WHERE id=? AND status='queued'", runId);
    }

    @Transactional(rollbackFor = Exception.class)
    public long addStep(long runId, int stepNo, String type, String toolKey, Long proposalId, String detail) {
        jdbc.update("INSERT INTO ai_run_step(run_id, step_no, step_type, status, tool_key, proposal_id, detail) "
                + "VALUES(?,?,?,'running',?,?,?) ON DUPLICATE KEY UPDATE status='running'",
                runId, stepNo, type, toolKey, proposalId, truncate(detail, 512));
        return ((Number) jdbc.queryForObject("SELECT id FROM ai_run_step WHERE run_id=? AND step_no=?",
                Long.class, runId, stepNo)).longValue();
    }

    @Transactional(rollbackFor = Exception.class)
    public void finishStep(long stepId, boolean ok, String detail, long elapsedMs) {
        jdbc.update("UPDATE ai_run_step SET status=?, detail=?, elapsed_ms=? WHERE id=?",
                ok ? "succeeded" : "failed", truncate(detail, 512), elapsedMs, stepId);
    }

    @Transactional(rollbackFor = Exception.class)
    public void finish(long runId, String status, String errorKind, String resultJson) {
        if (!List.of("succeeded", "failed", "cancelled", "unknown", "waiting_approval").contains(status)) {
            throw new BusinessException("不支持的運行狀態");
        }
        jdbc.update("UPDATE ai_run SET status=?, error_kind=?, result_json=?, finished_at=NOW() WHERE id=?",
                status, truncate(errorKind, 64), truncate(resultJson, 60_000), runId);
    }

    /** 启动时把上一进程遗留的 running 标记为 unknown：结果需人工核实，不能自动重跑。 */
    @Transactional(rollbackFor = Exception.class)
    public int markInterruptedRunsUnknown() {
        int affected = jdbc.update("UPDATE ai_run SET status='unknown', error_kind='worker_restarted', finished_at=NOW() "
                + "WHERE status IN ('running','waiting_approval')");
        if (affected > 0) log.warn("[AgentRun] 上次进程遗留 {} 条运行标记为 unknown，需人工对账", affected);
        return affected;
    }

    /**
     * 崩溃/卡死回收：租约过期超过宽限期仍未续租的运行转 {@code unknown}。
     * 不自动重跑：外部副作用可能已发生，必须人工核实后再决定。
     */
    @Transactional(rollbackFor = Exception.class)
    public int markStaleRunningUnknown(int graceMinutes) {
        int affected = jdbc.update("UPDATE ai_run SET status='unknown', error_kind='lease_expired', finished_at=NOW(), "
                + "lease_owner=NULL, lease_expires_at=NULL "
                + "WHERE status='running' AND lease_expires_at IS NOT NULL "
                + "AND lease_expires_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)",
                Math.max(1, graceMinutes));
        if (affected > 0) log.warn("[AgentRun] {} 条运行租约过期，已标记 unknown 等待人工核实", affected);
        return affected;
    }

    private static String truncate(String s, int max) { return s == null || s.length() <= max ? s : s.substring(0, max); }

    /** 启动扫描失败不阻断启动，但必须留日志，不能静默。 */
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void markInterruptedOnStartup() {
        try {
            markInterruptedRunsUnknown();
        } catch (RuntimeException e) {
            log.warn("[AgentRun] 启动扫描未完成 type={}", e.getClass().getSimpleName());
        }
    }
}
