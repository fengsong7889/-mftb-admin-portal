package com.mftb.admin.service.impl;

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
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 发布放行守卫测试（阶段 4）。
 * <p>锁死的是「上线这道门」：
 * <ol>
 *   <li>检查项由服务端算，前端传什么都没用；有阻断项就不许发起；</li>
 *   <li>旧流程（V1）需求在三项新结构上跳过，而不是被判成质量不合格；</li>
 *   <li>发起人不能自己放行，驳回必须写原因；</li>
 *   <li>没有有效放行单不能执行上线，过期或版本不符同样不行。</li>
 * </ol>
 */
class RdmReleaseGuardTest {

    private RdmReleaseMapper releaseMapper;
    private RdmAccessGuard accessGuard;
    private OperatorResolver operatorResolver;
    private JdbcTemplate jdbcTemplate;
    private RdmReleaseServiceImpl service;

    /** 当前登录人：既是发起人，用于验证四眼原则 */
    private static final long APPLICANT_ID = 21L;

    /** 捕获 insert 后的实体，供 reload/selectById 返回同一对象 */
    private final RdmRelease[] inserted = new RdmRelease[1];

    @BeforeEach
    void setUp() {
        releaseMapper = mock(RdmReleaseMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        com.mftb.admin.service.RdmConfigService configService = mock(com.mftb.admin.service.RdmConfigService.class);
        when(configService.statusLabelMap()).thenReturn(Map.of());
        BizSeqService bizSeqService = mock(BizSeqService.class);
        when(bizSeqService.next(anyString())).thenReturn("FZ202610060001");
        service = new RdmReleaseServiceImpl(releaseMapper, accessGuard, operatorResolver,
                bizSeqService, mock(RdmNotifyService.class), jdbcTemplate, new ObjectMapper(), configService);

        SysUser current = new SysUser();
        current.setId(APPLICANT_ID);
        current.setEmpId("MF00021");
        current.setName("陳雅婷");
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00021|陳雅婷");
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        when(releaseMapper.selectCount(any())).thenReturn(0L);
        // 真实 insert 不回填 id，但服务会在写完后 reload 一次：用 holder 把刚插入的对象交给 selectById
        when(releaseMapper.insert(any(RdmRelease.class))).thenAnswer(inv -> {
            inserted[0] = inv.getArgument(0);
            return 1;
        });
        when(releaseMapper.selectById(any())).thenAnswer(inv -> inserted[0]);
    }

    /** 需求：默认走新链路、已进入待业务验收（测试阶段已完成） */
    private RdmRequirement requirement(int flowVersion) {
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610060001");
        req.setTitle("門店自營活動報名後台");
        req.setStatus(RdmConstants.STATUS_UAT_PENDING);
        req.setFlowVersion(flowVersion);
        req.setSubmitterUserId(11L);
        req.setAssigneePmUserId(APPLICANT_ID);
        return req;
    }

    /**
     * 按 SQL 关键字投喂计数结果，让「全部通过」与「某项失败」两种场景可复现。
     * <p>用关键字而不是顺序匹配，是因为检查项顺序会变，测试不该绑在实现顺序上。
     */
    private void stubCounts() {
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), any())).thenAnswer(inv -> {
            String sql = inv.getArgument(0);
            return switch (pick(sql)) {
                case "prdSnapshot" -> 1L;
                case "baseline" -> 1L;
                case "unfinished" -> 0L;
                case "blocked" -> 0L;
                case "taskTotal" -> 3L;
                case "unreported" -> 0L;
                case "prePass" -> 1L;
                case "preBlocking" -> 0L;
                case "preTotal" -> 1L;
                case "openChange" -> 0L;
                case "slipped" -> 0L;
                default -> 0L;
            };
        });
    }

    private static String pick(String sql) {
        if (sql.contains("rdm_prd_snapshot")) {
            return "prdSnapshot";
        }
        if (sql.contains("baseline_date IS NOT NULL AND deleted")) {
            return "baseline";
        }
        if (sql.contains("actual_date IS NOT NULL AND actual_date > baseline_date")) {
            return "slipped";
        }
        if (sql.contains("status <> 'done' AND status <> 'cancelled'")) {
            return "unfinished";
        }
        if (sql.contains("status = 'blocked'")) {
            return "blocked";
        }
        if (sql.contains("rdm_work_log")) {
            return "unreported";
        }
        if (sql.contains("FROM rdm_work_task")) {
            return "taskTotal";
        }
        if (sql.contains("critical','major'")) {
            return "preBlocking";
        }
        if (sql.contains("result IN ('pass','conditional')")) {
            return "prePass";
        }
        if (sql.contains("stage = 'pre_release' AND deleted = 0")) {
            return "preTotal";
        }
        if (sql.contains("rdm_change_request")) {
            return "openChange";
        }
        return "unknown";
    }

    private RdmReleaseDTO.Apply applyForm() {
        RdmReleaseDTO.Apply dto = new RdmReleaseDTO.Apply();
        dto.setEnv("prod");
        dto.setVersionNo("v2.6.0");
        dto.setPlanTime("2026-10-08 20:00");
        return dto;
    }

    @Test
    @DisplayName("旧流程需求跳过三项新结构检查，不被判为质量不合格")
    void legacyRequirementSkipsNewChecks() {
        when(accessGuard.requireVisible(any(), anyString())).thenReturn(requirement(1));

        RdmReleaseVO.Gate gate = service.preview(1L);
        RdmReleaseVO.Check prd = gate.getChecks().stream()
                .filter(c -> "PRD_APPROVED".equals(c.getCode())).findFirst().orElseThrow();
        assertTrue(prd.getSkipped(), "V1 需求应跳过 PRD 定稿检查");
        assertTrue(prd.getPassed(), "跳过项不应算作失败");

        when(accessGuard.requireVisible(any(), anyString())).thenReturn(requirement(2));
        RdmReleaseVO.Gate modern = service.preview(1L);
        RdmReleaseVO.Check prdV2 = modern.getChecks().stream()
                .filter(c -> "PRD_APPROVED".equals(c.getCode())).findFirst().orElseThrow();
        assertFalse(prdV2.getSkipped());
        assertFalse(prdV2.getPassed(), "V2 需求没有定稿快照时必须算失败");
    }

    @Test
    @DisplayName("有阻断检查项时不能发起放行")
    void applyBlockedByFailedChecks() {
        when(accessGuard.requireDeliveryWriter(any(), anyString())).thenReturn(requirement(2));
        // 不预置任何计数：任务未拆、预验收未做 → 必然有阻断项

        BusinessException ex = assertThrows(BusinessException.class, () -> service.apply(1L, applyForm()));
        assertTrue(ex.getMessage().contains("阻斷檢查未通過"), ex.getMessage());
        verify(releaseMapper, never()).insert(any(RdmRelease.class));
    }

    @Test
    @DisplayName("豁免检查项必须写理由")
    void waiveRequiresReason() {
        when(accessGuard.requireDeliveryWriter(any(), anyString())).thenReturn(requirement(2));
        RdmReleaseDTO.Apply dto = applyForm();
        dto.setWaivedCodes(List.of("TASKS_DONE"));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.apply(1L, dto));
        assertTrue(ex.getMessage().contains("豁免理由"), ex.getMessage());
    }

    @Test
    @DisplayName("检查项全通过时可发起放行，快照随单冻结")
    void applySucceedsWhenAllChecksPass() {
        stubCounts();
        when(accessGuard.requireDeliveryWriter(any(), anyString())).thenReturn(requirement(2));

        RdmReleaseVO.Gate gate = service.apply(1L, applyForm());

        ArgumentCaptor<RdmRelease> captor = ArgumentCaptor.forClass(RdmRelease.class);
        verify(releaseMapper).insert(captor.capture());
        RdmRelease saved = captor.getValue();
        assertEquals(RdmRelease.STATUS_PENDING, saved.getStatus());
        assertEquals(0, saved.getBlockingCount());
        assertTrue(saved.getChecksJson().contains("PRD_APPROVED"), "检查项快照应随行保存");
        assertEquals("prod", saved.getEnv());
        assertEquals("FZ202610060001", gate.getReleaseNo());
    }

    @Test
    @DisplayName("发起人不能自己放行（四眼原则）")
    void applicantCannotSelfApprove() {
        stubCounts();
        when(accessGuard.requireDeliveryWriter(any(), anyString())).thenReturn(requirement(2));
        RdmRelease pending = pendingRelease();
        when(releaseMapper.selectById(7L)).thenReturn(pending);

        RdmReleaseDTO.Decide decide = new RdmReleaseDTO.Decide();
        decide.setPassed(true);

        BusinessException ex = assertThrows(BusinessException.class, () -> service.decide(7L, decide));
        assertTrue(ex.getMessage().contains("不可自行放行"), ex.getMessage());
    }

    @Test
    @DisplayName("驳回必须写原因，重复裁决一律拒绝")
    void rejectRequiresReasonAndDecideIsOneShot() {
        stubCounts();
        when(accessGuard.requireDeliveryWriter(any(), anyString())).thenReturn(requirement(2));
        when(releaseMapper.selectById(7L)).thenReturn(pendingRelease());

        RdmReleaseDTO.Decide empty = new RdmReleaseDTO.Decide();
        empty.setPassed(false);
        assertThrows(BusinessException.class, () -> service.decide(7L, empty));

        RdmRelease decided = pendingRelease();
        decided.setStatus(RdmRelease.STATUS_PASSED);
        when(releaseMapper.selectById(8L)).thenReturn(decided);
        RdmReleaseDTO.Decide again = new RdmReleaseDTO.Decide();
        again.setPassed(false);
        again.setSummary("再来一次");
        BusinessException ex = assertThrows(BusinessException.class, () -> service.decide(8L, again));
        assertTrue(ex.getMessage().contains("不可重複裁決"), ex.getMessage());
    }

    @Test
    @DisplayName("由他人裁决时放行成功并设置有效期")
    void otherGatekeeperCanApprove() {
        stubCounts();
        when(accessGuard.requireDeliveryWriter(any(), anyString())).thenReturn(requirement(2));
        SysUser gatekeeper = new SysUser();
        gatekeeper.setId(99L);
        gatekeeper.setEmpId("MF00099");
        gatekeeper.setName("李四");
        when(operatorResolver.currentUser()).thenReturn(gatekeeper);
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00099|李四");
        RdmRelease pending = pendingRelease();
        when(releaseMapper.selectById(7L)).thenReturn(pending);

        RdmReleaseDTO.Decide decide = new RdmReleaseDTO.Decide();
        decide.setPassed(true);
        decide.setSummary("回归通过");
        RdmReleaseVO.Gate gate = service.decide(7L, decide);

        assertEquals(RdmRelease.STATUS_PASSED, pending.getStatus());
        assertTrue(pending.getExpireAt().isAfter(LocalDateTime.now()), "放行应带有效期");
        assertTrue(pending.getExpireAt().isBefore(LocalDateTime.now().plusDays(RdmConstants.RELEASE_VALID_DAYS + 1)),
                "有效期不应超出配置的 " + RdmConstants.RELEASE_VALID_DAYS + " 天");
        assertTrue(gate.getReleasable());
    }

    @Test
    @DisplayName("没有放行单/已过期/版本不符都不能上线")
    void releaseActionRequiresValidPass() {
        when(releaseMapper.selectList(any())).thenReturn(List.of());
        BusinessException none = assertThrows(BusinessException.class, () -> service.requireValidPass(1L, "v2.6.0"));
        assertTrue(none.getMessage().contains("先通過發布放行"), none.getMessage());

        RdmRelease expired = pendingRelease();
        expired.setStatus(RdmRelease.STATUS_PASSED);
        expired.setExpireAt(LocalDateTime.now().minusDays(1));
        expired.setVersionNo("v2.6.0");
        when(releaseMapper.selectList(any())).thenReturn(List.of(expired));
        BusinessException out = assertThrows(BusinessException.class, () -> service.requireValidPass(1L, "v2.6.0"));
        assertTrue(out.getMessage().contains("已過期"), out.getMessage());

        RdmRelease otherVersion = pendingRelease();
        otherVersion.setStatus(RdmRelease.STATUS_PASSED);
        otherVersion.setExpireAt(LocalDateTime.now().plusDays(1));
        otherVersion.setVersionNo("v2.5.9");
        when(releaseMapper.selectList(any())).thenReturn(List.of(otherVersion));
        BusinessException mismatch = assertThrows(BusinessException.class, () -> service.requireValidPass(1L, "v2.6.0"));
        assertTrue(mismatch.getMessage().contains("版本"), mismatch.getMessage());

        assertDoesNotThrowValidPass(otherVersion);
    }

    /** 版本一致（或未指定版本）时必须放行通过 */
    private void assertDoesNotThrowValidPass(RdmRelease matched) {
        matched.setVersionNo("v2.6.0");
        service.requireValidPass(1L, "v2.6.0");
        service.requireValidPass(1L, null);
    }

    @Test
    @DisplayName("返工后在途与已放行的放行单一律作废")
    void revokeOpenGatesMarksBothPendingAndPassed() {
        RdmRelease pending = pendingRelease();
        RdmRelease passed = pendingRelease();
        passed.setId(9L);
        passed.setStatus(RdmRelease.STATUS_PASSED);
        passed.setReleaseNo("FZ202610060009");
        when(releaseMapper.selectList(any())).thenReturn(List.of(pending, passed));

        service.revokeOpenGates(1L, "验收不通过退回返工");

        assertEquals(RdmRelease.STATUS_REVOKED, pending.getStatus());
        assertEquals(RdmRelease.STATUS_REVOKED, passed.getStatus());
        verify(releaseMapper).updateById(pending);
        verify(releaseMapper).updateById(passed);
        assertTrue(pending.getSummary().contains("作廢"), "作废原因要留在放行单上");
    }

    private static RdmRelease pendingRelease() {
        RdmRelease release = new RdmRelease();
        release.setId(7L);
        release.setReleaseNo("FZ202610060007");
        release.setReqId(1L);
        release.setRoundNo(1);
        release.setEnv("prod");
        release.setStatus(RdmRelease.STATUS_PENDING);
        release.setApplicantUserId(APPLICANT_ID);
        release.setApplicantName("陳雅婷");
        release.setChecksJson("[]");
        release.setBlockingCount(0);
        return release;
    }
}
