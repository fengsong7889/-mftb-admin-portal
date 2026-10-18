package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AttendanceScheduleSaveRequest;
import com.mftb.admin.dto.AttendanceScheduleVO;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttSchedule;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.service.impl.AttendanceScheduleServiceImpl;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 排班服务测试。
 * <p>锁住三件容易做错的事：漏排与排休必须是两种状态、非本组成员不能排进来、
 * 停用班次不能进新班表（但历史班表仍要能显示当时的班次名）。
 */
class AttendanceScheduleServiceTest {

    @Mock
    private AttGroupMapper groupMapper;
    @Mock
    private AttGroupMemberMapper memberMapper;
    @Mock
    private AttScheduleMapper scheduleMapper;
    @Mock
    private AttShiftMapper shiftMapper;
    @Mock
    private OperatorResolver operatorResolver;

    private AttendanceScheduleService service;

    private final LocalDate monday = LocalDate.of(2026, 10, 5);

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new AttendanceScheduleServiceImpl(groupMapper, memberMapper, scheduleMapper, shiftMapper, operatorResolver, org.mockito.Mockito.mock(com.mftb.admin.service.OrgScopeService.class));
        when(operatorResolver.currentOperatorName()).thenReturn("李大偉");
        when(groupMapper.selectById(1L)).thenReturn(group());
    }

    private AttGroup group() {
        AttGroup group = new AttGroup();
        group.setId(1L);
        group.setGroupName("門店輪班考勤組（華南）");
        group.setGroupType(AttGroup.TYPE_ROTATION);
        group.setStatus("enabled");
        return group;
    }

    private AttGroupMember member(long userId, String name) {
        AttGroupMember member = new AttGroupMember();
        member.setGroupId(1L);
        member.setUserId(userId);
        member.setEmpNo("MF00" + userId);
        member.setEmpName(name);
        member.setDeptName("門店營運部");
        member.setValidFrom(LocalDate.of(2026, 1, 1));
        return member;
    }

    private AttShift shift(long id, String status) {
        AttShift shift = new AttShift();
        shift.setId(id);
        shift.setShiftCode("SH02");
        shift.setShiftName("門店早班 08:00-17:00");
        shift.setStatus(status);
        return shift;
    }

    private AttendanceScheduleSaveRequest request(AttendanceScheduleSaveRequest.Entry... entries) {
        AttendanceScheduleSaveRequest request = new AttendanceScheduleSaveRequest();
        request.setGroupId(1L);
        request.setEntries(List.of(entries));
        return request;
    }

    private AttendanceScheduleSaveRequest.Entry entry(Long userId, LocalDate date, Long shiftId) {
        AttendanceScheduleSaveRequest.Entry entry = new AttendanceScheduleSaveRequest.Entry();
        entry.setUserId(userId);
        entry.setWorkDate(date);
        entry.setShiftId(shiftId);
        return entry;
    }

    @Test
    @DisplayName("给不属于该考勤组的人排班直接拒绝，且不写库")
    void rejectsNonMember() {
        when(memberMapper.selectCount(any())).thenReturn(0L);
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.save(request(entry(999L, monday, 9L))));
        assertTrue(error.getMessage().contains("考勤組"));
        verify(scheduleMapper, never()).insert(any(AttSchedule.class));
        verify(scheduleMapper, never()).updateById(any(AttSchedule.class));
    }

    @Test
    @DisplayName("停用中的班次不能排进新班表")
    void rejectsDisabledShift() {
        when(memberMapper.selectCount(any())).thenReturn(1L);
        when(shiftMapper.selectById(9L)).thenReturn(shift(9L, "disabled"));
        BusinessException error = assertThrows(BusinessException.class,
                () -> service.save(request(entry(101L, monday, 9L))));
        assertTrue(error.getMessage().contains("已停用"));
        verify(scheduleMapper, never()).insert(any(AttSchedule.class));
    }

    @Test
    @DisplayName("新建排班带成员快照；shiftId 为空即显式排休，与漏排区分开")
    void insertsSnapshotAndRestDay() {
        when(memberMapper.selectCount(any())).thenReturn(1L);
        when(shiftMapper.selectById(9L)).thenReturn(shift(9L, "enabled"));
        when(scheduleMapper.selectOne(any())).thenReturn(null);
        when(memberMapper.selectOne(any())).thenReturn(member(101L, "趙麗"));

        service.save(request(entry(101L, monday, 9L), entry(101L, monday.plusDays(1), null)));

        ArgumentCaptor<AttSchedule> inserted = ArgumentCaptor.forClass(AttSchedule.class);
        verify(scheduleMapper, org.mockito.Mockito.times(2)).insert(inserted.capture());
        List<AttSchedule> rows = inserted.getAllValues();
        assertEquals("MF00101", rows.get(0).getEmpNo(), "工号姓名按快照落库，列表页不再逐行回查");
        assertEquals(9L, rows.get(0).getShiftId());
        assertNull(rows.get(1).getShiftId(), "第二格是排休");
        assertEquals(1, rows.get(0).getSource());
    }

    @Test
    @DisplayName("同一人同一天已排班时走更新，不新增第二条结论")
    void updatesExistingCellInsteadOfDuplicating() {
        when(memberMapper.selectCount(any())).thenReturn(1L);
        when(shiftMapper.selectById(9L)).thenReturn(shift(9L, "enabled"));
        AttSchedule existing = new AttSchedule();
        existing.setId(555L);
        existing.setUserId(101L);
        existing.setWorkDate(monday);
        existing.setShiftId(3L);
        when(scheduleMapper.selectOne(any())).thenReturn(existing);

        service.save(request(entry(101L, monday, 9L)));

        ArgumentCaptor<AttSchedule> updated = ArgumentCaptor.forClass(AttSchedule.class);
        verify(scheduleMapper).updateById(updated.capture());
        assertEquals(555L, updated.getValue().getId(), "复用原行，唯一键才不会被第二条结论撞掉");
        assertEquals(9L, updated.getValue().getShiftId());
        verify(scheduleMapper, never()).insert(any(AttSchedule.class));
    }

    @Test
    @DisplayName("周视图把「排休」和「没排班」渲染成两种状态，并统计整周未排班人数")
    void weekDistinguishesRestFromUnscheduled() {
        when(memberMapper.selectList(any())).thenReturn(List.of(member(101L, "趙麗"), member(102L, "孫磊")));
        AttSchedule rest = new AttSchedule();
        rest.setId(7L);
        rest.setUserId(101L);
        rest.setWorkDate(monday);
        when(scheduleMapper.selectList(any())).thenReturn(List.of(rest));
        when(scheduleMapper.selectBatchIds(any())).thenReturn(List.of());

        AttendanceScheduleVO week = service.week(1L, monday);

        assertEquals(2, week.getRows().size());
        AttendanceScheduleVO.Cell restCell = week.getRows().get(0).getCells().get(monday.toString());
        assertTrue(restCell.isRest(), "有记录但无班次 = 排休");
        assertFalse(restCell.getShiftId() != null);
        assertNull(week.getRows().get(1).getCells().get(monday.toString()), "没记录 = 漏排，前端要显示为空而不是「休」");
        // 两人都没有真正上班的班次，都算整周未排班
        assertEquals(2L, week.getUnscheduledCount());
    }

    @Test
    @DisplayName("复制整周时源周为空直接拒绝，避免把目标周清空")
    void refusesToCopyEmptySourceWeek() {
        when(scheduleMapper.selectList(any())).thenReturn(List.of());
        assertThrows(BusinessException.class, () -> service.copyWeek(1L, monday, monday.plusWeeks(1)));
        verify(scheduleMapper, never()).insert(any(AttSchedule.class));
    }

    @Test
    @DisplayName("统计口径来自周视图本身，不另发一次查询")
    void statsReuseWeekView() {
        when(memberMapper.selectList(any())).thenReturn(List.of(member(101L, "趙麗")));
        when(scheduleMapper.selectList(any())).thenReturn(List.of());
        Map<String, Object> stats = service.stats(1L, monday);
        assertEquals(1, stats.get("staff"));
        assertEquals(0, stats.get("scheduled"));
        assertEquals(1L, stats.get("unscheduled"));
    }
}
