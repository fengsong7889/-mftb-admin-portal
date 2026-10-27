package com.mftb.admin.service.impl;

import com.mftb.admin.entity.AttGroup;
import com.mftb.admin.entity.AttHoliday;
import com.mftb.admin.entity.AttShift;
import com.mftb.admin.mapper.AttGroupMapper;
import com.mftb.admin.mapper.AttScheduleMapper;
import com.mftb.admin.mapper.AttShiftMapper;
import com.mftb.admin.service.AttendanceShiftService;
import com.mftb.admin.util.AttendanceWriteGuard;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.LocalTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 主数据写入守卫测试。
 * <p>
 * 主数据接口直接用实体当 {@code @RequestBody}，等于把整张表的列开放给前端。
 * 这里钉住两条：软删标记与审计字段必须由服务端掌控，稳定编号（班次编码）不接受编辑改写。
 */
class AttendanceWriteGuardTest {

    @Mock
    private AttShiftMapper shiftMapper;
    @Mock
    private AttGroupMapper groupMapper;
    @Mock
    private AttScheduleMapper scheduleMapper;
    @Mock
    private OperatorResolver operatorResolver;

    private AttendanceShiftService shiftService;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        shiftService = new AttendanceShiftServiceImpl(shiftMapper, groupMapper, scheduleMapper, operatorResolver);
        when(operatorResolver.currentOperatorName()).thenReturn("陳小紅");
    }

    @Test
    @DisplayName("三类主数据实体的软删标记与审计字段一律被清空")
    void stripsClientControlledFields() {
        AttShift shift = new AttShift();
        shift.setDeleted(1);
        shift.setCreatedBy("偽造人");
        shift.setCreatedAt(LocalDateTime.of(2020, 1, 1, 0, 0));
        shift.setUpdatedBy("偽造人");
        shift.setUpdatedAt(LocalDateTime.of(2020, 1, 1, 0, 0));
        AttendanceWriteGuard.strip(shift);
        assertNull(shift.getDeleted(), "提交 deleted:1 会长出列表查不到却占住唯一键的隐形记录");
        assertNull(shift.getCreatedBy());
        assertNull(shift.getCreatedAt());
        assertNull(shift.getUpdatedBy());
        assertNull(shift.getUpdatedAt());

        AttHoliday holiday = new AttHoliday();
        holiday.setDeleted(1);
        holiday.setCreatedBy("偽造人");
        AttendanceWriteGuard.strip(holiday);
        assertNull(holiday.getDeleted());
        assertNull(holiday.getCreatedBy());

        AttGroup group = new AttGroup();
        group.setDeleted(1);
        group.setCreatedBy("偽造人");
        AttendanceWriteGuard.strip(group);
        assertNull(group.getDeleted());
        assertNull(group.getCreatedBy());
    }

    @Test
    @DisplayName("新建班次：审计字段由服务端按当前登录人写入，提交值一律丢弃")
    void createOverwritesAuditFields() {
        AttShift submitted = shift(null, "SH07", "偽造人");
        submitted.setDeleted(1);
        when(shiftMapper.selectCount(any())).thenReturn(0L);
        // 模拟 MyBatis-Plus 回写自增主键（生产下 insert 后实体已带 id，否则回读 VO 会报错）
        when(shiftMapper.insert(any(AttShift.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, AttShift.class).setId(70L);
            return 1;
        });
        when(shiftMapper.selectById(70L)).thenReturn(shift(70L, "SH07", "陳小紅"));

        shiftService.save(submitted);

        ArgumentCaptor<AttShift> captor = ArgumentCaptor.forClass(AttShift.class);
        verify(shiftMapper).insert(captor.capture());
        AttShift inserted = captor.getValue();
        assertNull(inserted.getDeleted(), "软删标记不得由请求决定");
        assertEquals("陳小紅", inserted.getCreatedBy(), "创建人必须是当前登录人");
        assertEquals("陳小紅", inserted.getUpdatedBy());
    }

    @Test
    @DisplayName("编辑班次：编码是稳定身份，前端改写无效")
    void updateKeepsExistingShiftCode() {
        AttShift submitted = shift(5L, "ZZ99", "李大偉");
        when(shiftMapper.selectById(5L)).thenReturn(shift(5L, "SH01", "李大偉"));
        when(shiftMapper.selectCount(any())).thenReturn(0L);

        shiftService.save(submitted);

        ArgumentCaptor<AttShift> captor = ArgumentCaptor.forClass(AttShift.class);
        verify(shiftMapper).updateById(captor.capture());
        assertEquals("SH01", captor.getValue().getShiftCode(),
                "排班与历史考勤结论都按编码追源，编辑请求不得改写");
        assertEquals("門店早班 08:00-17:00", captor.getValue().getShiftName(), "其它字段仍按表单更新");
    }

    private AttShift shift(Long id, String code, String name) {
        AttShift shift = new AttShift();
        shift.setId(id);
        shift.setShiftCode(code);
        shift.setShiftName(id != null && id == 5L ? "門店早班 08:00-17:00" : "班次 " + code);
        shift.setOnTime(LocalTime.of(8, 0));
        shift.setOffTime(LocalTime.of(17, 0));
        shift.setWorkHours(new BigDecimal("8.0"));
        shift.setCrossDay(0);
        shift.setFlexFlag(0);
        shift.setStatus("enabled");
        shift.setUpdatedBy(name);
        return shift;
    }
}
