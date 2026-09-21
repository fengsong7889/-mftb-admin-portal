package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamReturnDTO;
import com.mftb.admin.dto.EamReturnDispositionDTO;
import com.mftb.admin.dto.EamReturnRecoverDTO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamBorrow;
import com.mftb.admin.entity.EamClaim;
import com.mftb.admin.entity.EamReturn;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.DepartmentService;
import com.mftb.admin.service.EamCompensationService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EamReturnServiceImplTest {
    @Mock private EamReturnMapper returnMapper;
    @Mock private EamClaimMapper claimMapper;
    @Mock private EamBorrowMapper borrowMapper;
    @Mock private EamAssetMapper assetMapper;
    @Mock private EamClaimEvidenceMapper evidenceMapper;
    @Mock private SysUserMapper userMapper;
    @Mock private EamLocationMapper locationMapper;
    @Mock private EamCompensationService compensationService;
    @Mock private DepartmentService departmentService;
    @Mock private BizSeqService bizSeqService;
    @Mock private OperatorResolver operatorResolver;
    @InjectMocks private EamReturnServiceImpl service;

    @ParameterizedTest
    @ValueSource(strings = {"不存在或已刪除", "已停用", "同名部門"})
    void invalidDepartmentDoesNotWriteReturnOrReleaseClaim(String reason) {
        EamClaim claim = stubClaim();
        rejectDepartment(reason);

        assertEquals(reason, assertThrows(BusinessException.class,
                () -> service.register(dto("無效部門"))).getMessage());
        assertEquals("claimed", claim.getStatus());
        verify(claimMapper, never()).updateById(any(EamClaim.class));
        verifyNoInteractions(returnMapper, assetMapper, bizSeqService, evidenceMapper);
    }

    @Test
    void invalidDepartmentDoesNotReleaseBorrow() {
        EamBorrow borrow = new EamBorrow();
        borrow.setId(6L);
        borrow.setAssetId(2L);
        borrow.setStatus("active");
        when(borrowMapper.selectForUpdate(6L)).thenReturn(borrow);
        rejectDepartment("已停用");
        EamReturnDTO dto = dto("無效部門");
        dto.setClaimId(null);
        dto.setBorrowId(6L);

        assertThrows(BusinessException.class, () -> service.register(dto));
        assertEquals("active", borrow.getStatus());
        verify(borrowMapper, never()).updateById(any(EamBorrow.class));
        verifyNoInteractions(returnMapper, assetMapper, bizSeqService);
    }

    @Test
    void suppliedDepartmentIsAlsoValidatedOnExceptionalReturn() {
        stubClaim();
        rejectDepartment("已停用");
        EamReturnDTO dto = dto("無效部門");
        dto.setAssetCondition("damaged");
        dto.setExceptionReason("驗收損壞");

        assertThrows(BusinessException.class, () -> service.register(dto));
        verifyNoInteractions(returnMapper, assetMapper, bizSeqService);
    }

    @Test
    void validDepartmentUsesCanonicalNameAndClearsHolder() {
        stubClaim();
        EamAsset asset = stubAssetForReturn();
        when(departmentService.requireEnabledDepartmentName("  用戶運營部  ")).thenReturn("用戶運營部");

        assertEquals(11L, service.register(dto("  用戶運營部  ")));

        assertEquals("用戶運營部", asset.getDepartment());
        assertEquals("原位置", asset.getLocation());
        assertEquals("idle", asset.getStatus());
        assertNull(asset.getCurrentHolderId());
        assertNull(asset.getUserName());
        assertNull(asset.getActiveClaimId());
        ArgumentCaptor<UpdateWrapper<EamAsset>> update = ArgumentCaptor.forClass(UpdateWrapper.class);
        verify(assetMapper).update(eq(asset), update.capture());
        assertTrue(update.getValue().getSqlSet().contains("current_holder_id="));
        assertTrue(update.getValue().getParamNameValuePairs().containsValue(null));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" \t "})
    void omittedDepartmentPreservesLegacyNameAndLocation(String name) {
        stubClaim();
        EamAsset asset = stubAssetForReturn();

        service.register(dto(name));

        assertEquals("歷史部門", asset.getDepartment());
        assertEquals("原位置", asset.getLocation());
        assertEquals(9L, asset.getLocationId());
        verifyNoInteractions(departmentService, locationMapper);
    }

    @Test
    void invalidDepartmentDoesNotCloseDisposition() {
        EamReturn record = stubExceptionalReturn();
        rejectDepartment("已停用");
        EamReturnDispositionDTO dto = disposition("無效部門");

        assertThrows(BusinessException.class, () -> service.dispose(dto));
        assertEquals("exception_pending", record.getReturnStatus());
        verify(returnMapper, never()).updateById(any(EamReturn.class));
        verifyNoInteractions(assetMapper, evidenceMapper);
    }

    @Test
    void invalidDepartmentDoesNotMarkRecovered() {
        EamReturn record = stubExceptionalReturn();
        rejectDepartment("已停用");
        EamReturnRecoverDTO dto = recovery("無效部門");

        assertThrows(BusinessException.class, () -> service.recover(dto));
        assertEquals(0, record.getRecovered());
        verify(returnMapper, never()).updateById(any(EamReturn.class));
        verifyNoInteractions(assetMapper);
    }

    @Test
    void dispositionUsesValidatedDepartment() {
        stubExceptionalReturn();
        EamAsset asset = new EamAsset();
        asset.setId(2L);
        when(assetMapper.selectById(2L)).thenReturn(asset);
        when(departmentService.requireEnabledDepartmentName("  用戶運營部  ")).thenReturn("用戶運營部");

        service.dispose(disposition("  用戶運營部  "));

        assertEquals("用戶運營部", asset.getDepartment());
        verify(assetMapper).update(eq(asset), any());
    }

    @Test
    void recoveryUsesValidatedDepartment() {
        stubExceptionalReturn();
        EamAsset asset = new EamAsset();
        asset.setId(2L);
        when(assetMapper.selectById(2L)).thenReturn(asset);
        when(departmentService.requireEnabledDepartmentName("  用戶運營部  ")).thenReturn("用戶運營部");

        service.recover(recovery("  用戶運營部  "));

        assertEquals("用戶運營部", asset.getDepartment());
        verify(assetMapper).update(eq(asset), any());
    }

    @Test
    void damagedReturnReleasesToPendingDisposalAndCreatesLiability() {
        EamClaim claim = stubClaim();
        EamAsset asset = stubAssetForReturn();
        when(departmentService.requireEnabledDepartmentName("用戶運營部")).thenReturn("用戶運營部");
        when(compensationService.createFromDispose(11L)).thenReturn(401L);
        EamReturnDTO dto = dto("用戶運營部");
        dto.setAssetCondition("damaged");
        dto.setExceptionReason("屏幕破裂");

        assertEquals(11L, service.register(dto));

        assertEquals("returned", claim.getStatus());
        assertEquals("pending_disposal", asset.getStatus());
        assertNull(asset.getCurrentHolderId());
        ArgumentCaptor<UpdateWrapper<EamAsset>> update = ArgumentCaptor.forClass(UpdateWrapper.class);
        verify(assetMapper).update(eq(asset), update.capture());
        assertTrue(update.getValue().getSqlSet().contains("current_holder_id="));
        verify(compensationService).createFromDispose(11L);
    }

    private void rejectDepartment(String reason) {
        when(departmentService.requireEnabledDepartmentName("無效部門"))
                .thenThrow(new BusinessException(reason));
    }

    private EamClaim stubClaim() {
        EamClaim claim = new EamClaim();
        claim.setId(5L);
        claim.setAssetId(2L);
        claim.setEmployeeId(22L);
        claim.setStatus("claimed");
        when(claimMapper.selectForUpdate(5L)).thenReturn(claim);
        return claim;
    }

    private EamAsset stubAssetForReturn() {
        EamAsset asset = new EamAsset();
        asset.setId(2L);
        asset.setStatus("in_use");
        asset.setCurrentHolderId(22L);
        asset.setActiveClaimId(5L);
        asset.setUserName("使用人");
        asset.setDepartment("歷史部門");
        asset.setLocationId(9L);
        asset.setLocation("原位置");
        when(assetMapper.selectOne(any())).thenReturn(asset);
        when(bizSeqService.next(BizSeqService.RULE_EAM_RETURN)).thenReturn("GH202609170001");
        when(returnMapper.insert(any(EamReturn.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, EamReturn.class).setId(11L);
            return 1;
        });
        return asset;
    }

    private EamReturn stubExceptionalReturn() {
        EamReturn record = new EamReturn();
        record.setId(11L);
        record.setAssetId(2L);
        record.setReturnStatus("exception_pending");
        record.setRecovered(0);
        when(returnMapper.selectForUpdate(11L)).thenReturn(record);
        return record;
    }

    private EamReturnDTO dto(String department) {
        EamReturnDTO dto = new EamReturnDTO();
        dto.setClaimId(5L);
        dto.setReturnDate(LocalDate.now().toString());
        dto.setAssetCondition("normal");
        dto.setReceiveDepartment(department);
        return dto;
    }

    private EamReturnDispositionDTO disposition(String department) {
        EamReturnDispositionDTO dto = new EamReturnDispositionDTO();
        dto.setReturnId(11L);
        dto.setDisposition("idle");
        dto.setDispositionDate(LocalDate.now().toString());
        dto.setReceiveDepartment(department);
        return dto;
    }

    private EamReturnRecoverDTO recovery(String department) {
        EamReturnRecoverDTO dto = new EamReturnRecoverDTO();
        dto.setReturnId(11L);
        dto.setReceiveDepartment(department);
        return dto;
    }
}
