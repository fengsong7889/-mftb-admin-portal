package com.mftb.admin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmReleaseDTO;
import com.mftb.admin.entity.RdmRelease;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmReleaseMapper;
import com.mftb.admin.service.impl.RdmReleaseServiceImpl;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 发布放行四眼原则测试（阶段 4 规则的确定性覆盖）。
 * <p>此前这条规则只能靠"两个人各登录一次点一遍"验证，单人开发环境里从来没被真正跑过，
 * 等于没有保障。四眼是上线闸门的最后一道人闸，必须用测试钉住四件事：
 * 发起人不能自己放行、驳回不受四眼限制、管理员例外确实存在、例外之外仍要重算闸门。
 */
class RdmReleaseFourEyesTest {

    private static final long APPLICANT = 2L;
    private static final long OTHER_RELEASER = 3L;
    private static final long ADMIN = 1L;
    private static final long REQ_ID = 3L;
    private static final long RELEASE_ID = 7L;

    private RdmReleaseMapper releaseMapper;
    private RdmAccessGuard accessGuard;
    private OperatorResolver operatorResolver;
    private JdbcTemplate jdbcTemplate;
    private RdmReleaseServiceImpl service;

    private RdmRelease release;

    @BeforeEach
    void setUp() {
        releaseMapper = mock(RdmReleaseMapper.class);
        accessGuard = mock(RdmAccessGuard.class);
        operatorResolver = mock(OperatorResolver.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new RdmReleaseServiceImpl(releaseMapper, accessGuard, operatorResolver,
                mock(BizSeqService.class), mock(RdmNotifyService.class),
                jdbcTemplate, new ObjectMapper(), mock(RdmConfigService.class));

        release = new RdmRelease();
        release.setId(RELEASE_ID);
        release.setReqId(REQ_ID);
        release.setReleaseNo("FZ202610070001");
        release.setRoundNo(1);
        release.setStatus(RdmRelease.STATUS_PENDING);
        release.setApplicantUserId(APPLICANT);
        release.setEnv("prod");
        release.setChecksJson("[]");
        when(releaseMapper.selectById(RELEASE_ID)).thenReturn(release);

        RdmRequirement req = new RdmRequirement();
        req.setId(REQ_ID);
        req.setReqNo("XQ202610060001");
        req.setTitle("門店活動報名後台");
        // V1 老需求：PRD 快照/节点基线/工时明细三项跳过，任务与测试阶段照旧会阻断
        req.setFlowVersion(1);
        req.setStatus(RdmConstants.STATUS_DEVELOPING);
        req.setSubmitterUserId(9L);
        when(accessGuard.requireDeliveryWriter(anyLong(), anyString())).thenReturn(req);

        // 所有闸门计数默认 0：没拆任务、没预验收 → 重算必然仍有阻断项
        when(jdbcTemplate.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(0L);
    }

    private void loginAs(long userId, boolean admin) {
        SysUser current = new SysUser();
        current.setId(userId);
        current.setEmpId("MF000" + userId);
        current.setName(admin ? "管理员" : "成員" + userId);
        when(operatorResolver.currentUser()).thenReturn(current);
        when(operatorResolver.isAdmin(any())).thenReturn(admin);
        when(operatorResolver.operatorSignature(any())).thenReturn(current.getEmpId() + "|" + current.getName());
    }

    private RdmReleaseDTO.Decide decide(boolean passed, String summary) {
        RdmReleaseDTO.Decide dto = new RdmReleaseDTO.Decide();
        dto.setPassed(passed);
        dto.setSummary(summary);
        return dto;
    }

    @Test
    @DisplayName("发起人不能给自己的放行单放行")
    void applicantCannotApproveOwnGate() {
        loginAs(APPLICANT, false);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.decide(RELEASE_ID, decide(true, "看起来没问题")));
        assertTrue(ex.getMessage().contains("發起人不可自行放行"), ex.getMessage());
        // 拒绝必须发生在任何写入之前：不能先把单子改成已通过再报错
        verify(releaseMapper, never()).updateById(any(RdmRelease.class));
    }

    @Test
    @DisplayName("另一个人可以裁决同一张放行单（不被四眼拦截）")
    void anotherPersonCanDecide() {
        loginAs(OTHER_RELEASER, false);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.decide(RELEASE_ID, decide(true, "同意上线")));
        // 走到重算闸门才失败，说明四眼这一关已经通过
        assertTrue(ex.getMessage().contains("阻斷"), ex.getMessage());
        assertNotContains(ex.getMessage(), "發起人不可自行放行");
    }

    @Test
    @DisplayName("系统管理员可自批（运维应急例外），但例外不绕过重算闸门")
    void adminExemptionStillRecomputesGate() {
        loginAs(ADMIN, true);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.decide(RELEASE_ID, decide(true, "应急上线")));
        assertTrue(ex.getMessage().contains("阻斷"), ex.getMessage());
        assertNotContains(ex.getMessage(), "發起人不可自行放行");
    }

    @Test
    @DisplayName("驳回不受四眼限制，但必须写原因")
    void applicantCanRejectOwnGateButMustJustify() {
        loginAs(APPLICANT, false);

        assertThrows(BusinessException.class, () -> service.decide(RELEASE_ID, decide(false, "  ")));

        service.decide(RELEASE_ID, decide(false, "预验收还有阻塞缺陷，先返工"));
        assertEquals(RdmRelease.STATUS_REJECTED, release.getStatus());
        // 裁决人就是发起人自己：驳回不需要四眼，但必须留痕是谁驳回的
        assertEquals(Long.valueOf(APPLICANT), release.getGateUserId());
        verify(releaseMapper).updateById(release);
        // 驳回不发放行有效期：过期时间与放行结论必须同时清空
        assertEquals(null, release.getExpireAt());
    }

    /** 确认失败原因确实是闸门重算，而不是被四眼原则拦住（本地定义避开 JUnit 5.11+ 的同名 API） */
    private static void assertNotContains(String actual, String forbidden) {
        if (actual != null && actual.contains(forbidden)) {
            throw new AssertionError("消息不应包含「" + forbidden + "」，实际：" + actual);
        }
    }
}
