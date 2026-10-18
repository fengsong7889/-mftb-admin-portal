package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.entity.AttException;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttMonthlySummary;
import com.mftb.admin.entity.AttPunchLog;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.mapper.AttDaySummaryMapper;
import com.mftb.admin.mapper.AttExceptionMapper;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttHolidayMapper;
import com.mftb.admin.mapper.AttMonthlySummaryMapper;
import com.mftb.admin.mapper.AttPunchLogMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.mapper.HrLeaveRequestMapper;
import com.mftb.admin.service.AttendanceSummaryService;
import com.mftb.admin.service.SysConfigService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 判定结果回写打卡流水的测试。
 * <p>
 * 回写必须是双向的：补卡或请假抵扣后当天不再迟到时，上一轮写的「遲到」要复位，
 * 否则打卡记录页显示迟到而日报显示正常，两个页面永远对不上——而薪酬是按日报取数的。
 * 同时外勤卡是人工认定的业务事实，任何自动判定都不得覆盖。
 */
class AttendanceJudgeWriteBackTest {

    private static final LocalDate DATE = LocalDate.of(2026, 10, 8);
    private static final Long GROUP_ID = 7L;
    private static final Long USER_ID = 101L;
    private static final Long SHIFT_ID = 9L;

    @Mock
    private AttGroupMapper groupMapper;
    @Mock
    private AttGroupMemberMapper memberMapper;
    @Mock
    private AttScheduleMapper scheduleMapper;
    @Mock
    private AttShiftMapper shiftMapper;
    @Mock
    private AttPunchLogMapper punchMapper;
    @Mock
    private AttExceptionMapper exceptionMapper;
    @Mock
    private AttDaySummaryMapper dayMapper;
    @Mock
    private AttMonthlySummaryMapper monthlyMapper;
    @Mock
    private AttHolidayMapper holidayMapper;
    @Mock
    private HrLeaveRequestMapper leaveMapper;
    @Mock
    private BizSeqService bizSeqService;
    @Mock
    private OperatorResolver operatorResolver;
    @Mock
    private SysConfigService sysConfigService;

    private AttendanceSummaryService service;

