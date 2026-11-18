/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.contracts.rdm.RdmWorkItemSource;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.service.MeetingActionSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 关联业务对象导入候选清单的口径测试：
 * fail-closed、协办并集、已导入标记只作提示（防重仍在条目唯一键）。
 */
class CpmSourceServiceTest {

    private static final SysUser SELF = user(2L, "張偉");

    private ObjectProvider<RdmWorkItemSource> provider;
    private MeetingActionSource meetingActions;
    private CpmItemMapper itemMapper;
    private CpmAccessGuard guard;
    private CpmSourceService service;

    private static SysUser user(long id, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setName(name);
        u.setStatus(1);
        return u;
    }

    @SuppressWarnings("unchecked")
    @BeforeEach
    void setUp() {
        for (Class<?> entity : new Class<?>[]{CpmItem.class}) {
            if (com.baomidou.mybatisplus.core.metadata.TableInfoHelper.getTableInfo(entity) == null) {
                com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                        new org.apache.ibatis.builder.MapperBuilderAssistant(
                                new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                        entity);
            }
        }
        provider = mock(ObjectProvider.class);
        meetingActions = mock(MeetingActionSource.class);
        itemMapper = mock(CpmItemMapper.class);
        guard = mock(CpmAccessGuard.class);
        when(guard.currentUser()).thenReturn(SELF);
        service = new CpmSourceService(provider, meetingActions, itemMapper, guard);
    }

    private static CpmItem importedItem(String ref) {
        CpmItem item = new CpmItem();
        item.setSourceRef(ref);
        return item;
    }

    @Test
    @DisplayName("RDM 端口无实现时 fail-closed：空清单，且绝不回退成直查 rdm 表")
    void rdmPortAbsentFailsClosed() {
        when(provider.getIfAvailable()).thenReturn(null);
        assertTrue(service.listRdmRequirements("结算").isEmpty());
        verify(itemMapper, never()).selectList(any());
    }

    @Test
    @DisplayName("RDM 候选：只按登录人取数，来源 ID 落 source_ref，imported 由条目表标记")
    void rdmCandidatesCarrySourceRefAndImportedFlag() {
        RdmWorkItemSource source = mock(RdmWorkItemSource.class);
        when(source.findRelatedOpenRequirements(eq(SELF.getId()), isNull(), anyInt())).thenReturn(List.of(
                new RdmWorkItemSource.WorkItemRef(501L, "REQ-0501", "結算改造", "developing", 60, "dev",
                        LocalDate.of(2026, 11, 30), false),
                new RdmWorkItemSource.WorkItemRef(502L, "REQ-0502", "已上線核對", "released", 100, "accept",
                        null, true)));
        when(provider.getIfAvailable()).thenReturn(source);
        when(itemMapper.selectList(any())).thenReturn(List.of(importedItem("501")));

        List<CpmDto.SourceVO> rows = service.listRdmRequirements(null);

        assertEquals(2, rows.size());
        CpmDto.SourceVO first = rows.get(0);
        assertEquals("rdm_requirement", first.getSourceType());
        assertEquals("501", first.getSourceRef());
        assertEquals("REQ-0501", first.getSubtitle());
        assertEquals("developing", first.getStatusCode());
        assertTrue(first.isImported());
        assertFalse(first.isTerminated());
        assertTrue(rows.get(1).isTerminated());
        assertFalse(rows.get(1).isImported());
        // 身份只能取登录人：接口被传 0L 或其它 userId 的用例在这里就该红
        verify(source).findRelatedOpenRequirements(eq(SELF.getId()), isNull(), anyInt());
    }

    @Test
    @DisplayName("会议行动项：角色由首负责人判定，会议标题与到期日原样透出")
    void meetingActionsMapRoleAndSourceLabel() {
        when(meetingActions.findOpenActionsOf(SELF.getId(), 30)).thenReturn(List.of(
                new MeetingActionSource.ActionItemRef(10L, "補寫結算文檔", "pending", SELF.getId(),
                        "11 月結算評審會", LocalDate.of(2026, 11, 25)),
                new MeetingActionSource.ActionItemRef(11L, "對齊灰度名額", "pending", 3L,
                        "灰度同步會", LocalDate.of(2026, 11, 28))));
        when(itemMapper.selectList(any())).thenReturn(List.of(importedItem("10")));

        List<CpmDto.SourceVO> rows = service.listMeetingActions();

        assertEquals(2, rows.size());
        assertEquals("owner", rows.get(0).getRole());
        assertTrue(rows.get(0).isImported());
        assertEquals("11 月結算評審會", rows.get(0).getSubtitle());
        assertEquals("participant", rows.get(1).getRole(), "协办人不是首负责人，不能标成我负责");
        assertEquals("2026-11-28", rows.get(1).getDueDate());
        // 身份只从登录态取：端口只可能收到登录人 id
        verify(meetingActions).findOpenActionsOf(eq(SELF.getId()), anyInt());
    }

    @Test
    @DisplayName("会议端口返回空清单时不再查已导入标记")
    void emptyMeetingActionsSkipsImportLookup() {
        when(meetingActions.findOpenActionsOf(SELF.getId(), 30)).thenReturn(List.of());

        assertTrue(service.listMeetingActions().isEmpty());
        verify(itemMapper, never()).selectList(any());
    }
}
