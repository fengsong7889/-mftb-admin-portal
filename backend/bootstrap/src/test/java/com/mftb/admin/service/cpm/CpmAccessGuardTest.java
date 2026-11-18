/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.CpmItem;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmItemMapper;
import com.mftb.admin.mapper.CpmRecognitionMapper;
import com.mftb.admin.mapper.CpmReportMapper;
import com.mftb.admin.mapper.CpmViewGrantMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 数据范围与 IDOR 钉死测试：阅读范围只认服务端计算，
 * 「前端传 scope 扩大可见性」这条路在本系统不存在。
 */
class CpmAccessGuardTest {

    private OperatorResolver operatorResolver;
    private SysUserMapper userMapper;
    private SysDepartmentMapper departmentMapper;
    private CpmViewGrantMapper grantMapper;
    private CpmItemMapper itemMapper;
    private CpmReportMapper reportMapper;
    private CpmRecognitionMapper recognitionMapper;
    private CpmAccessGuard guard;

    private static final SysUser BOSS = user(1L, "劉總");
    private static final SysUser SELF = user(2L, "張偉");
    private static final SysUser STRANGER = user(99L, "路人");

    private static SysUser user(long id, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setName(name);
        u.setStatus(1);
        return u;
    }

    @BeforeEach
    void setUp() {
        // 脱离 Spring 上下文的纯单测：MP LambdaQueryWrapper 需要 TableInfo 缓存，先手工初始化涉及实体
        for (Class<?> entity : new Class<?>[]{SysDepartment.class, SysUser.class}) {
            if (com.baomidou.mybatisplus.core.metadata.TableInfoHelper.getTableInfo(entity) == null) {
                com.baomidou.mybatisplus.core.metadata.TableInfoHelper.initTableInfo(
                        new org.apache.ibatis.builder.MapperBuilderAssistant(
                                new com.baomidou.mybatisplus.core.MybatisConfiguration(), ""),
                        entity);
            }
        }
        operatorResolver = mock(OperatorResolver.class);
        userMapper = mock(SysUserMapper.class);
        departmentMapper = mock(SysDepartmentMapper.class);
        grantMapper = mock(CpmViewGrantMapper.class);
        itemMapper = mock(CpmItemMapper.class);
        reportMapper = mock(CpmReportMapper.class);
        recognitionMapper = mock(CpmRecognitionMapper.class);
        guard = new CpmAccessGuard(operatorResolver, userMapper, departmentMapper,
                grantMapper, itemMapper, reportMapper, recognitionMapper);
        when(operatorResolver.currentUser()).thenReturn(BOSS);
    }

    /** 显式授权行构成阅读范围（推导线单测在集成侧覆盖，这里聚焦判定逻辑）。 */
    private void grantScope(List<Long> ids) {
        // 只对 BOSS 铺范围：任何「any() 通吃」的桩会把路人也会看成可见——IDOR 用例必须用真实隔离的桩
        when(grantMapper.listTargetUserIds(anyLong())).thenReturn(List.of());
        when(grantMapper.listTargetUserIds(BOSS.getId())).thenReturn(ids);
        when(departmentMapper.selectList(any())).thenReturn(List.of());
    }

    @Test
    @DisplayName("cpm.enabled=false 时所有取登录人的路径整条拒绝（回滚开关不留只读口子）")
    void systemSwitchOffRejectsEveryPath() {
        org.springframework.test.util.ReflectionTestUtils.setField(guard, "systemEnabled", false);
        BusinessException ex = assertThrows(BusinessException.class, () -> guard.currentUser());
        assertTrue(ex.getMessage().contains("暫停服務"), "文案要说明是停服而不是登录失效，否则用户会反复重登");
        org.springframework.test.util.ReflectionTestUtils.setField(guard, "systemEnabled", true);
        assertDoesNotThrow(guard::currentUser);
    }

    @Test
    @DisplayName("条目读写硬约束登录人：碰别人的条目直接拒绝")
    void itemMustBelongToViewer() {
        CpmItem foreign = new CpmItem();
        foreign.setId(10L);
        foreign.setUserId(STRANGER.getId());
        foreign.setDeleted(0);
        when(itemMapper.selectAliveById(10L)).thenReturn(foreign);
        assertThrows(BusinessException.class, () -> guard.requireOwnedItem(10L, SELF));
        assertThrows(BusinessException.class, () -> guard.requireOwnedItem(10L, BOSS));
    }

    @Test
    @DisplayName("汇报读取：本人放行；范围内他人放行；范围外 IDOR 拒绝")
    void reportReadableWithinScope() {
        CpmReport own = new CpmReport();
        own.setId(1L);
        own.setUserId(SELF.getId());
        when(reportMapper.selectAliveById(1L)).thenReturn(own);
        assertDoesNotThrow(() -> guard.requireReadableReport(1L, SELF));

        CpmReport subordinate = new CpmReport();
        subordinate.setId(2L);
        subordinate.setUserId(42L);
        when(reportMapper.selectAliveById(2L)).thenReturn(subordinate);
        grantScope(List.of(42L));
        assertDoesNotThrow(() -> guard.requireReadableReport(2L, BOSS));

        assertThrows(BusinessException.class, () -> guard.requireReadableReport(2L, STRANGER));
    }

    @Test
    @DisplayName("CFR 反馈：自评/自赞/自认一律拒绝；范围外拒绝；范围内他人通过")
    void cfrRules() {
        grantScope(List.of(42L));
        assertThrows(BusinessException.class, () -> guard.requireCfrWritable(BOSS.getId(), BOSS));
        assertThrows(BusinessException.class, () -> guard.requireCfrWritable(99L, BOSS));
        assertDoesNotThrow(() -> guard.requireCfrWritable(42L, BOSS));
    }

    @Test
    @DisplayName("重复认定前置快查命中即拒，不再触库写入")
    void duplicateRecognitionRejectedEarly() {
        when(recognitionMapper.countSameFromOnTarget("report", 7L, 1L)).thenReturn(1);
        assertThrows(BusinessException.class,
                () -> guard.requireNoDuplicateRecognition("report", 7L, 1L));
    }

    @Test
    @DisplayName("授权给自己不产生可见性行（本来就能看自己）")
    void explicitGrantRejectsSelf() {
        assertThrows(BusinessException.class, () -> guard.grantExplicitViewer(5L, 5L, "admin"));
        verify(grantMapper, never()).insertIgnore(anyLong(), anyLong(), anyString(), anyString());
    }
}
