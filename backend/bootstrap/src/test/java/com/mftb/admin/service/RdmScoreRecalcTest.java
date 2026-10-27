package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.RdmRequirementRole;
import com.mftb.admin.entity.RdmScoreRule;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmScoreRuleMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 积分重算落库测试（阶段 6 缺陷回归）。
 * <p>深度测试实测：`POST /score/recalc` 在周期内确实有已交付需求时抛
 * 「數據庫操作異常」，堆栈是 {@code No value specified for parameter 29} ——
 * INSERT 的列数、占位符数、实参数三者错位一位。此前从未暴露，是因为这条插入
 * 只在「周期内有已交付需求」时才执行，而开发库里从来没有过。
 * 本用例把这条路径真正跑一遍，并用 SqlArgs 断言三者一致，让错位无法再次潜伏。
 */
class RdmScoreRecalcTest {

    private JdbcTemplate jdbcTemplate;
    private RdmScoreService service;

    @BeforeEach
    void setUp() {
        RdmScoreRuleMapper ruleMapper = mock(RdmScoreRuleMapper.class);
        RdmRequirementMapper requirementMapper = mock(RdmRequirementMapper.class);
        RdmRequirementRoleMapper roleMapper = mock(RdmRequirementRoleMapper.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new RdmScoreService(ruleMapper, requirementMapper, roleMapper, operatorResolver, jdbcTemplate);

        RdmScoreRule rule = new RdmScoreRule();
        rule.setId(1L);
        rule.setRuleCode("BASE");
        rule.setVersion(3);
        rule.setEnabled(1);
        rule.setRoleFactor(new java.math.BigDecimal("1.0"));
        rule.setMaxScorableRoles(6);
        when(ruleMapper.selectList(any())).thenReturn(List.of(rule));

        // 一条已交付需求：复杂度故意留空（实测需求详情里就是“待产品评估”），必须走兜底而不是整条重算失败
        RdmRequirement req = new RdmRequirement();
        req.setId(6L);
        req.setReqNo("XQ202610060004");
        req.setTitle("門店自營活動報名後台");
        req.setStatus(RdmConstants.STATUS_RELEASED);
        req.setActualReleaseDate(LocalDate.now());
        req.setAcceptanceResult(RdmConstants.ACCEPT_PASS);
        req.setAcceptanceScore(5);
        req.setSubmitterUserId(11L);
        req.setAssigneePmUserId(21L);
        req.setAssigneePmEmpNo("MF00001");
        req.setAssigneePmName("管理员");
        when(requirementMapper.selectList(any())).thenReturn(List.of(req));

        RdmRequirementRole pm = new RdmRequirementRole();
        pm.setReqId(6L);
        pm.setUserId(21L);
        pm.setEmpNo("MF00001");
        pm.setEmpName("管理员");
        pm.setRoleCode(RdmConstants.ROLE_PM);
        pm.setIsActive(1);
        when(roleMapper.selectList(any())).thenReturn(List.of(pm));

        when(operatorResolver.currentUser()).thenReturn(null);
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00001|管理员");
        // 周期解析与部门快照共用 queryForList(String, Object...)：一行结果同时满足两处取值
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.of(
                "code", "2026Q4-E2E",
                "period_start", LocalDate.now().withMonth(10).withDayOfMonth(1),
                "period_end", LocalDate.now().withMonth(12).withDayOfMonth(31))));
        when(jdbcTemplate.queryForObject(anyString(), any(Class.class), any(Object[].class))).thenReturn(0);
    }

    @Test
    @DisplayName("重算写入的 SQL 占位符与实参数必须一致")
    void recalcInsertKeepsArgsAligned() {
        assertDoesNotThrow(() -> service.recalc("2026Q4-E2E"));

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).update(sqlCaptor.capture(), argsCaptor.capture());

        String sql = sqlCaptor.getValue();
        Object[] args = argsCaptor.getValue();
        long marks = sql.chars().filter(c -> c == '?').count();
        assertEquals(args.length, marks, "占位符数量必须等于实参数量，否则运行期报 No value specified for parameter N");

        // 列顺序里第 18 列是 complexity：未评估的需求要按 simple 兜底，不能整条重算失败
        assertEquals("simple", args[17], "复杂度为空时应兜底为 simple");
        // 第 5、6 列是部门快照：无部门数据时保持 null，但必须占位（否则错位一位）
        assertEquals(21L, args[1], "user_id 应是被计分人");
        assertEquals(RdmConstants.ROLE_PM, args[6], "role_code 在第 7 列");
    }
}