    /** select(SFunction...) 立即解析列名，纯单测需预热 lambda 缓存 */
    @BeforeAll
    static void initTableMetadata() {
        for (Class<?> entity : List.of(AttGroup.class, AttMonthlySummary.class, AttPunchLog.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new AttendanceSummaryServiceImpl(groupMapper, memberMapper, scheduleMapper, shiftMapper,
                punchMapper, exceptionMapper, dayMapper, monthlyMapper, holidayMapper, leaveMapper,
                bizSeqService, operatorResolver, sysConfigService, org.mockito.Mockito.mock(com.mftb.admin.service.OrgScopeService.class));
        when(operatorResolver.currentOperatorName()).thenReturn("陳小紅");
        when(sysConfigService.getConfigValueCached(anyString())).thenReturn(null);
        when(groupMapper.selectById(GROUP_ID)).thenReturn(fixedGroup());
        when(memberMapper.selectList(any())).thenReturn(List.of(member()));
        when(scheduleMapper.selectList(any())).thenReturn(List.of());
        when(shiftMapper.selectBatchIds(any())).thenReturn(List.of(shift()));
        when(leaveMapper.selectList(any())).thenReturn(List.of());
        when(monthlyMapper.selectList(any())).thenReturn(List.of());
        when(dayMapper.selectOne(any())).thenReturn(null);
        when(exceptionMapper.selectOne(any())).thenReturn(null);
    }

    @Test
    @DisplayName("迟到判定写到首卡，并生成对应异常")
    void marksLatePunchAndRaisesException() {
        AttPunchLog on = punch(1L, DATE.atTime(9, 23), AttPunchLog.TYPE_ON, AttPunchLog.RESULT_NORMAL);
        AttPunchLog off = punch(2L, DATE.atTime(18, 0), AttPunchLog.TYPE_OFF, AttPunchLog.RESULT_NORMAL);
        when(punchMapper.selectList(any())).thenReturn(List.of(on, off));

        service.recalculateDaily(DATE, DATE, GROUP_ID);

        assertEquals(AttPunchLog.RESULT_LATE, on.getResult(), "首卡必须被标成迟到，界面才能解释这张卡为什么异常");
        assertEquals(AttPunchLog.RESULT_NORMAL, off.getResult());
        ArgumentCaptor<AttException> captor = ArgumentCaptor.forClass(AttException.class);
        verify(exceptionMapper).insert(captor.capture());
        assertEquals(AttException.TYPE_LATE, captor.getValue().getExceptionType());
        assertEquals(23, captor.getValue().getLateMinutes(), "迟到分钟数是薪酬扣减口径，必须精确");
    }

    @Test
    @DisplayName("补卡后当天不再迟到：上一轮写的迟到标记必须复位，否则两个页面对不上")
    void resetsStaleLateMarkWhenNoLongerLate() {
        AttPunchLog on = punch(1L, DATE.atTime(9, 0), AttPunchLog.TYPE_ON, AttPunchLog.RESULT_LATE);
        AttPunchLog off = punch(2L, DATE.atTime(18, 0), AttPunchLog.TYPE_OFF, AttPunchLog.RESULT_EARLY);
        when(punchMapper.selectList(any())).thenReturn(List.of(on, off));

        service.recalculateDaily(DATE, DATE, GROUP_ID);

        assertEquals(AttPunchLog.RESULT_NORMAL, on.getResult(), "过期迟到标记未复位");
        assertEquals(AttPunchLog.RESULT_NORMAL, off.getResult(), "过期早退标记未复位");
        verify(punchMapper, org.mockito.Mockito.times(2)).updateById(any(AttPunchLog.class));
    }

    @Test
    @DisplayName("外勤卡是人工认定的业务事实，自动判定不得覆盖")
    void neverOverridesOutsidePunch() {
        AttPunchLog on = punch(1L, DATE.atTime(9, 40), AttPunchLog.TYPE_ON, AttPunchLog.RESULT_OUTSIDE);
        AttPunchLog off = punch(2L, DATE.atTime(18, 0), AttPunchLog.TYPE_OFF, AttPunchLog.RESULT_NORMAL);
        when(punchMapper.selectList(any())).thenReturn(List.of(on, off));

        service.recalculateDaily(DATE, DATE, GROUP_ID);

        assertEquals(AttPunchLog.RESULT_OUTSIDE, on.getResult(), "外勤卡被自动判定覆盖后，外勤事实就丢了");
        verify(punchMapper, never()).updateById(any(AttPunchLog.class));
    }

    @Test
    @DisplayName("判定正常时不产生多余写入：重算不该把整月打卡流水全部 update 一遍")
    void noWritesWhenJudgementUnchanged() {
        AttPunchLog on = punch(1L, DATE.atTime(8, 50), AttPunchLog.TYPE_ON, AttPunchLog.RESULT_NORMAL);
        AttPunchLog off = punch(2L, DATE.atTime(18, 10), AttPunchLog.TYPE_OFF, AttPunchLog.RESULT_NORMAL);
        when(punchMapper.selectList(any())).thenReturn(List.of(on, off));

        service.recalculateDaily(DATE, DATE, GROUP_ID);

        verify(punchMapper, never()).updateById(any(AttPunchLog.class));
        verify(exceptionMapper, never()).insert(any(AttException.class));
    }

    /* ==================== 测试数据 ==================== */

    private AttGroup fixedGroup() {
        AttGroup group = new AttGroup();
        group.setId(GROUP_ID);
        group.setGroupNo("AG2026100001");
        group.setGroupName("總部固定白班");
        group.setGroupType(AttGroup.TYPE_FIXED);
        group.setShiftId(SHIFT_ID);
        group.setLateGraceMin(0);
        group.setEarlyGraceMin(0);
        group.setStatus("enabled");
        return group;
    }

    private AttGroupMember member() {
        AttGroupMember member = new AttGroupMember();
        member.setGroupId(GROUP_ID);
        member.setUserId(USER_ID);
        member.setEmpNo("MF00123");
        member.setEmpName("李大偉");
        member.setValidFrom(DATE.minusMonths(1));
        return member;
    }

    private AttShift shift() {
        AttShift shift = new AttShift();
        shift.setId(SHIFT_ID);
        shift.setShiftCode("SH01");
        shift.setShiftName("標準白班 09:00-18:00");
        shift.setOnTime(LocalTime.of(9, 0));
        shift.setOffTime(LocalTime.of(18, 0));
        shift.setCrossDay(0);
        shift.setStatus("enabled");
        return shift;
    }

    private AttPunchLog punch(Long id, java.time.LocalDateTime at, int type, int result) {
        AttPunchLog log = new AttPunchLog();
        log.setId(id);
        log.setUserId(USER_ID);
        log.setGroupId(GROUP_ID);
        log.setWorkDate(DATE);
        log.setPunchAt(at);
        log.setPunchType(type);
        log.setSource(AttPunchLog.SOURCE_DINGTALK);
        log.setResult(result);
        return log;
    }
}
