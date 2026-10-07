package com.mftb.admin.service;

import com.mftb.admin.entity.RdmHrSuggestion;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmHrSuggestionMapper;
import com.mftb.admin.mapper.RdmScoreBudgetMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * HR 建议聚合落库测试（阶段 6 缺陷回归）。
 * <p>深度测试实测：聚合建议 100% 失败，堆栈 {@code No value specified for parameter 17} ——
 * rdm_hr_suggestion 的 INSERT 里列数、占位符数、实参数三者错位一位。
 * 这类缺陷在「没有积分流水」的环境里完全不会暴露（走不到插入分支），
 * 所以必须用一条真实聚合路径把它钉住。
 */
class RdmGovernanceGenerateTest {

    private JdbcTemplate jdbcTemplate;
    private RdmGovernanceService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        SysUser current = new SysUser();
        current.setId(1L);
        current.setEmpId("MF00001");
        current.setName("管理员");
        OperatorResolver resolver = mock(OperatorResolver.class);
        when(resolver.currentUser()).thenReturn(current);
        when(resolver.operatorSignature(any())).thenReturn("MF00001|管理员");
        service = new RdmGovernanceService(mock(RdmScoreBudgetMapper.class), mock(RdmHrSuggestionMapper.class),
                resolver, jdbcTemplate);
    }

    @Test
    @DisplayName("聚合写入的 SQL 占位符与实参数必须一致")
    void generateInsertKeepsArgsAligned() {
        // 周期存在性（queryForList(String, Class, Object...)）
        when(jdbcTemplate.queryForList(anyString(), any(Class.class), any(Object[].class)))
                .thenReturn(List.of("2026Q4-E2E"));
        // 聚合结果与分项依据（queryForList(String, Object...)）
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of(Map.ofEntries(
                Map.entry("user_id", 21L),
                Map.entry("emp_no", "MF00001"),
                Map.entry("user_name", "管理员"),
                Map.entry("dept_id", 5L),
                Map.entry("dept_name", "董事長兼首席執行官辦公室"),
                Map.entry("total_score", new BigDecimal("214.78")),
                Map.entry("record_count", 10),
                Map.entry("delivered_count", 2),
                Map.entry("avg_acceptance", new BigDecimal("5.00")),
                Map.entry("first_pass_count", 2),
                Map.entry("rule_version", 3))));
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        assertDoesNotThrow(() -> service.generate("2026Q4-E2E"));

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate).update(sqlCaptor.capture(), argsCaptor.capture());

        String sql = sqlCaptor.getValue();
        Object[] args = argsCaptor.getValue();
        long marks = sql.chars().filter(c -> c == '?').count();
        int columns = sql.substring(sql.indexOf('(') + 1, sql.indexOf(')')).split(",").length;
        assertEquals(columns, countValues(sql), "VALUES 表达式个数必须等于列数");
        assertEquals(marks, args.length, "占位符数量必须等于实参数量");
        assertEquals(18, columns);
        assertEquals(16, marks);
    }

    /** 数 VALUES (...) 里的顶层表达式个数（NOW() 算一个，逗号不进入括号内） */
    private static int countValues(String sql) {
        int from = sql.indexOf("VALUES (") + "VALUES (".length();
        int depth = 0;
        int items = 1;
        for (int i = from; i < sql.length(); i++) {
            char ch = sql.charAt(i);
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                if (depth == 0) {
                    break;
                }
                depth--;
            } else if (ch == ',' && depth == 0) {
                items++;
            }
        }
        return items;
    }

    @Test
    @DisplayName("周期不存在时拒绝聚合，不静默返回 0 条")
    void unknownPeriodRejected() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), any(Class.class), any(Object[].class))).thenReturn(List.of());
        RdmGovernanceService svc = new RdmGovernanceService(mock(RdmScoreBudgetMapper.class),
                mock(RdmHrSuggestionMapper.class), mock(OperatorResolver.class), jdbc);

        assertThrows(BusinessException.class, () -> svc.generate("NOT_EXIST"));
    }

    /**
     * 没有流水时必须报错：返回“成功聚合 0 人”会让人以为已经出数，
     * 而后面的复核/推送全是空操作。
     */
    @Test
    @DisplayName("无流水时拒绝聚合而不是报成功 0 人")
    void emptyScoreRecordsRejected() {
        when(jdbcTemplate.queryForList(anyString(), any(Class.class), any(Object[].class)))
                .thenReturn(List.of("2026Q4-E2E"));
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        assertThrows(BusinessException.class, () -> service.generate(null));
    }

    /**
     * 撤回必须把流水的推送标记一起回退。
     * <p>端到端实测的不对称：推送会置 rdm_score_record.push_status=已推建议，撤回只清了考核单建议值，
     * 结果看板长期显示「已推送」而考核单上其实已无建议值，HR 无从判断真实状态。
     */
    @Test
    @DisplayName("撤回时回退流水推送标记")
    void withdrawResetsScoreRecordPushStatus() {
        RdmHrSuggestionMapper suggestionMapper = mock(RdmHrSuggestionMapper.class);
        SysUser current = new SysUser();
        current.setId(1L);
        OperatorResolver resolver = mock(OperatorResolver.class);
        when(resolver.currentUser()).thenReturn(current);
        when(resolver.operatorSignature(any())).thenReturn("MF00001|管理员");
        when(resolver.isAdmin(any())).thenReturn(true);

        RdmHrSuggestion row = new RdmHrSuggestion();
        row.setId(2L);
        row.setPeriodCode("2026Q4-E2E");
        row.setUserId(1L);
        row.setStatus(RdmHrSuggestion.STATUS_PUSHED);
        row.setTotalScore(new BigDecimal("214.78"));
        when(suggestionMapper.selectById(2L)).thenReturn(row);
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);

        RdmGovernanceService svc = new RdmGovernanceService(
                mock(RdmScoreBudgetMapper.class), suggestionMapper, resolver, jdbcTemplate);
        svc.withdraw(2L, "考核單口径待 HR 復核後重推");

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcTemplate, atLeastOnce()).update(sqlCaptor.capture(), argsCaptor.capture());

        List<String> sqls = sqlCaptor.getAllValues();
        List<Object[]> argsList = argsCaptor.getAllValues();
        boolean reset = false;
        for (int i = 0; i < sqls.size(); i++) {
            if (sqls.get(i).contains("rdm_score_record") && sqls.get(i).contains("push_status")) {
                assertEquals(RdmConstants.PUSH_NONE, argsList.get(i)[0], "撤回應把 push_status 回退為未推送");
                reset = true;
            }
        }
        assertTrue(reset, "撤回必須更新 rdm_score_record 的推送標記");
        assertEquals(RdmHrSuggestion.STATUS_WITHDRAWN, row.getStatus());
        verify(suggestionMapper).updateById(row);
    }
}
