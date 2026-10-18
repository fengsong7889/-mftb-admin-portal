package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.service.HrAssignmentQuery;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 统一 as-of 解析测试（方案 §3.2 P0「生效日期口径分裂」的验收）。
 * <p>
 * 覆盖最容易出错的三种形状：同一天两次异动、未来生效的异动、离职后重新入职。
 * 断言方式是「给一批记录，问某个时点答案是什么」，而不是「SQL 里有没有某个条件」——
 * 条件写法会变，答案不能变。
 */
class HrAssignmentQueryTest {

    private static final long USER = 24L;
    private static final LocalDate D1 = LocalDate.of(2026, 3, 1);
    private static final LocalDate D2 = LocalDate.of(2026, 6, 1);
    private static final LocalDate D3 = LocalDate.of(2026, 9, 1);

    private EmpPositionRecordMapper mapper;
    private HrAssignmentQueryImpl query;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""),
                EmpPositionRecord.class);
        mapper = mock(EmpPositionRecordMapper.class);
        query = new HrAssignmentQueryImpl(mapper);
    }

    private static EmpPositionRecord record(LocalDate date, int seq, String code, String name) {
        EmpPositionRecord r = new EmpPositionRecord();
        r.setUserId(USER);
        r.setEffectiveDate(date);
        r.setEffectiveSeq(seq);
        r.setOperationCode(code);
        r.setOperation(name);
        return r;
    }

    /** 让 mock 按「生效日倒序 + 同日序号倒序」返回，与真实 SQL 的排序一致 */
    private void stubReturns(List<EmpPositionRecord> rows) {
        when(mapper.selectList(any())).thenAnswer(inv -> rows.stream()
                .sorted((a, b) -> {
                    int byDate = b.getEffectiveDate().compareTo(a.getEffectiveDate());
                    return byDate != 0 ? byDate
                            : Integer.compare(b.getEffectiveSeq(), a.getEffectiveSeq());
                })
                .toList());
    }

    @Test
    @DisplayName("同一天两次异动：按同日序号取最后一条，而不是取第一次录入的")
    void sameDayTwoChangesTakeLastSeq() {
        stubReturns(List.of(
                record(D2, 0, HrOperationCode.TRANSFER, "调动"),
                record(D2, 1, HrOperationCode.PROMOTION, "晋升")));

        var current = query.asOf(USER, D2);

        assertTrue(current.isPresent());
        assertEquals(HrOperationCode.PROMOTION, current.get().getOperationCode());
    }

    @Test
    @DisplayName("未来生效的离职不提前生效：今天仍是在职，明天才是离职")
    void futureDimissionDoesNotLeakBack() {
        stubReturns(List.of(
                record(D1, 0, HrOperationCode.ONBOARD, "入职"),
                record(D3, 0, HrOperationCode.DIMISSION, "离职")));
        // 服务层已按 effective_date <= 查询日 下推，mock 这里模拟数据库只返回到 6/1 为止的记录
        when(mapper.selectList(any())).thenReturn(List.of(record(D1, 0, HrOperationCode.ONBOARD, "入职")));

        assertEquals(HrAssignmentQuery.STATUS_ACTIVE, query.employmentStatusOf(USER, D2));
    }

    @Test
    @DisplayName("查询条件下推了「生效日 <= 查询日」，不是取全表最新一条")
    void conditionPushesAsOfDate() {
        stubReturns(List.of());

        query.employmentStatusOf(USER, D2);

        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<EmpPositionRecord>> captor =
                ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper.class);
        verify(mapper).selectList(captor.capture());
        String sql = captor.getValue().getSqlSegment();
        // 只断言「下推了 as-of 上界与用户条件」，不锁 MyBatis-Plus 的空白格式
        assertTrue(sql.contains("effective_date") && sql.contains("<="),
                "未下推 as-of 上界: " + sql);
        assertTrue(sql.contains("user_id"), "未下推用户条件: " + sql);
    }

    @Test
    @DisplayName("离职后重新入职：新入职记录开启新的雇佣起点")
    void rehireStartsNewEmployment() {
        EmpPositionRecord rehire = record(D3, 0, HrOperationCode.REHIRE, "重新入职");
        stubReturns(List.of(
                record(D1, 0, HrOperationCode.ONBOARD, "入职"),
                record(D2, 0, HrOperationCode.DIMISSION, "离职"),
                rehire));

        assertEquals(D3, query.currentEmploymentStart(USER, D3).orElseThrow());
        assertEquals(HrAssignmentQuery.STATUS_ACTIVE, query.employmentStatusOf(USER, D3));
    }

    @Test
    @DisplayName("没有任何生效记录时按在职处理（补录前的账号不该被误判离职）")
    void noRecordMeansActive() {
        stubReturns(List.of());

        assertEquals(HrAssignmentQuery.STATUS_ACTIVE, query.employmentStatusOf(USER, D1));
    }

    @Test
    @DisplayName("批量派生不丢人也不 N+1：一次查询覆盖全部用户")
    void batchDerivationIsSingleQuery() {
        EmpPositionRecord other = record(D2, 0, HrOperationCode.DIMISSION, "离职");
        other.setUserId(25L);
        stubReturns(List.of(record(D2, 0, HrOperationCode.ONBOARD, "入职"), other));

        Map<Long, String> statuses = query.employmentStatusOf(List.of(USER, 25L, 26L), D2);

        verify(mapper).selectList(any());
        assertEquals(HrAssignmentQuery.STATUS_ACTIVE, statuses.get(USER));
        assertEquals(HrAssignmentQuery.STATUS_RESIGNED, statuses.get(25L));
        // 入参里的第 3 个人没有记录：必须给出 active，不能从结果里消失导致界面显示空
        assertEquals(HrAssignmentQuery.STATUS_ACTIVE, statuses.get(26L));
    }

    @Test
    @DisplayName("未回填 code 的历史行退回名称判定，不改判事实")
    void legacyRowsWithoutCodeFallBackToName() {
        stubReturns(List.of(record(D2, 0, null, "離職")));

        assertEquals(HrAssignmentQuery.STATUS_RESIGNED, query.employmentStatusOf(USER, D2));
    }
}

