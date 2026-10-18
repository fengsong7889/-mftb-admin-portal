package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.HrOperationCode;
import com.mftb.admin.entity.EmpPositionRecord;
import com.mftb.admin.entity.HrEmploymentPeriod;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.HrEmploymentPeriodMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 雇佣期间派生与登记测试（方案 §7.1 双轨口径）。
 * <p>重点钉住四条容易写错的分界：未来生效不提前切段、缺锚点一律不物化、
 * 人工确认的入职日不被派生覆盖、同步重跑不长第二条。
 */
class HrEmploymentPeriodTest {

    private static final long USER_ID = 77L;
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 18);

    private HrEmploymentPeriodMapper periodMapper;
    private EmpPositionRecordMapper recordMapper;
    private HrEmploymentPeriodServiceImpl service;

    /** 内存表：模拟「第一次 sync 插入的行，第二次 sync 能读到」，否则幂等断言毫无意义 */
    private final List<HrEmploymentPeriod> periodTable = new ArrayList<>();
    private final AtomicLong idSeq = new AtomicLong(100);

    @BeforeEach
    void setUp() {
        MapperBuilderAssistant assistant =
                new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, HrEmploymentPeriod.class);
        TableInfoHelper.initTableInfo(assistant, EmpPositionRecord.class);

        periodMapper = mock(HrEmploymentPeriodMapper.class);
        recordMapper = mock(EmpPositionRecordMapper.class);
        when(periodMapper.selectList(any(LambdaQueryWrapper.class))).thenAnswer(inv ->
                new ArrayList<>(periodTable));
        when(periodMapper.insert(any(HrEmploymentPeriod.class))).thenAnswer(inv -> {
            HrEmploymentPeriod entity = inv.getArgument(0);
            entity.setId(idSeq.getAndIncrement());
            periodTable.add(entity);
            return 1;
        });
        service = new HrEmploymentPeriodServiceImpl(periodMapper, recordMapper);
    }

    // ── 派生口径 ──

    @Test
    @DisplayName("入职 + 调动 + 转正折叠成一段，法人等字段按段内继承")
    void singlePeriodWithInheritedSnapshot() {
        stubRecords(
                record(1L, LocalDate.of(2024, 3, 1), 0, HrOperationCode.ONBOARD, "珠海闪蜂科技有限公司", null),
                record(2L, LocalDate.of(2024, 6, 1), 0, HrOperationCode.TRANSFER, null, null),
                record(3L, LocalDate.of(2024, 9, 15), 0, HrOperationCode.REGULAR, null, null));

        List<HrEmploymentPeriod> periods = HrEmploymentPeriodCalculator.derive(allRecords(), TODAY);

        assertEquals(1, periods.size());
        HrEmploymentPeriod period = periods.get(0);
        assertEquals(1, period.getPeriodSeq());
        assertEquals(LocalDate.of(2024, 3, 1), period.getStartDate());
        assertEquals(HrEmploymentPeriod.SOURCE_POSITION_RECORD, period.getStartDateSource());
        assertEquals(HrEmploymentPeriod.STATUS_ACTIVE, period.getStatus());
        assertNull(period.getEndDate());
        // 调动没写法人，段上仍是入职时那家 —— 逐条覆盖会把「没变化」读成「变成空」
        assertEquals("珠海闪蜂科技有限公司", period.getEmployerCompany());
        assertEquals(LocalDate.of(2024, 9, 15), period.getRegularDate());
    }

    @Test
    @DisplayName("未来生效的离职不提前结束本段")
    void futureDimissionDoesNotClosePeriodEarly() {
        stubRecords(
                record(1L, LocalDate.of(2025, 1, 1), 0, HrOperationCode.ONBOARD, null, null),
                record(2L, TODAY.plusDays(7), 0, HrOperationCode.DIMISSION, null, null));

        List<HrEmploymentPeriod> periods = HrEmploymentPeriodCalculator.derive(allRecords(), TODAY);

        assertEquals(1, periods.size());
        assertEquals(HrEmploymentPeriod.STATUS_ACTIVE, periods.get(0).getStatus());
        assertNull(periods.get(0).getEndDate(), "下周一才离职，今天这段不能先关掉");
    }

    @Test
    @DisplayName("离职后重新入职开出第二段，本次任职时长不续用上一段")
    void rehireOpensNewPeriod() {
        stubRecords(
                record(1L, LocalDate.of(2022, 5, 1), 0, HrOperationCode.ONBOARD, null, null),
                record(2L, LocalDate.of(2023, 4, 30), 0, HrOperationCode.DIMISSION, null, "個人原因"),
                record(3L, LocalDate.of(2024, 1, 2), 0, HrOperationCode.REHIRE, "珠海麥峰科技有限公司", null));

        List<HrEmploymentPeriod> periods = HrEmploymentPeriodCalculator.derive(allRecords(), TODAY);

        assertEquals(2, periods.size());
        assertEquals(HrEmploymentPeriod.STATUS_ENDED, periods.get(0).getStatus());
        assertEquals(LocalDate.of(2023, 4, 30), periods.get(0).getEndDate());
        // 上一段已经由离职记录正常闭合：返聘锚点不能把它改写成「缺离职记录」，
        // 否则真实离职原因被覆盖，并在核对清单里给 HR 一条假告警（端到端实测缺陷）。
        assertEquals("個人原因", periods.get(0).getEndReason(),
                "已闭合段落的离职原因必须保留，不能被 MISSING_DIMISSION_RECORD 覆掉");
        assertEquals(2, periods.get(1).getPeriodSeq());
        assertEquals(LocalDate.of(2024, 1, 2), periods.get(1).getStartDate());
        assertEquals("珠海麥峰科技有限公司", periods.get(1).getEmployerCompany());
    }

    @Test
    @DisplayName("没有入职锚点时什么都不派生（不得拿账号创建日补起点）")
    void noAnchorDerivesNothing() {
        stubRecords(record(1L, LocalDate.of(2024, 8, 1), 0, HrOperationCode.TRANSFER, null, null));

        assertTrue(HrEmploymentPeriodCalculator.derive(allRecords(), TODAY).isEmpty());
    }

    @Test
    @DisplayName("在职期间又出现入职却没有离职记录：截断前段但不编造结束日")
    void missingDimissionKeepsEndDateNull() {
        stubRecords(
                record(1L, LocalDate.of(2023, 1, 1), 0, HrOperationCode.ONBOARD, null, null),
                record(2L, LocalDate.of(2025, 1, 1), 0, HrOperationCode.ONBOARD, null, null));

        List<HrEmploymentPeriod> periods = HrEmploymentPeriodCalculator.derive(allRecords(), TODAY);

        assertEquals(2, periods.size());
        assertEquals(HrEmploymentPeriod.STATUS_ENDED, periods.get(0).getStatus());
        assertNull(periods.get(0).getEndDate(), "找不到离职记录时结束日必须留空，不能猜一个");
        assertEquals(HrEmploymentPeriodCalculator.END_REASON_MISSING_DIMISSION, periods.get(0).getEndReason());
    }

    // ── 登记（sync） ──

    @Test
    @DisplayName("sync 幂等：跑两遍不会长出第二条雇佣期间")
    void syncIsIdempotent() {
        stubRecords(record(1L, LocalDate.of(2024, 3, 1), 0, HrOperationCode.ONBOARD, null, null));

        assertEquals(1, service.syncFromRecords(USER_ID, "HR專員"));
        assertEquals(1, service.syncFromRecords(USER_ID, "HR專員"));

        assertEquals(1, periodTable.size());
        assertEquals(1, periodTable.get(0).getPeriodSeq());
        // 两次 sync 只开一次 insert；第二次必须走 update 已存在的行
        verify(periodMapper, times(1)).insert(any(HrEmploymentPeriod.class));
        verify(periodMapper, times(1)).updateById(any(HrEmploymentPeriod.class));
    }

    @Test
    @DisplayName("缺入职锚点时 sync 不写库，也不报错")
    void syncSkipsWhenNoAnchor() {
        stubRecords(record(1L, LocalDate.of(2024, 8, 1), 0, HrOperationCode.PROMOTION, null, null));

        assertEquals(0, service.syncFromRecords(USER_ID, "HR專員"));
        assertTrue(periodTable.isEmpty());
        verify(periodMapper, never()).insert(any(HrEmploymentPeriod.class));
    }

    @Test
    @DisplayName("HR 人工确认过的入职日不被派生值覆盖")
    void manualStartDateIsNotOverwritten() {
        stubRecords(record(1L, LocalDate.of(2024, 3, 1), 0, HrOperationCode.ONBOARD, null, null));
        service.syncFromRecords(USER_ID, "HR專員");
        // 模拟 HR 在差异清单上确认后手工订正为真实入职日
        HrEmploymentPeriod row = periodTable.get(0);
        row.setStartDate(LocalDate.of(2022, 11, 1));
        row.setStartDateSource(HrEmploymentPeriod.SOURCE_MANUAL);

        service.syncFromRecords(USER_ID, "HR專員");

        assertEquals(LocalDate.of(2022, 11, 1), periodTable.get(0).getStartDate(),
                "派生值不得把人工确认的入职日冲回异动登记日");
        assertEquals(HrEmploymentPeriod.SOURCE_MANUAL, periodTable.get(0).getStartDateSource());
    }

    @Test
    @DisplayName("登记后把任职记录反向挂到所属雇佣期间")
    void recordsLinkedToOwnedPeriod() {
        EmpPositionRecord onboard = record(1L, LocalDate.of(2024, 3, 1), 0, HrOperationCode.ONBOARD, null, null);
        EmpPositionRecord transfer = record(2L, LocalDate.of(2025, 5, 6), 0, HrOperationCode.TRANSFER, null, null);
        stubRecords(onboard, transfer);
        when(recordMapper.update(any(), any())).thenReturn(2);

        service.syncFromRecords(USER_ID, "HR專員");

        ArgumentCaptor<com.baomidou.mybatisplus.core.conditions.Wrapper<EmpPositionRecord>> captor =
                ArgumentCaptor.forClass(com.baomidou.mybatisplus.core.conditions.Wrapper.class);
        verify(recordMapper, org.mockito.Mockito.atLeastOnce()).update(any(), captor.capture());
        String sqlSet = captor.getAllValues().get(0).getSqlSet();
        assertTrue(sqlSet != null && sqlSet.contains("employment_period_id"),
                "未下推雇佣期间列: " + sqlSet);
    }

    // ── 夹具 ──

    private final List<EmpPositionRecord> records = new ArrayList<>();

    private void stubRecords(EmpPositionRecord... items) {
        records.clear();
        records.addAll(List.of(items));
        when(recordMapper.selectList(any(LambdaQueryWrapper.class))).thenAnswer(inv -> new ArrayList<>(records));
    }

    private List<EmpPositionRecord> allRecords() {
        return new ArrayList<>(records);
    }

    private EmpPositionRecord record(Long id, LocalDate effectiveDate, int seq, String code,
                                     String company, String reason) {
        EmpPositionRecord record = new EmpPositionRecord();
        record.setId(id);
        record.setUserId(USER_ID);
        record.setEffectiveDate(effectiveDate);
        record.setEffectiveSeq(seq);
        record.setOperationCode(code);
        record.setOperation(HrOperationCode.CODE_TO_NAME.get(code));
        record.setCompany(company);
        record.setReason(reason);
        record.setDeleted(0);
        return record;
    }
}
