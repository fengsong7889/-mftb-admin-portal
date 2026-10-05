package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmAcceptanceDTO;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmAcceptanceCaseMapper;
import com.mftb.admin.mapper.RdmAcceptanceMapper;
import com.mftb.admin.mapper.RdmAttachmentMapper;
import com.mftb.admin.mapper.RdmCommentMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmRequirementTargetMapper;
import com.mftb.admin.mapper.RdmStatusLogMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmIntakeCallbackService;
import com.mftb.admin.service.RdmNotifyService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * RDM 验收用例守卫测试（M3）。
 * <p>前端已按同一套规则禁用选项，但服务端必须独立重算：一旦有人绕过页面直接调接口，
 * 「有条件通过」就会变成带病上线的后门，一次通过率与返工统计同时失真。
 * <p>本用例锁死四条口径：
 * <ol>
 *   <li>有未通过用例时不能判定验收通过；</li>
 *   <li>存在致命/严重缺陷时不能判定有条件通过（只能退回）；</li>
 *   <li>没有遗留事项时不能滥用有条件通过；</li>
 *   <li>未通过的用例必须定级，否则缺陷统计不可用。</li>
 * </ol>
 */
class RdmAcceptanceGuardTest {

    private RdmRequirementMapper requirementMapper;
    private RdmAcceptanceMapper acceptanceMapper;
    private RdmRequirementServiceImpl service;

    @BeforeEach
    void setUp() {
        requirementMapper = mock(RdmRequirementMapper.class);
        acceptanceMapper = mock(RdmAcceptanceMapper.class);
        RdmRequirementRoleMapper roleMapper = mock(RdmRequirementRoleMapper.class);
        when(roleMapper.selectCount(any())).thenReturn(0L);
        service = new RdmRequirementServiceImpl(
                requirementMapper, mock(RdmRequirementTargetMapper.class),
                roleMapper, mock(RdmStatusLogMapper.class),
                mock(RdmCommentMapper.class), mock(RdmAttachmentMapper.class),
                acceptanceMapper, mock(RdmAcceptanceCaseMapper.class),
                mock(SysUserMapper.class), mock(SysDepartmentMapper.class),
                mock(BizSeqService.class), mock(OperatorResolver.class),
                mock(RdmConfigService.class), mock(RdmNotifyService.class),
                mock(OaRequestService.class), mock(RdmIntakeCallbackService.class),
                mock(PermissionService.class),
                mock(JdbcTemplate.class));
        // 待业务验收状态才可提交验收；不预置产品经理与提出人，避免触发钉钉通知路径
        RdmRequirement req = new RdmRequirement();
        req.setId(1L);
        req.setReqNo("XQ202610040001");
        req.setTitle("推薦報表支持自定義時間區間導出");
        req.setStatus(RdmConstants.STATUS_UAT_PENDING);
        when(requirementMapper.selectById(1L)).thenReturn(req);
    }

    /** 构造验收请求体 */
    private static RdmAcceptanceDTO form(String result, String issues,
                                         List<RdmAcceptanceDTO.AcceptanceCaseDTO> cases) {
        RdmAcceptanceDTO dto = new RdmAcceptanceDTO();
        dto.setResult(result);
        dto.setScore(5);
        dto.setIssues(issues);
        dto.setTestEnv("uat");
        dto.setCases(cases);
        return dto;
    }

    /** 构造单条用例 */
    private static RdmAcceptanceDTO.AcceptanceCaseDTO caseOf(String result, String severity) {
        RdmAcceptanceDTO.AcceptanceCaseDTO c = new RdmAcceptanceDTO.AcceptanceCaseDTO();
        c.setTitle("可自選任意起止日期");
        c.setResult(result);
        c.setSeverity(severity);
        return c;
    }

    @Test
    @DisplayName("有未通过用例时不能判定验收通过")
    void passBlockedByFailedCase() {
        RdmAcceptanceDTO dto = form(RdmConstants.ACCEPT_PASS, null,
                List.of(caseOf(RdmConstants.CASE_PASS, null), caseOf(RdmConstants.CASE_FAIL, RdmConstants.SEVERITY_MINOR)));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(1L, dto));
        assertTrue(ex.getMessage().contains("不能判定驗收通過"), ex.getMessage());
    }

    @Test
    @DisplayName("存在致命/严重缺陷时不允许有条件通过（防带病上线）")
    void conditionalBlockedByBlockingSeverity() {
        RdmAcceptanceDTO dto = form(RdmConstants.ACCEPT_CONDITIONAL, "導出提示不明確",
                List.of(caseOf(RdmConstants.CASE_FAIL, RdmConstants.SEVERITY_MAJOR)));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(1L, dto));
        assertTrue(ex.getMessage().contains("不允許有條件通過"), ex.getMessage());
    }

    @Test
    @DisplayName("全部用例通过时不能滥用有条件通过")
    void conditionalRequiresRealDefects() {
        RdmAcceptanceDTO dto = form(RdmConstants.ACCEPT_CONDITIONAL, "無實質遺留",
                List.of(caseOf(RdmConstants.CASE_PASS, null)));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(1L, dto));
        assertTrue(ex.getMessage().contains("請直接判定驗收通過"), ex.getMessage());
    }

    @Test
    @DisplayName("未通过的用例必须定级，否则缺陷统计不可用")
    void failedCaseRequiresSeverity() {
        RdmAcceptanceDTO dto = form(RdmConstants.ACCEPT_FAIL, "區間上限校驗未通過",
                List.of(caseOf(RdmConstants.CASE_FAIL, null)));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(1L, dto));
        assertTrue(ex.getMessage().contains("缺陷嚴重程度"), ex.getMessage());
    }

    @Test
    @DisplayName("阻塞未测同样计缺陷：不能判验收通过")
    void blockedCaseCountsAsDefect() {
        RdmAcceptanceDTO dto = form(RdmConstants.ACCEPT_PASS, null,
                List.of(caseOf(RdmConstants.CASE_BLOCKED, RdmConstants.SEVERITY_MINOR)));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.submitAcceptance(1L, dto));
        assertTrue(ex.getMessage().contains("不能判定驗收通過"), ex.getMessage());
    }

    @Test
    @DisplayName("全部通过 + 环境齐备时允许提交")
    void passAccepted() {
        RdmAcceptanceDTO dto = form(RdmConstants.ACCEPT_PASS, null,
                List.of(caseOf(RdmConstants.CASE_PASS, null), caseOf(RdmConstants.CASE_PASS, null)));

        assertDoesNotThrow(() -> service.submitAcceptance(1L, dto));
    }

    @Test
    @DisplayName("非待验收状态不能提交验收结论")
    void onlyUatPendingAcceptable() {
        RdmRequirement developing = new RdmRequirement();
        developing.setId(2L);
        developing.setStatus(RdmConstants.STATUS_DEVELOPING);
        when(requirementMapper.selectById(2L)).thenReturn(developing);

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.submitAcceptance(2L, form(RdmConstants.ACCEPT_PASS, null,
                        List.of(caseOf(RdmConstants.CASE_PASS, null)))));
        assertTrue(ex.getMessage().contains("待業務驗收"), ex.getMessage());
    }
}
