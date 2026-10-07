package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmGovernanceDTO;
import com.mftb.admin.dto.RdmGovernanceVO;
import com.mftb.admin.entity.RdmHrSuggestion;
import com.mftb.admin.mapper.RdmHrSuggestionMapper;
import com.mftb.admin.mapper.RdmScoreBudgetMapper;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 绩效治理守卫测试（阶段 6）。
 * <p>锁死的是「数字进考核之前必须有人签字，且签了还能撤」这条链：
 * 无依据不出建议、超限无说明不确认、重复复核拒绝、不能复核自己、
 * 撤回必须写原因、预算必须写依据。
 */
class RdmGovernanceGuardTest {

    private RdmHrSuggestionMapper suggestionMapper;
    private OperatorResolver operatorResolver;
    private RdmGovernanceService service;

    private static final long REVIEWER = 21L;

    @BeforeEach
    void setUp() {
        suggestionMapper = mock(RdmHrSuggestionMapper.class);
        operatorResolver = mock(OperatorResolver.class);
        service = new RdmGovernanceService(mock(RdmScoreBudgetMapper.class), suggestionMapper,
                operatorResolver, mock(JdbcTemplate.class));
        SysUser reviewer = new SysUser();
        reviewer.setId(REVIEWER);
        reviewer.setEmpId("MF00021");
        reviewer.setName("陳雅婷");
        when(operatorResolver.currentUser()).thenReturn(reviewer);
        when(operatorResolver.operatorSignature(any())).thenReturn("MF00021|陳雅婷");
    }

    private RdmHrSuggestion suggestion(String status, boolean overBudget) {
        RdmHrSuggestion row = new RdmHrSuggestion();
        row.setId(3L);
        row.setPeriodCode("2026Q4");
        row.setUserId(41L);
        row.setUserName("李四");
        row.setDeptId(7L);
        row.setTotalScore(new BigDecimal("120.00"));
        row.setRecordCount(6);
        row.setOverBudget(overBudget ? 1 : 0);
        row.setStatus(status);
        return row;
    }

    private RdmGovernanceDTO.Review reviewForm(boolean confirmed, String remark) {
        RdmGovernanceDTO.Review form = new RdmGovernanceDTO.Review();
        form.setConfirmed(confirmed);
        form.setRemark(remark);
        return form;
    }

    @Test
    @DisplayName("预算必须写依据，否则只是可以被随心改动的数字")
    void budgetRequiresBasis() {
        RdmGovernanceDTO.Budget form = new RdmGovernanceDTO.Budget();
        form.setPeriodCode("2026Q4");
        form.setScoreBudget(new BigDecimal("1000"));

        BusinessException noRemark = assertThrows(BusinessException.class, () -> service.saveBudget(form));
        assertTrue(noRemark.getMessage().contains("依據"), noRemark.getMessage());

        form.setRemark("按 4 人 × 20 個工日折算");
        form.setScoreBudget(BigDecimal.ZERO);
        assertThrows(BusinessException.class, () -> service.saveBudget(form), "预算上限必须大于 0");
    }

    @Test
    @DisplayName("周期不存在时直接拒绝，不静默用最近的周期做写操作")
    void unknownPeriodRejected() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        RdmGovernanceService withJdbc = new RdmGovernanceService(mock(RdmScoreBudgetMapper.class), suggestionMapper,
                operatorResolver, jdbc);
        when(jdbc.queryForList(anyString(), any(Class.class), any(Object[].class))).thenReturn(java.util.List.of());

