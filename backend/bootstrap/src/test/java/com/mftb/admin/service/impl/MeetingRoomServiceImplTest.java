package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingRoomDto;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.MeetingAccessGuard;
import com.mftb.admin.service.MeetingAuditRecorder;
import com.mftb.admin.service.MeetingRuleService;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 会议室档案写入映射测试（{@link MeetingRoomServiceImpl}）。
 *
 * <p>锁定的是一类真实事故：档案列的 DDL 是 {@code NOT NULL DEFAULT ''}，而 update 走
 * 逐列显式 set —— 表单留空若在映射层产出 null，就会写成 null 撞约束，接口报"数据库操作异常"，
 * 行政连"改个备注"都做不了，且设备/管理员永远无法清空。规则列反过来必须以 NULL 表达
 * "本房间未单独配置、回落全局"，两种空值的语义必须分开钉住。
 */
class MeetingRoomServiceImplTest {

    private static final SysUser ADMIN = admin();

    private MeetingRoomMapper roomMapper;
    private MeetingAccessGuard guard;
    private MeetingRoomServiceImpl service;

    private static SysUser admin() {
        SysUser u = new SysUser();
        u.setId(900L);
        u.setEmpId("MF00900");
        u.setUsername("王行政");
        u.setName("王行政");
        u.setRole("admin");
        u.setStatus(1);
        return u;
    }

