package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttGroupMember;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttGroupMemberMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.impl.AttendanceGroupServiceImpl;
import com.mftb.admin.util.BizSeqService;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 考勤组成员差量与主数据校验测试。
 * <p>
 * 成员维护是考勤最容易做错的一块：全量覆盖会丢掉历史归属，物理删除会让已冻结月份
 * 追溯不到人，一人挂两个组会让同一次打卡被两个组各算一遍。这里把三条口径钉成断言。
 */
class AttendanceGroupMemberTest {

    @Mock
    private AttGroupMapper groupMapper;
    @Mock
    private AttGroupMemberMapper memberMapper;
    @Mock
    private AttShiftMapper shiftMapper;
    @Mock
    private AttScheduleMapper scheduleMapper;
    @Mock
    private SysUserMapper sysUserMapper;
    @Mock
    private BizSeqService bizSeqService;
    @Mock
    private OperatorResolver operatorResolver;

    private AttendanceGroupService service;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        service = new AttendanceGroupServiceImpl(groupMapper, memberMapper, shiftMapper, scheduleMapper,
                sysUserMapper, bizSeqService, operatorResolver, org.mockito.Mockito.mock(com.mftb.admin.service.OrgScopeService.class));
        when(operatorResolver.currentOperatorName()).thenReturn("陳小紅");
        when(groupMapper.selectById(1L)).thenReturn(group());
    }

    private AttGroup group() {
        AttGroup group = new AttGroup();
        group.setId(1L);
        group.setGroupNo("AG2026100001");
        group.setGroupName("總部職能考勤組");
        group.setGroupType(AttGroup.TYPE_FIXED);
        group.setScopeType(1);
        group.setWorkPlace("珠海·本部辦公樓");
        group.setShiftId(9L);
        group.setLateGraceMin(5);
        group.setEarlyGraceMin(0);
        group.setPunchSources("1");
        group.setStatus("enabled");
        return group;
    }

    private AttGroupMember member(long userId, String name) {
        AttGroupMember member = new AttGroupMember();
        member.setId(userId * 10);
        member.setGroupId(1L);
        member.setUserId(userId);
        member.setEmpNo("MF00" + userId);
        member.setEmpName(name);
        member.setValidFrom(LocalDate.of(2026, 1, 1));
        return member;
    }

    private SysUser user(long id, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setEmpId("MF00" + id);
        user.setName(name);
        user.setDepartmentId(66L);
        user.setDepartment("門店營運部");
        return user;
    }

    @Test
    @DisplayName("移除成员只闭合生效止，不物理删除；新增成员从今天起算")
    void syncMembersClosesPeriodInsteadOfDeleting() {
        // 第一次 selectList = 当前生效成员（101 留下、102 移出）；第二次 = 跨组冲突查询
        when(memberMapper.selectList(any()))
                .thenReturn(List.of(member(101L, "趙麗"), member(102L, "孫磊")))
                .thenReturn(List.of());
        when(sysUserMapper.selectBatchIds(anyList())).thenReturn(List.of(user(201L, "周婷")));

        Map<String, Object> summary = service.syncMembers(1L, List.of(101L, 201L));

        assertEquals(1, summary.get("closed"));
        assertEquals(1, summary.get("added"));
        ArgumentCaptor<AttGroupMember> updated = ArgumentCaptor.forClass(AttGroupMember.class);
        verify(memberMapper).updateById(updated.capture());
        AttGroupMember closed = updated.getValue();
        assertEquals(102L, closed.getUserId());
        assertEquals(LocalDate.now().minusDays(1), closed.getValidTo(), "生效止应闭合到昨天，保留历史归属");
        assertNull(closed.getDeleted(), "不得借更新之名行删除之实");

        ArgumentCaptor<AttGroupMember> inserted = ArgumentCaptor.forClass(AttGroupMember.class);
        verify(memberMapper).insert(inserted.capture());
        AttGroupMember added = inserted.getValue();
        assertEquals(201L, added.getUserId());
        assertEquals(LocalDate.now(), added.getValidFrom(), "新期间从今天起，不能改写历史行");
        assertNull(added.getValidTo());
        // 名称快照来自 sys_user，列表页不再逐行回查
        assertEquals("MF00201", added.getEmpNo());
        assertEquals("門店營運部", added.getDeptName());
        assertEquals("陳小紅", added.getUpdatedBy());
    }

    @Test
    @DisplayName("已在其他考勤组生效的员工不得重复入组，报错必须点名是谁在哪个组")
    void rejectsEmployeeAlreadyActiveInAnotherGroup() {
        AttGroupMember conflict = member(101L, "趙麗");
        conflict.setGroupId(7L);
        when(memberMapper.selectList(any())).thenReturn(List.of()).thenReturn(List.of(conflict));
        when(groupMapper.selectById(7L)).thenReturn(otherGroup());

        BusinessException error = assertThrows(BusinessException.class,
                () -> service.syncMembers(1L, List.of(101L)));
        assertTrue(error.getMessage().contains("趙麗"), "必须点名冲突员工，否则管理员无法定位");
        assertTrue(error.getMessage().contains("門店輪班考勤組"), "必须点名冲突考勤组");
        verify(memberMapper, never()).insert(any(AttGroupMember.class));
    }

    @Test
    @DisplayName("固定班制必须关联启用中的班次")
    void requiresEnabledShiftForFixedScheduleGroup() {
        AttGroup group = group();
        group.setShiftId(null);
        BusinessException missing = assertThrows(BusinessException.class, () -> service.save(group));
        assertTrue(missing.getMessage().contains("固定班制"));

        AttGroup withDisabled = group();
        withDisabled.setId(2L);
        AttShift disabled = new AttShift();
        disabled.setId(9L);
        disabled.setShiftName("標準白班");
        disabled.setStatus("disabled");
        when(shiftMapper.selectById(9L)).thenReturn(disabled);
        BusinessException off = assertThrows(BusinessException.class, () -> service.save(withDisabled));
        assertTrue(off.getMessage().contains("已停用"));
    }

    @Test
    @DisplayName("编号由服务端掌控：新建强制取号并忽略前端传入，编辑保留原编号；状态按表单意图生效")
    void serverOwnsGroupNoAndStatus() {
        when(groupMapper.selectCount(any())).thenReturn(0L);
        when(shiftMapper.selectById(9L)).thenReturn(enabledShift());
        when(bizSeqService.next(BizSeqService.RULE_ATTENDANCE_GROUP)).thenReturn("AG2026100007");
        when(groupMapper.selectById(null)).thenReturn(null);

        // 新建：前端伪造的编号必须被丢掉，表单里选的“停用”则应尊重
        AttGroup created = group();
        created.setId(null);
        created.setGroupNo("前端伪造编号");
        created.setStatus("disabled");
        service.save(created);

        ArgumentCaptor<AttGroup> insert = ArgumentCaptor.forClass(AttGroup.class);
        verify(groupMapper).insert(insert.capture());
        assertEquals("AG2026100007", insert.getValue().getGroupNo(), "稳定身份只能由服务端生成");
        assertEquals("disabled", insert.getValue().getStatus(), "新建时就选了停用，应尊重表单意图");

        // 新建未传状态 → 默认启用
        AttGroup blankStatus = group();
        blankStatus.setId(null);
        blankStatus.setGroupNo(null);
        blankStatus.setStatus(null);
        service.save(blankStatus);
        ArgumentCaptor<AttGroup> inserts = ArgumentCaptor.forClass(AttGroup.class);
        verify(groupMapper, org.mockito.Mockito.times(2)).insert(inserts.capture());
        assertEquals("enabled", inserts.getAllValues().get(1).getStatus(), "未传状态时默认启用");

        // 编辑：未传状态保留原值；传了则按表单意图修改（之前的实现把提交值强制回退，表单开关会静默失效）
        AttGroup edited = group();
        edited.setGroupNo("前端伪造编号");
        edited.setStatus(null);
        service.save(edited);
        AttGroup editedOff = group();
        editedOff.setStatus("disabled");
        service.save(editedOff);

        ArgumentCaptor<AttGroup> update = ArgumentCaptor.forClass(AttGroup.class);
        verify(groupMapper, org.mockito.Mockito.times(2)).updateById(update.capture());
        List<AttGroup> updates = update.getAllValues();
        assertEquals("AG2026100001", updates.get(0).getGroupNo(), "编辑不得改写已发号的编号");
        assertEquals("enabled", updates.get(0).getStatus(), "未传状态时保留原值");
        assertEquals("disabled", updates.get(1).getStatus(), "表单里关掉就要真的关掉");
    }

    @Test
    @DisplayName("已有成员或排班的考勤组禁止删除，只能停用")
    void refusesToDeleteGroupWithHistory() {
        when(memberMapper.selectCount(any())).thenReturn(3L);
        BusinessException error = assertThrows(BusinessException.class, () -> service.delete(1L));
        assertTrue(error.getMessage().contains("停用"));
        verify(groupMapper, never()).deleteById(1L);

        when(memberMapper.selectCount(any())).thenReturn(0L);
        when(scheduleMapper.selectCount(any())).thenReturn(5L);
        assertThrows(BusinessException.class, () -> service.delete(1L));
        verify(groupMapper, never()).deleteById(1L);
    }

    private AttGroup otherGroup() {
        AttGroup group = new AttGroup();
        group.setId(7L);
        group.setGroupName("門店輪班考勤組");
        return group;
    }

    private AttShift enabledShift() {
        AttShift shift = new AttShift();
        shift.setId(9L);
        shift.setShiftCode("SH01");
        shift.setShiftName("標準白班 09:00-18:00");
        shift.setStatus("enabled");
        return shift;
    }
}
