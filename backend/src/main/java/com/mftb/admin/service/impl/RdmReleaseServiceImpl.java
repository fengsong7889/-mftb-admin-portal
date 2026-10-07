package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseDTO;
import com.mftb.admin.dto.RdmReleaseVO;
import com.mftb.admin.entity.RdmRelease;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmReleaseMapper;
import com.mftb.admin.service.RdmAccessGuard;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.service.RdmReleaseService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 发布放行实现（阶段 4）。
 *
 * <p>三条不可让的口径：
 * <ol>
 *   <li>检查项由服务端算，前端传什么都不认；豁免可以，但必须留理由并留在快照里。</li>
 *   <li>放行人不能是发起人本人（除系统管理员）——否则"闸门"退化成自己给自己盖章。</li>
 *   <li>放行单有有效期且在返工后作废，避免一次放行永久有效、或返工后拿旧结论直接上线。</li>
 * </ol>
 *
 * <p>旧流程（flow_version=1）的需求在五节点计划、PRD 定稿快照、工时明细这三项上跳过，
 * 因为这些结构在它建立之后才存在；把它们算成"质量不合格"既假又会让所有历史需求无法上线。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmReleaseServiceImpl implements RdmReleaseService {

    /** 放行单号规则 key（必须与 sys_biz_seq_rule.rule_key 一致，用大写会报「規則未配置」） */
    private static final String SEQ_RELEASE = "rdm_release";

    /** 检查项：PRD 已定稿并冻结快照 */
    private static final String CHECK_PRD = "PRD_APPROVED";
    /** 检查项：五节点基线已冻结 */
    private static final String CHECK_BASELINE = "BASELINE_FROZEN";
    /** 检查项：任务全部交付且无阻塞 */
    private static final String CHECK_TASKS = "TASKS_DONE";
    /** 检查项：已完成任务的工时已填报 */
    private static final String CHECK_WORKLOG = "WORKLOG_REPORTED";
    /** 检查项：测试阶段已完成 */
    private static final String CHECK_TEST = "TEST_PASSED";
    /** 检查项：上线前预验收已通过且无阻断缺陷 */
    private static final String CHECK_PRE_ACCEPT = "PRE_ACCEPTANCE";
    /** 检查项：无未关闭的需求变更单 */
    private static final String CHECK_CHANGE = "NO_OPEN_CHANGE";
    /** 检查项：关键节点未逾期（仅提示，不阻断） */
    private static final String CHECK_SCHEDULE = "SCHEDULE_HEALTH";

    /** 走完测试及之后的状态（可用于放行判定） */
    private static final Set<String> AFTER_TEST_STATUS = Set.of(
            RdmConstants.STATUS_TESTING, RdmConstants.STATUS_TEST_PASSED,
            RdmConstants.STATUS_UAT_PENDING, RdmConstants.STATUS_UAT_REJECTED,
            RdmConstants.STATUS_RELEASED, RdmConstants.STATUS_VERIFIED, RdmConstants.STATUS_CLOSED);

    private final RdmReleaseMapper releaseMapper;
    private final RdmAccessGuard accessGuard;
    private final OperatorResolver operatorResolver;
    private final BizSeqService bizSeqService;
    private final RdmNotifyService notifyService;
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    /** 状态中文名：检查项 reason 不能把 uat_pending 这种枚举直给用户 */
    private final com.mftb.admin.service.RdmConfigService configService;

    @Override
    public RdmReleaseVO.Gate preview(Long reqId) {
        RdmRequirement req = accessGuard.requireVisible(reqId, "查看發布放行");
        RdmReleaseVO.Gate gate = new RdmReleaseVO.Gate();
        gate.setReqId(reqId);
        gate.setChecks(computeChecks(req, List.of()));
        gate.setBlockingCount(countBlocking(gate.getChecks()));
        gate.setReleasable(gate.getBlockingCount() == 0);
        return gate;
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmReleaseVO.Gate apply(Long reqId, RdmReleaseDTO.Apply dto) {
        RdmRequirement req = accessGuard.requireDeliveryWriter(reqId, "發起發布放行");
        if (!AFTER_TEST_STATUS.contains(req.getStatus())) {
            throw new BusinessException("僅「測試開始」之後的階段可發起放行 ，當前狀態：" + statusName(req.getStatus()));
        }
        if (RdmConstants.STATUS_RELEASED.equals(req.getStatus())
                || RdmConstants.STATUS_VERIFIED.equals(req.getStatus())
                || RdmConstants.STATUS_CLOSED.equals(req.getStatus())) {
            throw new BusinessException("需求已上線，無需再發起放行");
        }
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (releaseMapper.selectCount(new LambdaQueryWrapper<RdmRelease>()
                .eq(RdmRelease::getReqId, reqId)
                .eq(RdmRelease::getStatus, RdmRelease.STATUS_PENDING)) > 0) {
            throw new BusinessException("已有待裁決的放行單，請先處理（放行或駁回）再重新發起");
        }

        List<RdmReleaseVO.Check> checks = computeChecks(req,
                dto == null || dto.getWaivedCodes() == null ? List.of() : dto.getWaivedCodes());
        if (checks.stream().anyMatch(c -> Boolean.TRUE.equals(c.getWaived()))
                && (dto == null || !StringUtils.hasText(dto.getWaiveReason()))) {
            throw new BusinessException("豁免檢查項必須填寫豁免理由，它會留在放行快照裡");
        }
        int blocking = countBlocking(checks);
        if (blocking > 0) {
            throw new BusinessException("還有 " + blocking + " 項阻斷檢查未通過，請先處理或按提示豁免後再發起");
        }

        RdmRelease release = new RdmRelease();
        release.setReleaseNo(bizSeqService.next(SEQ_RELEASE));
        release.setReqId(reqId);
        release.setRoundNo(nextRound(reqId));
        release.setEnv(normalizeEnv(dto == null ? null : dto.getEnv()));
        release.setVersionNo(dto == null ? null : trimToNull(dto.getVersionNo()));
        release.setPlanTime(parseTime(dto == null ? null : dto.getPlanTime()));
        release.setStatus(RdmRelease.STATUS_PENDING);
        release.setChecksJson(writeChecks(checks));
        release.setBlockingCount(0);
        release.setSummary(dto == null ? null : trimToNull(dto.getWaiveReason()));
        release.setApplicantUserId(current.getId());
        release.setApplicantEmpNo(current.getEmpId());
        release.setApplicantName(current.getName());
        release.setApplyTime(LocalDateTime.now());
        release.setCreatedBy(operatorResolver.operatorSignature(current));
        release.setUpdatedBy(release.getCreatedBy());
        releaseMapper.insert(release);

        notifyGate(release, req, "發布放行待裁決",
                "### 🚦 發布放行待裁決\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                        + "\n- **放行單**: " + release.getReleaseNo() + "（第 " + release.getRoundNo() + " 次）"
                        + "\n- **環境**: " + release.getEnv()
                        + "\n- **發起人**: " + current.getName()
                        + "\n\n檢查項已全部通過，請在「需求詳情 · 發布放行」裁決。");
        return toVO(reload(release.getId()));
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public RdmReleaseVO.Gate decide(Long id, RdmReleaseDTO.Decide dto) {
        RdmRelease release = requireRelease(id);
        RdmRequirement req = accessGuard.requireDeliveryWriter(release.getReqId(), "裁決發布放行");
        SysUser current = operatorResolver.currentUser();
        if (current == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (!RdmRelease.STATUS_PENDING.equals(release.getStatus())) {
            throw new BusinessException("該放行單已處理（" + statusLabel(release.getStatus()) + "），不可重複裁決");
        }
        boolean passed = Boolean.TRUE.equals(dto == null ? null : dto.getPassed());
        if (!passed && (dto == null || !StringUtils.hasText(dto.getSummary()))) {
            throw new BusinessException("駁回放行必須填寫原因");
        }
        // 四眼原则：放行人不能是发起人；系统管理员保留例外只是为了运维应急，因此界面文案要写明这个例外
        if (passed && !operatorResolver.isAdmin(current)
                && current.getId().equals(release.getApplicantUserId())) {
            throw new BusinessException("發起人不可自行放行，請由其他有權限的人裁決");
        }
        // 放行前重算一次：从发起到裁决之间可能有人又改了任务或提了变更
        if (passed) {
            List<RdmReleaseVO.Check> latest = readChecks(release.getChecksJson());
            int blocking = countBlocking(computeChecks(req, waivedCodesOf(latest)));
            if (blocking > 0) {
                throw new BusinessException("發起放行後出現了 " + blocking + " 項新的阻斷問題，請重新發起放行");
            }
        }

        release.setStatus(passed ? RdmRelease.STATUS_PASSED : RdmRelease.STATUS_REJECTED);
        release.setGateUserId(current.getId());
        release.setGateEmpNo(current.getEmpId());
        release.setGateName(current.getName());
        release.setDecideTime(LocalDateTime.now());
        release.setExpireAt(passed ? LocalDateTime.now().plusDays(RdmConstants.RELEASE_VALID_DAYS) : null);
        if (StringUtils.hasText(dto.getSummary())) {
            release.setSummary(joinSummary(release.getSummary(), dto.getSummary().trim()));
        }
        release.setUpdatedBy(operatorResolver.operatorSignature(current));
        releaseMapper.updateById(release);

        if (!passed) {
            notifyGate(release, req, "發布放行被駁回",
                    "### ⛔ 發布放行被駁回\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                            + "\n- **駁回人**: " + current.getName()
                            + "\n- **原因**: " + (dto.getSummary() == null ? "-" : dto.getSummary())
                            + "\n\n請修復後重新發起放行。");
        } else {
            notifyGate(release, req, "已准許上線",
                    "### ✅ 已准許上線\n\n- **需求**: " + req.getReqNo() + " " + req.getTitle()
                            + "\n- **環境**: " + release.getEnv()
                            + "\n- **放行人**: " + current.getName()
                            + "\n- **有效期至**: " + DateTimeUtils.format(release.getExpireAt())
                            + "\n\n請在有效期內執行「上線交付」，過期需重新過閘。");
        }
        return toVO(reload(release.getId()));
    }

    @Override
    public List<RdmReleaseVO.Gate> list(Long reqId) {
        accessGuard.requireVisible(reqId, "查看發布放行");
        return releaseMapper.selectList(new LambdaQueryWrapper<RdmRelease>()
                        .eq(RdmRelease::getReqId, reqId)
                        .orderByDesc(RdmRelease::getRoundNo).orderByDesc(RdmRelease::getId))
                .stream().map(this::toVO).toList();
    }

    @Override
    public void requireValidPass(Long reqId, String versionNo) {
        List<RdmRelease> passed = releaseMapper.selectList(new LambdaQueryWrapper<RdmRelease>()
                .eq(RdmRelease::getReqId, reqId)
                .eq(RdmRelease::getStatus, RdmRelease.STATUS_PASSED)
                .orderByDesc(RdmRelease::getDecideTime).orderByDesc(RdmRelease::getId));
        if (passed.isEmpty()) {
            throw new BusinessException("上線前必須先通過發布放行：請在「發布放行」發起並由他人裁決後再執行上線");
        }
        LocalDateTime now = LocalDateTime.now();
        RdmRelease valid = passed.stream()
                .filter(r -> r.getExpireAt() == null || r.getExpireAt().isAfter(now))
                .filter(r -> !StringUtils.hasText(versionNo)
                        || !StringUtils.hasText(r.getVersionNo())
                        || r.getVersionNo().equals(versionNo))
                .findFirst()
                .orElse(null);
        if (valid == null) {
            boolean expired = passed.stream().allMatch(r -> r.getExpireAt() != null && r.getExpireAt().isBefore(now));
            throw new BusinessException(expired
                    ? "發布放行已過期（有效期 " + RdmConstants.RELEASE_VALID_DAYS + " 天），請重新過閘"
                    : "發布放行的發布版本與本次上線版本不一致，請按實際發布版本重新發起放行");
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void revokeOpenGates(Long reqId, String reason) {
        List<RdmRelease> open = releaseMapper.selectList(new LambdaQueryWrapper<RdmRelease>()
                .eq(RdmRelease::getReqId, reqId)
                .in(RdmRelease::getStatus, List.of(RdmRelease.STATUS_PENDING, RdmRelease.STATUS_PASSED)));
        if (open.isEmpty()) {
            return;
        }
        String signature = operatorResolver.operatorSignature(operatorResolver.currentUser());
        for (RdmRelease release : open) {
            release.setStatus(RdmRelease.STATUS_REVOKED);
            release.setExpireAt(LocalDateTime.now());
            release.setSummary(joinSummary(release.getSummary(), "作廢：" + (reason == null ? "需求已退回返工" : reason)));
            release.setUpdatedBy(signature);
            releaseMapper.updateById(release);
        }
        log.info("發布放行單已作廢: reqId={}, count={}, reason={}", reqId, open.size(), reason);
    }

    /* ==================== 检查项计算 ==================== */

    /**
     * 计算全部检查项。
     *
     * @param waivedCodes 发起人显式豁免的编码（必须随放行单留理由）
     */
    private List<RdmReleaseVO.Check> computeChecks(RdmRequirement req, List<String> waivedCodes) {
        boolean legacy = req.getFlowVersion() == null || req.getFlowVersion() < 2;
        Set<String> waived = new LinkedHashSet<>(waivedCodes == null ? List.of() : waivedCodes);
        List<RdmReleaseVO.Check> checks = new ArrayList<>();

        boolean prdFrozen = legacy ? false : countSql("SELECT COUNT(*) FROM rdm_prd_snapshot WHERE req_id = ? AND conclusion = 'passed' AND deleted = 0", req.getId()) > 0;
        checks.add(check(CHECK_PRD, "PRD 已評審定稿", true,
                legacy ? null : prdFrozen,
                legacy, legacy ? "舊流程需求（V1）無定稿快照，跳過該項" : (prdFrozen ? null : "尚無評審通過並凍結快照的 PRD：先寫 PRD 並走評審通過")));

        boolean baseline = legacy ? false : countSql("SELECT COUNT(*) FROM rdm_milestone WHERE req_id = ? AND baseline_date IS NOT NULL AND deleted = 0", req.getId()) > 0;
        checks.add(check(CHECK_BASELINE, "五節點基線已凍結", true,
                legacy ? null : baseline,
                legacy, legacy ? "舊流程需求（V1）無節點基線，跳過該項" : (baseline ? null : "五節點基線尚未凍結：先在「節點計劃」排好初步計劃並凍結基線")));

        long unfinished = countSql("SELECT COUNT(*) FROM rdm_work_task WHERE req_id = ? AND status <> 'done' "
                + "AND status <> 'cancelled' AND deleted = 0", req.getId());
        long blocked = countSql("SELECT COUNT(*) FROM rdm_work_task WHERE req_id = ? AND status = 'blocked' AND deleted = 0", req.getId());
        long taskTotal = countSql("SELECT COUNT(*) FROM rdm_work_task WHERE req_id = ? AND status <> 'cancelled' AND deleted = 0", req.getId());
        checks.add(check(CHECK_TASKS, "研發任務全部交付", true, taskTotal > 0 && unfinished == 0,
                false, taskTotal == 0 ? "尚未拆解任務，無法確認交付範圍"
                        : (blocked > 0 ? unfinished + " 個任務未完成（其中 " + blocked + " 個阻塞）"
                        : unfinished == 0 ? "已完成 " + taskTotal + " 個任務" : unfinished + " 個任務未完成")));

        long unreported = countSql("SELECT COUNT(*) FROM rdm_work_task t WHERE t.req_id = ? AND t.status = 'done' "
                + "AND t.deleted = 0 AND NOT EXISTS (SELECT 1 FROM rdm_work_log w WHERE w.task_id = t.id AND w.deleted = 0)", req.getId());
        checks.add(check(CHECK_WORKLOG, "實際工時已填報", true, legacy ? null : unreported == 0,
                legacy, legacy ? "舊流程需求（V1）無工時明細結構，跳過該項"
                        : (unreported == 0 ? "全部已完成任務均已填報工時" : unreported + " 個已完成任務未填報工時")));

        checks.add(check(CHECK_TEST, "測試階段已完成", true,
                AFTER_TEST_STATUS.contains(req.getStatus()) && !RdmConstants.STATUS_TESTING.equals(req.getStatus()),
                false, statusName(req.getStatus())));

        long prePass = countSql("SELECT COUNT(*) FROM rdm_acceptance WHERE req_id = ? AND stage = 'pre_release' "
                + "AND result IN ('pass','conditional') AND deleted = 0", req.getId());
        long preBlockingDefect = countSql("SELECT COUNT(*) FROM rdm_acceptance WHERE req_id = ? AND stage = 'pre_release' "
                + "AND deleted = 0 AND EXISTS (SELECT 1 FROM rdm_acceptance_case c WHERE c.acceptance_id = rdm_acceptance.id "
                + "AND c.deleted = 0 AND c.result <> 'pass' AND c.severity IN ('critical','major'))", req.getId());
        long preTotal = countSql("SELECT COUNT(*) FROM rdm_acceptance WHERE req_id = ? AND stage = 'pre_release' AND deleted = 0", req.getId());
        checks.add(check(CHECK_PRE_ACCEPT, "上線前預驗收已通過", true, preTotal == 0 ? null : (prePass > 0 && preBlockingDefect == 0),
                false, describePreAccept(preTotal, prePass, preBlockingDefect)));

        long openChange = countSql("SELECT COUNT(*) FROM rdm_change_request WHERE req_id = ? AND approval_status = 'pending' AND deleted = 0", req.getId());
        checks.add(check(CHECK_CHANGE, "無未裁決的需求變更", true, openChange == 0,
                false, openChange == 0 ? null : openChange + " 張變更單待裁決（請在審批中心或需求詳情處理）"));

        long slipped = countSql("SELECT COUNT(*) FROM rdm_milestone WHERE req_id = ? AND deleted = 0 "
                + AND_SLIPPED, req.getId());
        checks.add(check(CHECK_SCHEDULE, "關鍵節點未逾期（僅提示）", false, slipped == 0,
                legacy, legacy ? "舊流程需求（V1）無節點數據，跳過該項"
                        : (slipped == 0 ? null : slipped + " 個節點預計晚於基線")));

        for (RdmReleaseVO.Check c : checks) {
            if (Boolean.FALSE.equals(c.getPassed()) && waived.contains(c.getCode())) {
                c.setWaived(true);
            }
        }
        return checks;
    }

    /** 逾期判定：已完成的用实际日、未完成的用今日，和冻结前的初步计划比 */
    private static final String AND_SLIPPED = "AND baseline_date IS NOT NULL AND ("
            + "(actual_date IS NOT NULL AND actual_date > baseline_date) "
            + "OR (actual_date IS NULL AND status <> 'not_applicable' AND forecast_date IS NOT NULL AND forecast_date < CURDATE()))";

    private static RdmReleaseVO.Check check(String code, String label, boolean blocking,
                                            Boolean passed, boolean skipped, String reason) {
        RdmReleaseVO.Check c = new RdmReleaseVO.Check();
        c.setCode(code);
        c.setLabel(label);
        c.setBlocking(blocking);
        c.setSkipped(skipped && passed == null);
        c.setPassed(skipped && passed == null ? Boolean.TRUE : Boolean.TRUE.equals(passed));
        c.setWaived(false);
        c.setReason(reason);
        return c;
    }

    private static String describePreAccept(long total, long pass, long blockingDefect) {
        if (total == 0) {
            return "尚未做上線前預驗收（先在同頁「業務驗收」錄入上線前結論）";
        }
        if (blockingDefect > 0) {
            return "存在致命/嚴重缺陷未閉環：" + blockingDefect + " 條驗收單";
        }
        return pass > 0 ? "預驗收已通過" : "預驗收結論為不通過";
    }

    /** 阻断项 = 需要阻断 + 未通过 + 未豁免 + 未跳过 */
    private static int countBlocking(List<RdmReleaseVO.Check> checks) {
        return (int) checks.stream()
                .filter(c -> Boolean.TRUE.equals(c.getBlocking()))
                .filter(c -> !Boolean.TRUE.equals(c.getPassed()))
                .filter(c -> !Boolean.TRUE.equals(c.getWaived()))
                .filter(c -> !Boolean.TRUE.equals(c.getSkipped()))
                .count();
    }

    private static List<String> waivedCodesOf(List<RdmReleaseVO.Check> checks) {
        return checks.stream()
                .filter(c -> Boolean.TRUE.equals(c.getWaived()))
                .map(RdmReleaseVO.Check::getCode)
                .toList();
    }

    /* ==================== 持久化与视图辅助 ==================== */

    private RdmRelease reload(Long id) {
        RdmRelease release = releaseMapper.selectById(id);
        if (release == null) {
            throw new BusinessException("放行單不存在");
        }
        return release;
    }

    private RdmRelease requireRelease(Long id) {
        RdmRelease release = releaseMapper.selectById(id);
        if (release == null) {
            throw new BusinessException("放行單不存在");
        }
        return release;
    }

    /** 放行轮次：取现有最大 round_no + 1，作廃的旧轮仍占号，保证「第几次上线」可追溯 */
    private int nextRound(Long reqId) {
        Integer max = jdbcTemplate.queryForObject(
                "SELECT COALESCE(MAX(round_no), 0) FROM rdm_release WHERE req_id = ?", Integer.class, reqId);
        return (max == null ? 0 : max) + 1;
    }

    private RdmReleaseVO.Gate toVO(RdmRelease release) {
        RdmReleaseVO.Gate vo = new RdmReleaseVO.Gate();
        vo.setId(release.getId());
        vo.setReleaseNo(release.getReleaseNo());
        vo.setReqId(release.getReqId());
        vo.setRoundNo(release.getRoundNo());
        vo.setEnv(release.getEnv());
        vo.setVersionNo(release.getVersionNo());
        vo.setPlanTime(DateTimeUtils.format(release.getPlanTime()));
        vo.setStatus(release.getStatus());
        vo.setSummary(release.getSummary());
        vo.setApplicantName(release.getApplicantName());
        vo.setApplyTime(DateTimeUtils.format(release.getApplyTime()));
        vo.setGateName(release.getGateName());
        vo.setDecideTime(DateTimeUtils.format(release.getDecideTime()));
        vo.setExpireAt(DateTimeUtils.format(release.getExpireAt()));
        List<RdmReleaseVO.Check> checks = readChecks(release.getChecksJson());
        vo.setChecks(checks);
        int blocking = blockingFromSnapshot(checks);
        vo.setBlockingCount(blocking);
        boolean expired = release.getExpireAt() != null && release.getExpireAt().isBefore(LocalDateTime.now());
        vo.setExpired(expired);
        vo.setReleasable(RdmRelease.STATUS_PASSED.equals(release.getStatus()) && !expired && blocking == 0);
        return vo;
    }

    /** 快照里的阻断项数：发起时已要求为 0，这里再算一次用于展示旧单当时的情形 */
    private static int blockingFromSnapshot(List<RdmReleaseVO.Check> checks) {
        return (int) checks.stream()
                .filter(c -> Boolean.TRUE.equals(c.getBlocking()))
                .filter(c -> !Boolean.TRUE.equals(c.getPassed()))
                .filter(c -> !Boolean.TRUE.equals(c.getWaived()))
                .filter(c -> !Boolean.TRUE.equals(c.getSkipped()))
                .count();
    }

    private String writeChecks(List<RdmReleaseVO.Check> checks) {
        try {
            return objectMapper.writeValueAsString(checks);
        } catch (Exception e) {
            // 快照写不下等于放行依据丢失，必须失败而不是静默存空串
            throw new BusinessException("放行檢查快照序列化失敗：" + e.getMessage());
        }
    }

    private List<RdmReleaseVO.Check> readChecks(String json) {
        if (!StringUtils.hasText(json)) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<RdmReleaseVO.Check>>() {
            });
        } catch (Exception e) {
            log.warn("放行檢查快照解析失敗，按空快照展示: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    /** 放行相关人通知：发起人 + 放行人候选（需求提出人也在内，让他知道为什么还没上线） */
    private void notifyGate(RdmRelease release, RdmRequirement req, String title, String text) {
        List<Long> receivers = new ArrayList<>();
        if (release.getApplicantUserId() != null) {
            receivers.add(release.getApplicantUserId());
        }
        if (req.getSubmitterUserId() != null && !receivers.contains(req.getSubmitterUserId())) {
            receivers.add(req.getSubmitterUserId());
        }
        if (req.getDevOwnerUserId() != null && !receivers.contains(req.getDevOwnerUserId())) {
            receivers.add(req.getDevOwnerUserId());
        }
        notifyService.notifyUserIds(RdmConstants.EVENT_RELEASE_GATE, req, receivers, title, text);
    }

    private long countSql(String sql, Object arg) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class, arg);
        return value == null ? 0L : value;
    }

    private static String normalizeEnv(String env) {
        if (!StringUtils.hasText(env)) {
            return "prod";
        }
        String normalized = env.trim().toLowerCase();
        if (!List.of("prod", "pre", "uat").contains(normalized)) {
            throw new BusinessException("不支持的發布環境: " + env);
        }
        return normalized;
    }

    private static LocalDateTime parseTime(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        // LocalDateTime.parse 只认 ISO 的 'T' 分隔：先把空格换成 T，分钟精度自动补秒
        try {
            String cleaned = value.trim().replace(' ', 'T');
            if (cleaned.length() == 16) {
                cleaned = cleaned + ":00";
            }
            if (cleaned.length() > 19) {
                cleaned = cleaned.substring(0, 19);
            }
            return LocalDateTime.parse(cleaned);
        } catch (Exception e) {
            throw new BusinessException("計劃上線時間格式不正確：" + value + "（應為 YYYY-MM-DD HH:mm）");
        }
    }

    private static String joinSummary(String oldSummary, String append) {
        if (!StringUtils.hasText(oldSummary)) {
            return append;
        }
        String merged = oldSummary + "；" + append;
        return merged.length() > 500 ? merged.substring(merged.length() - 500) : merged;
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String label(String status) {
        return status == null ? "-" : status;
    }

    /** 状态转中文名（检查项 reason 与拒绝文案用）：没配状态定义时退回原始编码，不拿空字串掩盖问题 */
    private String statusName(String status) {
        if (!StringUtils.hasText(status)) {
            return "-";
        }
        String name = configService.statusLabelMap().get(status);
        return StringUtils.hasText(name) ? name : status;
    }

    private static String statusLabel(String status) {
        return switch (status == null ? "" : status) {
            case RdmRelease.STATUS_PASSED -> "已放行";
            case RdmRelease.STATUS_REJECTED -> "已駁回";
            case RdmRelease.STATUS_REVOKED -> "已作廢";
            default -> "待裁決";
        };
    }
}