    /** LambdaUpdateWrapper 需要 MyBatis-Plus 的表元数据缓存，纯单测里没有 Spring 注册过程 */
    @BeforeAll
    static void initTableMetadata() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), MeetingRoom.class);
    }

    @BeforeEach
    void setUp() {
        roomMapper = mock(MeetingRoomMapper.class);
        guard = mock(MeetingAccessGuard.class);
        service = new MeetingRoomServiceImpl(roomMapper, mock(MeetingBookingMapper.class),
                mock(SysUserMapper.class), guard, mock(MeetingRuleService.class), mock(MeetingAuditRecorder.class));
        when(guard.currentUser()).thenReturn(ADMIN);
        // 真库里 insert 回填自增主键，审计快照又要读这个主键：打桩不模拟回填就会 NPE 在无关位置
        when(roomMapper.insert(any(MeetingRoom.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, MeetingRoom.class).setId(9L);
            return 1;
        });
    }

    /** 只填必填项的表单：园区/楼栋/楼层/位置/设备/管理员全部缺失，正是线上必然踩到的形态 */
    private static MeetingRoomDto.Form bareForm() {
        MeetingRoomDto.Form form = new MeetingRoomDto.Form();
        form.setRoomNo("MR-9F-01");
        form.setRoomName("測試房");
        form.setCapacity(6);
        return form;
    }

    private static MeetingRoom storedRoom() {
        MeetingRoom room = new MeetingRoom();
        room.setId(9L);
        room.setRoomNo("MR-9F-01");
        room.setRoomName("測試房");
        room.setCapacity(6);
        room.setStatus(MeetingConstants.ROOM_ACTIVE);
        room.setBookable(1);
        room.setFacilities(",WHITEBOARD,");
        room.setAdminUserIds(",12,");
        room.setVersion(0);
        return room;
    }

    @Test
    @DisplayName("档案列留空落空串而不是 null：撞 NOT NULL 约束会让行政什么都改不了")
    void blankProfileColumnsBecomeEmptyString() {
        ArgumentCaptor<MeetingRoom> captor = ArgumentCaptor.forClass(MeetingRoom.class);

        service.create(bareForm());

        verify(roomMapper).insert(captor.capture());
        MeetingRoom saved = captor.getValue();
        assertEquals("", saved.getCampus(), "园区列 NOT NULL DEFAULT ''，映射必须是空串");
        assertEquals("", saved.getBuilding());
        assertEquals("", saved.getFloorCode());
        assertEquals("", saved.getLocationDesc());
        assertEquals("", saved.getFacilities(), "清空设备是正当操作，不能变成保存失败");
        assertEquals("", saved.getAdminUserIds(), "清空房间管理员同上");
    }

    @Test
    @DisplayName("规则列留空保持 null：NULL 才是「本房间未单独配置、回落全局」")
    void ruleColumnsStayNullToFallBackToGlobal() {
        ArgumentCaptor<MeetingRoom> captor = ArgumentCaptor.forClass(MeetingRoom.class);

        service.create(bareForm());

        verify(roomMapper).insert(captor.capture());
        MeetingRoom saved = captor.getValue();
        assertNull(saved.getBookableStartTime(), "可预约窗不能被空串污染，否则回落全局的语义就丢了");
        assertNull(saved.getBookableEndTime());
        assertNull(saved.getMinDuration());
        assertNull(saved.getMaxDuration());
        assertNull(saved.getReleaseAfterMinutes());
    }

    @Test
    @DisplayName("更新逐列显式 set：档案列带空串进 SET（P0 回归），规则列允许 NULL")
    void updateSetsProfileColumnsWithBlankNotNull() {
        when(roomMapper.selectById(9L)).thenReturn(storedRoom());
        when(roomMapper.update(isNull(), any())).thenReturn(1);
        MeetingRoomDto.Form form = bareForm();
        form.setExpectVersion(0);
        ArgumentCaptor<LambdaUpdateWrapper<MeetingRoom>> captor = ArgumentCaptor.captor();

        service.update(9L, form);

        verify(roomMapper).update(isNull(), captor.capture());
        LambdaUpdateWrapper<MeetingRoom> wrapper = captor.getValue();
        String setClause = wrapper.getSqlSet();
        // 显式 set 是"允许清空"的前提：少了列名，行政就只能改大不能改小
        for (String column : List.of("campus", "building", "floor_code", "location_desc",
                "facilities", "admin_user_ids", "bookable_start_time", "min_duration")) {
            assertTrue(setClause.contains(column + "="), column + " 应被显式 set：" + setClause);
        }
        // 档案列 DDL 是 NOT NULL DEFAULT ''：带着 null 进 SET 就是本次 P0 的现场
        for (String column : List.of("campus", "building", "floor_code", "location_desc",
                "facilities", "admin_user_ids")) {
            assertEquals("", valueSetFor(wrapper, column), column + " 留空应以空串写入而不是 null");
        }
        // 规则列反过来必须是 NULL：回落全局的语义不能被空串污染
        assertNull(valueSetFor(wrapper, "bookable_start_time"));
        assertNull(valueSetFor(wrapper, "min_duration"));
    }

    /** 从 SET 片段里把 {@code column=#{ew.paramNameValuePairs.MPGENVALn}} 反查回实参，避开生成键名的顺序依赖 */
    private static Object valueSetFor(LambdaUpdateWrapper<MeetingRoom> wrapper, String column) {
        for (String fragment : wrapper.getSqlSet().split(",")) {
            int equals = fragment.indexOf('=');
            if (equals < 0 || !column.equals(fragment.substring(0, equals).trim())) {
                continue;
            }
            // setSql 拼进去的片段（如 version = version + 1）不是占位引用，直接跳过
            String reference = fragment.substring(equals + 1).trim();
            if (!reference.startsWith("#{ew.paramNameValuePairs.MPGENVAL")) {
                continue;
            }
            return wrapper.getParamNameValuePairs().get(
                    reference.substring(reference.lastIndexOf('.') + 1, reference.length() - 1));
        }
        throw new AssertionError("SET 片段里找不到列 " + column + "：" + wrapper.getSqlSet());
    }

    @Test
    @DisplayName("状态变更只写 status：停用→启用一次不能把 bookable 永久清零")
    void changeStatusDoesNotTouchBookable() {
        MeetingRoom before = storedRoom();
        MeetingRoom after = storedRoom();
        after.setStatus("disabled");
        when(roomMapper.selectById(9L)).thenReturn(before, after);
        when(roomMapper.update(isNull(), any())).thenReturn(1);
        ArgumentCaptor<LambdaUpdateWrapper<MeetingRoom>> captor = ArgumentCaptor.captor();
        MeetingRoomDto.StatusChange change = new MeetingRoomDto.StatusChange();
        change.setStatus("disabled");
        change.setVersion(0);

        service.changeStatus(9L, change);

        verify(roomMapper).update(isNull(), captor.capture());
        String setClause = captor.getValue().getSqlSet();
        assertTrue(setClause.contains("status"), setClause);
        assertFalse(setClause.contains("bookable"),
                "可预约性的唯一口径是 isBookable()（bookable=1 且 status=active）；"
                        + "联动清零会让启用后的房间永远订不出去");
        // 停用状态下依旧订不出去：双条件判定在预约校验与忙闲过滤里各自成立，无需在此写死
        assertFalse(MeetingConstants.ROOM_ACTIVE.equals(after.getStatus()));
    }

    @Test
    @DisplayName("设备与管理员按代码/ID 去重并保持逗号包裹格式")
    void listColumnsKeepCommaWrappedFormat() {
        ArgumentCaptor<MeetingRoom> captor = ArgumentCaptor.forClass(MeetingRoom.class);
        MeetingRoomDto.Form form = bareForm();
        form.setFacilities(List.of("WHITEBOARD", "WHITEBOARD", " PROJECTION "));
        form.setAdminUserIds(List.of(12L, 12L, 35L));

        service.create(form);

        verify(roomMapper).insert(captor.capture());
        MeetingRoom saved = captor.getValue();
        assertEquals(",WHITEBOARD,PROJECTION,", saved.getFacilities());
        assertEquals(",12,35,", saved.getAdminUserIds());
    }
}
