package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmIntakeVO;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 准入策略裁决测试（阶段 2B 的核心口径）。
 * <p>锁死四条：
 * <ol>
 *   <li>免审只在命中启用且生效的 EXEMPT 策略时成立；</li>
 *   <li>强制审批约束优先于免审，即使免审规则优先级更靠前；</li>
 *   <li>一条都没命中时默认「需要审批」，不允许 fail-open；</li>
 *   <li>配置端就拦住「需审批但没节点」与「同优先级条件重叠」。</li>
 * </ol>
 */
class RdmIntakePolicyServiceTest {

    private JdbcTemplate jdbcTemplate;
    private OperatorResolver operatorResolver;
    private RdmIntakePolicyService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        operatorResolver = mock(OperatorResolver.class);
        service = new RdmIntakePolicyService(jdbcTemplate, operatorResolver, mock(SysUserMapper.class),
                mock(PermissionService.class));
    }

    /** 造一条策略行（列名与 SELECT 保持一致，改 SQL 时测试会先红） */
    private static Map<String, Object> row(long id, String name, String mode, String depts, int priority, int status) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", id);
        map.put("name", name);
        map.put("mode", mode);
        map.put("scope_dept_names", depts);
        map.put("include_sub_dept", 0);
        map.put("scope_roles", null);
        map.put("scope_systems", null);
        map.put("scope_req_types", null);
        map.put("approval_nodes", "直屬主管");
        map.put("dispatcher_user_id", 51L);
        map.put("dispatcher_name", "技術負責人");
        map.put("priority", priority);
        map.put("effective_from", "2026-01-01");
        map.put("effective_to", null);
        map.put("version", "v1");
        map.put("status", status);
        map.put("remark", null);
        return map;
    }

    private void stubPolicies(List<Map<String, Object>> rows) {
        when(jdbcTemplate.queryForList(anyString())).thenReturn(rows);
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());
    }

    private static SysUser submitter(String dept) {
        SysUser u = new SysUser();
        u.setId(11L);
        u.setEmpId("MF00011");
        u.setName("張三");
        u.setDepartment(dept);
        u.setDepartmentId(101L);
        u.setFunctionRoles("[]");
        return u;
    }

    @Test
    @DisplayName("命中启用的免审策略时才允许免审")
    void exemptOnlyWhenHit() {
        stubPolicies(new ArrayList<>(List.of(
                row(1L, "產研部門免審直送", RdmIntakePolicyService.MODE_EXEMPT, "技術部", 5, 1))));

        RdmIntakeVO.Decision decision = service.decide(submitter("技術部"), "OPTIMIZE", null);

        assertFalse(decision.isNeedApproval());
        assertEquals(RdmIntakePolicyService.MODE_EXEMPT, decision.getMode());
        assertEquals("產研部門免審直送", decision.getPolicyName());
        // 免审也要留下可审计的解释：否则事后无法回答「凭什么这单没走审批」
        assertTrue(decision.getExplain().stream().anyMatch(line -> line.contains("免審僅影響")), decision.getExplain().toString());
    }

    @Test
    @DisplayName("强制审批优先：即使免审规则排在更前面")
    void forceApproveBeatsExempt() {
        stubPolicies(new ArrayList<>(List.of(
                row(1L, "產品部免審", RdmIntakePolicyService.MODE_EXEMPT, "產品部", 3, 1),
                row(2L, "財務類強制準入", RdmIntakePolicyService.MODE_FORCE_APPROVE, "產品部", 9, 1))));

        RdmIntakeVO.Decision decision = service.decide(submitter("產品部"), "OPTIMIZE", null);

        assertTrue(decision.isNeedApproval());
        assertEquals("財務類強制準入", decision.getPolicyName());
        assertTrue(decision.getExplain().stream().anyMatch(line -> line.contains("強制審批約束優先")),
                decision.getExplain().toString());
    }

    @Test
    @DisplayName("未命中任何策略时默认需要审批（不得 fail-open）")
    void noMatchFallsBackToApproval() {
        stubPolicies(new ArrayList<>(List.of(
                row(1L, "門店運營組長免審", RdmIntakePolicyService.MODE_EXEMPT, "門店運營部", 10, 1))));

        RdmIntakeVO.Decision decision = service.decide(submitter("财务部"), "BUG", null);

        assertTrue(decision.isNeedApproval());
        assertTrue(decision.isFallback());
    }

    @Test
    @DisplayName("停用的策略不参与裁决（样例免审被停用后仍需审批）")
    void disabledPolicyIgnored() {
        stubPolicies(new ArrayList<>(List.of(
                row(1L, "產研部門免審直送", RdmIntakePolicyService.MODE_EXEMPT, "技術部", 5, 0))));

        RdmIntakeVO.Decision decision = service.decide(submitter("技術部"), "OPTIMIZE", null);

        assertTrue(decision.isNeedApproval());
        assertTrue(decision.isFallback());
    }

    @Test
    @DisplayName("需审批但没配节点：标记异常轮次而不是自动放行")
    void missingNodesMarksAbnormal() {
        Map<String, Object> legacy = row(1L, "歷史策略（無節點）", RdmIntakePolicyService.MODE_APPROVE, "技術部", 2, 1);
        legacy.put("approval_nodes", null);
        stubPolicies(new ArrayList<>(List.of(legacy)));

        RdmIntakeVO.Decision decision = service.decide(submitter("技術部"), "OPTIMIZE", null);

        assertTrue(decision.isNeedApproval());
        assertTrue(decision.isAbnormal());
        assertTrue(decision.getExplain().stream().anyMatch(line -> line.contains("異常待辦")), decision.getExplain().toString());
    }

    @Test
    @DisplayName("需审批策略缺审批节点时禁止保存")
    void saveRejectsApproveWithoutNodes() {
        RdmIntakeVO.Policy policy = new RdmIntakeVO.Policy();
        policy.setName("新策略");
        policy.setMode(RdmIntakePolicyService.MODE_APPROVE);
        policy.setEffectiveFrom("2026-10-01");
        policy.setApprovalNodes(new ArrayList<>());

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePolicy(policy, "admin"));
        assertTrue(ex.getMessage().contains("審批節點"), ex.getMessage());
    }

    @Test
    @DisplayName("同优先级且条件重叠的策略禁止保存（避免命中谁取决于排序）")
    void saveRejectsSamePriorityOverlap() {
        stubPolicies(new ArrayList<>(List.of(
                row(1L, "已有免審策略", RdmIntakePolicyService.MODE_EXEMPT, "技術部", 5, 1))));
        RdmIntakeVO.Policy policy = new RdmIntakeVO.Policy();
        policy.setId(99L);
        policy.setName("另一条同优先级策略");
        policy.setMode(RdmIntakePolicyService.MODE_APPROVE);
        policy.setScopeDepts(new ArrayList<>(List.of("技術部")));
        policy.setApprovalNodes(new ArrayList<>(List.of("直屬主管")));
        policy.setPriority(5);
        policy.setEffectiveFrom("2026-10-01");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePolicy(policy, "admin"));
        assertTrue(ex.getMessage().contains("條件重疊"), ex.getMessage());
    }

    @Test
    @DisplayName("不支持的准入动作取值直接拒绝（不静默降级成需审批）")
    void saveRejectsUnknownMode() {
        RdmIntakeVO.Policy policy = new RdmIntakeVO.Policy();
        policy.setName("异常策略");
        policy.setMode("SKIP_ALL");
        policy.setEffectiveFrom("2026-10-01");
        policy.setApprovalNodes(new ArrayList<>(List.of("直屬主管")));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.savePolicy(policy, "admin"));
        assertTrue(ex.getMessage().contains("准入動作"), ex.getMessage());
    }
}
