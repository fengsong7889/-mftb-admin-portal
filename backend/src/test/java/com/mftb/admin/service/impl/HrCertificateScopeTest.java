package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.constant.HrCertificateConstants;
import com.mftb.admin.dto.HrCertificateSaveDTO;
import com.mftb.admin.entity.HrCertificateRequest;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.HrCertificateRequestMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.OaRequestService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
 * 證明開具（ESS）数据范围与提交校验测试。
 * <p>
 * 与请假域不同，证明单据**没有"人事可跨员工查看"的口径**：无论调用者持有什么菜单，
 * 查询与办理一律锁定登录人本人，因此这里重点锁死两件事——归属条件必然下推、他人单据必然 403。
 */
class HrCertificateScopeTest {

    private static final long SELF_ID = 28L;
    private static final long OTHER_ID = 24L;

    private HrCertificateRequestMapper certMapper;
    private SysUserMapper sysUserMapper;
    private PermissionService permissionService;
    private HrCertificateServiceImpl service;

    private final SysUser self = user(SELF_ID, "MF00028", "測試入院員");
    private final SysUser other = user(OTHER_ID, "MF00024", "張三");

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""),
                HrCertificateRequest.class);
        certMapper = mock(HrCertificateRequestMapper.class);
        sysUserMapper = mock(SysUserMapper.class);
        permissionService = mock(PermissionService.class);
        OperatorResolver resolver = mock(OperatorResolver.class);
        when(resolver.currentUser()).thenReturn(self);
        lenient().when(resolver.currentOperatorName()).thenReturn(self.getName());
        service = new HrCertificateServiceImpl(certMapper, sysUserMapper,
                mock(OaRequestService.class), mock(BizSeqService.class), resolver, permissionService);

        lenient().when(permissionService.hasPermission(eq(self), eq(HrCertificateConstants.MENU), anyString()))
                .thenReturn(true);
        lenient().when(sysUserMapper.selectById(any())).thenAnswer(inv -> {
            Long id = inv.getArgument(0);
            return SELF_ID == id ? self : (OTHER_ID == id ? other : null);
        });
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setUsername(empId);
        u.setEmpId(empId);
        u.setName(name);
        u.setDepartment("技術部");
        u.setRole("user");
        return u;
    }

    private static HrCertificateRequest cert(long id, Long ownerUserId, String status) {
        HrCertificateRequest e = new HrCertificateRequest();
        e.setId(id);
        e.setReqNo("ZM" + id);
        e.setUserId(ownerUserId);
        e.setEmpName("員工" + ownerUserId);
        e.setCertType(HrCertificateConstants.TYPE_EMPLOYMENT);
        e.setPurpose("銀行貸款");
        e.setLanguage(HrCertificateConstants.LANG_ZH);
        e.setCopies(1);
        e.setStatus(status);
        return e;
    }

    private static HrCertificateSaveDTO dto(String certType) {
        HrCertificateSaveDTO dto = new HrCertificateSaveDTO();
        dto.setCertType(certType);
        dto.setPurpose("簽證");
        dto.setCopies(2);
        return dto;
    }

    @SuppressWarnings("unchecked")
    private String capturedPageCondition() {
        ArgumentCaptor<LambdaQueryWrapper<HrCertificateRequest>> captor =
                ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(certMapper).selectPage(any(Page.class), captor.capture());
        return captor.getValue().getSqlSegment();
    }

    @Test
    @DisplayName("列表查询必须下推本人归属条件")
    void listIsAlwaysScopedToCurrentUser() {
        when(certMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));

        service.page(1, 10, null, null);

        assertTrue(capturedPageCondition().contains("user_id"),
                "证明列表未下推归属条件: " + capturedPageCondition());
    }

    @Test
    @DisplayName("状态计数与列表同口径")
    void statsShareListScope() {
        when(certMapper.selectList(any())).thenReturn(List.of());

        service.stats();

        ArgumentCaptor<LambdaQueryWrapper<HrCertificateRequest>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(certMapper).selectList(captor.capture());
        assertTrue(captor.getValue().getSqlSegment().contains("user_id"),
                "计数未下推归属条件: " + captor.getValue().getSqlSegment());
    }

    @Test
    @DisplayName("查看/编辑/提交/撤销/删除他人单据一律 403，且提示为数据范围语义")
    void otherUsersRequestIsRejected() {
        when(certMapper.selectById(9L)).thenReturn(cert(9L, OTHER_ID, "draft"));

        PermissionDeniedException denied = assertThrows(PermissionDeniedException.class,
                () -> service.detail(9L));
        assertTrue(denied.getMessage().contains("本人的資料"), "实际提示: " + denied.getMessage());

        assertThrows(PermissionDeniedException.class, () -> service.update(9L, dto("EMPLOYMENT")));
        assertThrows(PermissionDeniedException.class, () -> service.submit(9L));
        assertThrows(PermissionDeniedException.class, () -> service.delete(9L));
        verify(certMapper, never()).deleteById(9L);

        when(certMapper.selectById(9L)).thenReturn(cert(9L, OTHER_ID, "pending"));
        assertThrows(PermissionDeniedException.class, () -> service.cancel(9L));
    }

    @Test
    @DisplayName("草稿归属取登录人，不接受外部指定申请人")
    void draftOwnerComesFromLogin() {
        when(certMapper.selectById(9L)).thenReturn(cert(9L, SELF_ID, "draft"));

        service.saveDraft(dto(HrCertificateConstants.TYPE_EMPLOYMENT));

        ArgumentCaptor<HrCertificateRequest> captor = ArgumentCaptor.forClass(HrCertificateRequest.class);
        verify(certMapper).insert(captor.capture());
        assertEquals(SELF_ID, captor.getValue().getUserId());
        assertEquals("MF00028", captor.getValue().getEmpNo());
        assertEquals(HrCertificateConstants.STATUS_DRAFT, captor.getValue().getStatus());
    }

    @Test
    @DisplayName("无效证明类型与早于今天的期望日期一律拒绝")
    void invalidInputIsRejected() {
        assertThrows(BusinessException.class, () -> service.saveDraft(dto("BOGUS")));

        HrCertificateSaveDTO past = dto(HrCertificateConstants.TYPE_INCOME);
        past.setExpectDate(LocalDate.now().minusDays(1));
        assertThrows(BusinessException.class, () -> service.saveDraft(past));
        verify(certMapper, never()).insert(any(HrCertificateRequest.class));
    }

    @Test
    @DisplayName("未授予证明菜单时拒绝，不给匿名自助通道")
    void menuPermissionIsRequired() {
        when(permissionService.hasPermission(eq(self), eq(HrCertificateConstants.MENU), anyString()))
                .thenReturn(false);

        assertThrows(PermissionDeniedException.class, () -> service.page(1, 10, null, null));
        assertThrows(PermissionDeniedException.class,
                () -> service.saveDraft(dto(HrCertificateConstants.TYPE_EMPLOYMENT)));
    }

    @Test
    @DisplayName("提交前必须齐全：用途与份数缺失时拒绝")
    void submitRequiresCompleteness() {
        HrCertificateRequest noPurpose = cert(9L, SELF_ID, "draft");
        noPurpose.setPurpose(null);
        when(certMapper.selectById(9L)).thenReturn(noPurpose);
        assertThrows(BusinessException.class, () -> service.submit(9L));

        HrCertificateRequest noCopies = cert(9L, SELF_ID, "draft");
        noCopies.setCopies(0);
        when(certMapper.selectById(9L)).thenReturn(noCopies);
        assertThrows(BusinessException.class, () -> service.submit(9L));
    }
}
