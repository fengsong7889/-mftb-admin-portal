package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrLeaveConstants;
import com.mftb.admin.dto.HrLeaveRequestSaveDTO;
import com.mftb.admin.entity.HrLeaveBalance;
import com.mftb.admin.entity.HrLeaveRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrLeaveBalanceMapper;
import com.mftb.admin.mapper.HrLeaveRequestMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.SysHrDictService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * HR 请假域行级数据范围测试。
 * <p>
 * 口径：能查看「假期額度」台账即视为人事职能用户，可跨员工查看与代办；
 * 仅有「請假管理」菜单的自助用户只能看到并操作本人单据（超管在 hasPermission 内直通）。
 * 这里断言的是真实落到查询条件里的归属过滤，而不只是接口能否访问。
 */
class HrLeaveDataScopeTest {

    private static final long SELF_ID = 24L;
    private static final long OTHER_ID = 25L;

    private HrLeaveRequestMapper leaveMapper;
    private HrLeaveBalanceMapper balanceMapper;
    private SysUserMapper sysUserMapper;
    private PermissionService permissionService;
    private HrLeaveServiceImpl service;

    private final SysUser self = user(SELF_ID, "MF00024", "張三");
    private final SysUser other = user(OTHER_ID, "MF00025", "李四");

    @BeforeEach
    void setUp() {
        // 单元测试不启动 MyBatis，需手工注册实体元数据，否则 Lambda 条件解析不到列名
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""),
                HrLeaveRequest.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""),
                HrLeaveBalance.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""),
                SysUser.class);

        leaveMapper = mock(HrLeaveRequestMapper.class);
        balanceMapper = mock(HrLeaveBalanceMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        permissionService = mock(PermissionService.class);
        service = new HrLeaveServiceImpl(leaveMapper, balanceMapper, sysUserMapper,
                mock(OaRequestService.class), mock(BizSeqService.class),
                mock(OperatorResolver.class), permissionService, mock(SysHrDictService.class));
    }

    // ==================== 夹具 ====================

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setUsername(empId);
        u.setEmpId(empId);
        u.setName(name);
        u.setRole("user");
        u.setStatus(1);
        return u;
    }

    /** 登录人 + 功能授权：hrLeaveView 控制能否进请假菜单，hrRole 控制是否人事职能（可见全量） */
    private void login(boolean hrRole) {
        OperatorResolver resolver = mock(OperatorResolver.class);
        when(resolver.currentUser()).thenReturn(self);
        service = new HrLeaveServiceImpl(leaveMapper, balanceMapper, sysUserMapper,
                mock(OaRequestService.class), mock(BizSeqService.class), resolver,
                permissionService, mock(SysHrDictService.class));
        lenient().when(permissionService.hasPermission(eq(self), eq(HrLeaveConstants.MENU_LEAVE), anyString()))
                .thenReturn(true);
        lenient().when(permissionService.hasPermission(eq(self), eq(HrLeaveConstants.MENU_QUOTA), anyString()))
                .thenReturn(hrRole);
        lenient().when(sysUserMapper.selectById(any())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            return SELF_ID == id ? self : (OTHER_ID == id ? other : null);
        });
    }

    private static HrLeaveRequest request(long id, Long ownerUserId, String status) {
        HrLeaveRequest e = new HrLeaveRequest();
        e.setId(id);
        e.setReqNo("LQ" + id);
        e.setUserId(ownerUserId);
        e.setEmpName("員工" + ownerUserId);
        e.setYear(2026);
        e.setLeaveType(HrLeaveConstants.TYPE_ANNUAL);
        e.setStartDate(LocalDate.of(2026, 10, 1));
        e.setEndDate(LocalDate.of(2026, 10, 3));
        e.setDays(new BigDecimal("3.0"));
        e.setStatus(status);
        return e;
    }

    private static HrLeaveRequestSaveDTO dto(Long userId) {
        HrLeaveRequestSaveDTO dto = new HrLeaveRequestSaveDTO();
        dto.setUserId(userId);
        dto.setLeaveType(HrLeaveConstants.TYPE_ANNUAL);
        dto.setStartDate(LocalDate.of(2026, 10, 1));
        dto.setEndDate(LocalDate.of(2026, 10, 2));
        dto.setReason("家庭事務");
        return dto;
    }

    /** 捕获 selectPage 的查询条件并转成 SQL 片段 */
    @SuppressWarnings("unchecked")
    private String capturePageCondition() {
        ArgumentCaptor<LambdaQueryWrapper<HrLeaveRequest>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(leaveMapper).selectPage(any(Page.class), captor.capture());
        return captor.getValue().getSqlSegment();
    }

    // ==================== 查询侧 ====================

    @Test
    @DisplayName("自助用户的请假列表必须带本人归属条件")
    void selfServiceListIsScopedToCurrentUser() {
        login(false);
        when(leaveMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));

        service.page(1, 10, null, null);

        String sql = capturePageCondition();
        assertTrue(sql.contains("user_id"), "列表查询未下推归属条件: " + sql);
    }

    @Test
    @DisplayName("人事角色（可看额度台账）的列表不加归属条件")
    void hrRoleListSeesAllEmployees() {
        login(true);
        when(leaveMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));

        service.page(1, 10, null, null);

        assertFalse(capturePageCondition().contains("user_id"), "人事角色不应被限定为本人");
    }

    @Test
    @DisplayName("状态计数与列表同口径，避免自助用户数出全公司请假量")
    void statsShareListScope() {
        login(false);
        when(leaveMapper.selectList(any())).thenReturn(List.of(request(1, SELF_ID, "draft")));

        service.stats();

        ArgumentCaptor<LambdaQueryWrapper<HrLeaveRequest>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(leaveMapper).selectList(captor.capture());
        assertTrue(captor.getValue().getSqlSegment().contains("user_id"),
                "计数查询未下推归属条件: " + captor.getValue().getSqlSegment());
    }

    @Test
    @DisplayName("选人下拉：自助用户只返回本人，不查同事名单")
    void employeeOptionsOnlySelf() {
        login(false);

        List<Map<String, Object>> options = service.employeeOptions("李");

        assertEquals(1, options.size());
        assertEquals(SELF_ID, options.get(0).get("userId"));
        verify(sysUserMapper, never()).selectList(any());
    }

    // ==================== 单条读写侧 ====================

    @Test
    @DisplayName("查看他人请假单被拒；查看本人单据放行")
    void detailChecksOwnership() {
        login(false);
        when(leaveMapper.selectById(9L)).thenReturn(request(9L, OTHER_ID, "draft"));
        when(balanceMapper.selectOne(any())).thenReturn(null);

        assertThrows(PermissionDeniedException.class, () -> service.detail(9L));

        HrLeaveRequest mine = request(9L, SELF_ID, "draft");
        when(leaveMapper.selectById(9L)).thenReturn(mine);
        assertEquals("LQ9", service.detail(9L).getReqNo());
    }

    @Test
    @DisplayName("提交/撤销/删除/编辑他人单据一律拒绝")
    void writeOperationsCheckOwnership() {
        login(false);
        when(leaveMapper.selectById(9L)).thenReturn(request(9L, OTHER_ID, "draft"));

        assertThrows(PermissionDeniedException.class, () -> service.submit(9L));
        assertThrows(PermissionDeniedException.class, () -> service.update(9L, dto(SELF_ID)));

        when(leaveMapper.selectById(9L)).thenReturn(request(9L, OTHER_ID, "pending"));
        assertThrows(PermissionDeniedException.class, () -> service.cancel(9L));

        when(leaveMapper.selectById(9L)).thenReturn(request(9L, OTHER_ID, "draft"));
        assertThrows(PermissionDeniedException.class, () -> service.delete(9L));
        verify(leaveMapper, never()).deleteById(9L);
    }

    @Test
    @DisplayName("自助用户不得代他人请假")
    void cannotFileLeaveForOthers() {
        login(false);

        assertThrows(PermissionDeniedException.class, () -> service.saveDraft(dto(OTHER_ID)));
        verify(leaveMapper, never()).insert(any(HrLeaveRequest.class));
    }

    @Test
    @DisplayName("人事角色可代员工建单")
    void hrRoleMayFileLeaveForEmployee() {
        login(true);
        when(balanceMapper.selectOne(any())).thenReturn(null);

        service.saveDraft(dto(OTHER_ID));

        verify(leaveMapper).insert(any(HrLeaveRequest.class));
    }

    @Test
    @DisplayName("剩余额度查询不得用于探测他人额度")
    void quotaProbeIsScoped() {
        login(false);

        assertThrows(PermissionDeniedException.class,
                () -> service.quota(OTHER_ID, HrLeaveConstants.TYPE_ANNUAL, 2026));

        service.quota(SELF_ID, HrLeaveConstants.TYPE_ANNUAL, 2026);
    }
}
