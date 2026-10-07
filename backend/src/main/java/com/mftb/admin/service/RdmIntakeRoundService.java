package com.mftb.admin.service;

import com.mftb.admin.dto.RdmIntakeVO;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * 需求准入审批轮次（rdm_intake_round）。
 * <p>为什么要独立轮次记录：以前需求只存一个 {@code intake_flow_no}，重提时旧单号还挂在需求上，
 * 于是「RDM 显示待审批、OA 里却没有本轮待办」，而旧单迟到的回调又能把已经重提的新轮次直接推走。
 * 一轮一条记录后，回调必须先证明「这张单就是当前 pending 的那一轮」才允许改状态。
 * <p>免审轮次同样落库（{@code flow_no} 为空）：免审是一种需要被审计的裁决，不是「什么都没发生」。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmIntakeRoundService {

    public static final String DECISION_PENDING = "pending";
    public static final String DECISION_APPROVED = "approved";
    public static final String DECISION_REJECTED = "rejected";
    public static final String DECISION_WITHDRAWN = "withdrawn";
    public static final String DECISION_EXEMPT = "exempt";

    private final JdbcTemplate jdbcTemplate;

    /** 一轮提交的只读视图 */
    @Data
    public static class Round {
        private Long id;
        private Long reqId;
        private int roundNo;
        private String flowNo;
        private String decision;
        private Long policyId;
        private String policyName;
        private String policyVersion;
        private String policyMode;
        private boolean needApproval;
    }

    /**
     * 开启新一轮提交，返回本轮轮次号。
     * <p>并发下同一需求理论上可能同时开两轮，但提交动作本身由需求状态机（草稿/驳回 → 待审批）
     * 串行化，且 (req_id, round_no) 有唯一键兜底，重复轮次会直接写入失败而不是静默双份。
     */
    public int startRound(Long reqId, RdmIntakeVO.Decision decision, Long deptId, String deptName,
                          Long submitterUserId, String submitterName, String flowNo,
                          String contentSnapshot, String operator) {
        int next = nextRoundNo(reqId);
        boolean needApproval = decision == null || decision.isNeedApproval();
        jdbcTemplate.update(
                "INSERT INTO rdm_intake_round (req_id, round_no, flow_no, decision, need_approval, policy_id, "
                        + "policy_name, policy_version, policy_mode, match_explain, submit_dept_id, submit_dept_name, "
                        + "submitter_user_id, submitter_name, content_snapshot, submit_time, created_by, updated_by, deleted) "
                        + "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,now(),?,?,0)",
                reqId, next, emptyToNull(flowNo),
                needApproval ? DECISION_PENDING : (decision != null && decision.isAbnormal() ? DECISION_PENDING : DECISION_EXEMPT),
                needApproval ? 1 : 0,
                decision == null ? null : decision.getPolicyId(),
                decision == null ? null : decision.getPolicyName(),
                decision == null ? null : decision.getPolicyVersion(),
                decision == null ? null : decision.getMode(),
                decision == null || decision.getExplain() == null ? null : String.join("\n", decision.getExplain()),
                deptId, deptName, submitterUserId, submitterName, contentSnapshot, operator, operator);
        log.info("准入輪次已開始: reqId={}, roundNo={}, flowNo={}, needApproval={}, policy={} {}",
                reqId, next, flowNo, needApproval,
                decision == null ? "默認" : decision.getPolicyName(),
                decision == null ? "" : "(version " + decision.getPolicyVersion() + ")");
        return next;
    }

    /** 按准入单号取轮次（回调入口用它证明「这张单确实是某轮」） */
    public Round findByFlow(String flowNo) {
        if (!StringUtils.hasText(flowNo)) {
            return null;
        }
        return first(jdbcTemplate.queryForList(
                "SELECT id, req_id, round_no, flow_no, decision, policy_id, policy_name, policy_version, policy_mode, "
                        + "need_approval FROM rdm_intake_round WHERE flow_no = ? AND deleted = 0", flowNo));
    }

    /** 需求当前（最大）轮次 */
    public Round current(Long reqId) {
        if (reqId == null) {
            return null;
        }
        return first(jdbcTemplate.queryForList(
                "SELECT id, req_id, round_no, flow_no, decision, policy_id, policy_name, policy_version, policy_mode, "
                        + "need_approval FROM rdm_intake_round WHERE req_id = ? AND deleted = 0 "
                        + "ORDER BY round_no DESC LIMIT 1", reqId));
    }

    /**
     * 审结落章：只有仍处于 pending 的轮次可被本次回调终结。
     * <p>返回 false 表示「这张单的轮次已经不是待审状态」——重复回调或旧轮迟到回调，
     * 调用方必须放弃推进需求，不能因为 OA 回了 approved 就改需求状态。
     */
    public boolean markDecided(String flowNo, String decision, String operator) {
        if (!StringUtils.hasText(flowNo) || !StringUtils.hasText(decision)) {
            return false;
        }
        int updated = jdbcTemplate.update(
                "UPDATE rdm_intake_round SET decision = ?, decide_time = now(), updated_by = ? "
                        + "WHERE flow_no = ? AND deleted = 0 AND decision = ?",
                decision, operator, flowNo, DECISION_PENDING);
        if (updated == 0) {
            log.info("准入輪次未變動（重複或舊輪回調）: flowNo={}, decision={}", flowNo, decision);
            return false;
        }
        log.info("准入輪次已審結: flowNo={}, decision={}", flowNo, decision);
        return true;
    }

    /**
     * 撤回本轮（提出人撤回或重提前收口旧轮）。
     * <p>只把 pending 置为 withdrawn：已审结的轮次是历史事实，不能被后来的一次撤回抹掉。
     */
    public boolean withdrawRound(Long reqId, String flowNo, String operator) {
        if (reqId == null) {
            return false;
        }
        int updated = StringUtils.hasText(flowNo)
                ? jdbcTemplate.update(
                "UPDATE rdm_intake_round SET decision = ?, decide_time = now(), updated_by = ? "
                        + "WHERE req_id = ? AND flow_no = ? AND deleted = 0 AND decision = ?",
                DECISION_WITHDRAWN, operator, reqId, flowNo, DECISION_PENDING)
                : jdbcTemplate.update(
                "UPDATE rdm_intake_round SET decision = ?, decide_time = now(), updated_by = ? "
                        + "WHERE req_id = ? AND deleted = 0 AND decision = ? "
                        + "ORDER BY round_no DESC LIMIT 1",
                DECISION_WITHDRAWN, operator, reqId, DECISION_PENDING);
        return updated > 0;
    }

    /** 该轮是否仍是当前待审轮次（旧轮迟到回调必须被认出来） */
    public boolean isCurrentPending(String flowNo) {
        Round round = findByFlow(flowNo);
        if (round == null || !DECISION_PENDING.equals(round.getDecision())) {
            return false;
        }
        Round latest = current(round.getReqId());
        return latest != null && Objects.equals(latest.getRoundNo(), round.getRoundNo());
    }

    /** 历史轮次数（用于「第 N 轮重提」提示与统计） */
    public int roundCount(Long reqId) {
        if (reqId == null) {
            return 0;
        }
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM rdm_intake_round WHERE req_id = ? AND deleted = 0", Integer.class, reqId);
        return count == null ? 0 : count;
    }

    private int nextRoundNo(Long reqId) {
        Integer max = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(round_no), 0) FROM rdm_intake_round WHERE req_id = ? AND deleted = 0",
                Integer.class, reqId);
        return (max == null ? 0 : max) + 1;
    }

    private static Round first(List<Map<String, Object>> rows) {
        if (rows == null || rows.isEmpty()) {
            return null;
        }
        Map<String, Object> row = rows.get(0);
        Round r = new Round();
        r.setId(asLong(row.get("id")));
        r.setReqId(asLong(row.get("req_id")));
        r.setRoundNo(asInt(row.get("round_no")));
        r.setFlowNo((String) row.get("flow_no"));
        r.setDecision((String) row.get("decision"));
        r.setPolicyId(asLong(row.get("policy_id")));
        r.setPolicyName((String) row.get("policy_name"));
        r.setPolicyVersion((String) row.get("policy_version"));
        r.setPolicyMode((String) row.get("policy_mode"));
        r.setNeedApproval(asInt(row.get("need_approval")) == 1);
        return r;
    }

    private static String emptyToNull(String value) {
        return StringUtils.hasText(value) ? value : null;
    }

    private static Long asLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private static int asInt(Object value) {
        return value == null ? 0 : ((Number) value).intValue();
    }

    /** 时间格式化留给调用方（本服务只做数据闸门，不拼文案） */
    public static String formatSubmitTime(LocalDateTime time) {
        return time == null ? "" : time.toString();
    }
}