        BusinessException ex = assertThrows(BusinessException.class,
                () -> withJdbc.suggestions("NOT_EXIST", null, null));
        assertTrue(ex.getMessage().contains("績效周期不存在"), ex.getMessage());
    }

    @Test
    @DisplayName("超预算的人没有复核说明不能确认")
    void overBudgetNeedsRemark() {
        when(suggestionMapper.selectById(3L)).thenReturn(suggestion(RdmHrSuggestion.STATUS_DRAFT, true));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.review(3L, reviewForm(true, null)));
        assertTrue(ex.getMessage().contains("超出部門預算"), ex.getMessage());
    }

    @Test
    @DisplayName("驳回必须写原因；重复复核与自审一律拒绝")
    void reviewGuards() {
        when(suggestionMapper.selectById(3L)).thenReturn(suggestion(RdmHrSuggestion.STATUS_DRAFT, false));
        assertThrows(BusinessException.class, () -> service.review(3L, reviewForm(false, "  ")));

        RdmHrSuggestion confirmed = suggestion(RdmHrSuggestion.STATUS_CONFIRMED, false);
        when(suggestionMapper.selectById(4L)).thenReturn(confirmed);
        BusinessException twice = assertThrows(BusinessException.class, () -> service.review(4L, reviewForm(true, "ok")));
        assertTrue(twice.getMessage().contains("不可重複操作"), twice.getMessage());

        // 复核人就是被建议人：自己给自己确认绩效
        RdmHrSuggestion self = suggestion(RdmHrSuggestion.STATUS_DRAFT, false);
        self.setUserId(REVIEWER);
        when(suggestionMapper.selectById(5L)).thenReturn(self);
        BusinessException mine = assertThrows(BusinessException.class, () -> service.review(5L, reviewForm(true, "ok")));
        assertTrue(mine.getMessage().contains("不能復核自己"), mine.getMessage());
    }

    /**
     * 管理员例外是刻意开的口子（单人环境与运维应急），但必须被钉住：
     * 它只放宽“自己复核自己的建议”，不放宽超限无说明、重复复核等其他闸门。
     */
    @Test
    @DisplayName("系统管理员可自审（运维应急例外），但超限无说明仍被拦")
    void adminSelfReviewIsAllowedButOtherGuardsStay() {
        SysUser admin = new SysUser();
        admin.setId(41L);
        admin.setEmpId("MF00001");
        admin.setName("管理员");
        when(operatorResolver.currentUser()).thenReturn(admin);
        when(operatorResolver.isAdmin(any())).thenReturn(true);

        RdmHrSuggestion self = suggestion(RdmHrSuggestion.STATUS_DRAFT, false);
        when(suggestionMapper.selectById(6L)).thenReturn(self);
        com.mftb.admin.dto.RdmGovernanceVO.Suggestion reviewed = service.review(6L, reviewForm(true, "已逐条核对流水"));
        assertEquals(RdmHrSuggestion.STATUS_CONFIRMED, reviewed.getStatus());

        // 例外不是免死金牌：超限且无说明依旧必须拒绝
        RdmHrSuggestion over = suggestion(RdmHrSuggestion.STATUS_DRAFT, true);
        when(suggestionMapper.selectById(7L)).thenReturn(over);
        BusinessException blocked = assertThrows(BusinessException.class,
                () -> service.review(7L, reviewForm(true, null)));
        assertTrue(blocked.getMessage().contains("超出部門預算"), blocked.getMessage());
    }

    @Test
    @DisplayName("没有已确认的建议不能推送")
    void pushRequiresConfirmed() {
        when(suggestionMapper.selectList(any())).thenReturn(java.util.List.of());
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        RdmGovernanceService withJdbc = new RdmGovernanceService(mock(RdmScoreBudgetMapper.class), suggestionMapper,
                operatorResolver, jdbc);
        when(jdbc.queryForList(anyString(), any(Class.class), any(Object[].class))).thenReturn(java.util.List.of("2026Q4"));

        BusinessException ex = assertThrows(BusinessException.class, () -> withJdbc.push("2026Q4"));
        assertTrue(ex.getMessage().contains("沒有已確認的建議"), ex.getMessage());
    }

    @Test
    @DisplayName("只有已推送的建议可撤回，且必须写原因")
    void withdrawGuards() {
        when(suggestionMapper.selectById(3L)).thenReturn(suggestion(RdmHrSuggestion.STATUS_DRAFT, false));
        BusinessException wrong = assertThrows(BusinessException.class, () -> service.withdraw(3L, "算了"));
        assertTrue(wrong.getMessage().contains("只有已推送"), wrong.getMessage());

        when(suggestionMapper.selectById(6L)).thenReturn(suggestion(RdmHrSuggestion.STATUS_PUSHED, false));
        assertThrows(BusinessException.class, () -> service.withdraw(6L, "  "), "撤回必须写原因");
    }

    /**
     * 视图要说明“为什么不能操作”，而不是只把按钮藏起来。
     * <p>只藏按钮的结局是用户反复刷新重试：PMO 看到“没有依据”才知道要先跑积分重算。
     */
    @Test
    @DisplayName("不可操作时返回具体原因")
    void suggestionsExposeBlockedReason() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        RdmGovernanceService withJdbc = new RdmGovernanceService(mock(RdmScoreBudgetMapper.class), suggestionMapper,
                operatorResolver, jdbc);
        when(jdbc.queryForList(anyString(), any(Class.class), any(Object[].class))).thenReturn(java.util.List.of("2026Q4"));
        RdmHrSuggestion noBasis = suggestion(RdmHrSuggestion.STATUS_DRAFT, false);
        noBasis.setRecordCount(0);
        RdmHrSuggestion pushed = suggestion(RdmHrSuggestion.STATUS_PUSHED, false);
        pushed.setId(9L);
        when(suggestionMapper.selectList(any())).thenReturn(java.util.List.of(noBasis, pushed));

        java.util.List<RdmGovernanceVO.Suggestion> list = withJdbc.suggestions("2026Q4", null, null);

        assertEquals(2, list.size());
        assertFalse(list.get(0).getActionable());
        assertTrue(list.get(0).getBlockedReason().contains("沒有積分流水"), list.get(0).getBlockedReason());
        assertFalse(list.get(1).getActionable());
        assertTrue(list.get(1).getBlockedReason().contains("只能撤回"), list.get(1).getBlockedReason());
    }
}
