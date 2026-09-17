package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamAssetTransferSaveDTO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamAssetTransfer;
import com.mftb.admin.entity.EamClaim;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamAssetTransferMapper;
import com.mftb.admin.mapper.EamClaimMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.EamAssetService;
import com.mftb.admin.service.EamTransferLookup;
import com.mftb.admin.service.EamTransferRules;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EamAssetTransferServiceImplTest {
    @Mock private EamAssetTransferMapper transferMapper;
    @Mock private EamAssetMapper assetMapper;
    @Mock private SysUserMapper userMapper;
    @Mock private EamClaimMapper claimMapper;
    @Mock private EamAssetService assetService;
    @Mock private EamTransferLookup lookup;
    @Mock private EamTransferRules rules;
    @Mock private BizSeqService bizSeqService;
    @Mock private OperatorResolver operatorResolver;
    @InjectMocks private EamAssetTransferServiceImpl service;

    @Test
    void rejectsMissingRequiredFields() {
        // assetId null
        EamAssetTransferSaveDTO noAsset = dto();
        noAsset.setAssetId(null);
        assertEquals("請選擇資產、接收人及調入部門",
                assertThrows(BusinessException.class, () -> service.register(noAsset)).getMessage());

        // toUserId null
        EamAssetTransferSaveDTO noUser = dto();
        noUser.setToUserId(null);
        assertEquals("請選擇資產、接收人及調入部門",
                assertThrows(BusinessException.class, () -> service.register(noUser)).getMessage());

        // toDepartmentId null
        EamAssetTransferSaveDTO noDept = dto();
        noDept.setToDepartmentId(null);
        assertEquals("請選擇資產、接收人及調入部門",
                assertThrows(BusinessException.class, () -> service.register(noDept)).getMessage());
    }

    @Test
    void rejectsInvalidRequestKey() {
        EamAssetTransferSaveDTO dto = dto();
        dto.setRequestKey("bad!");
        assertEquals("請刷新頁面後重新提交",
                assertThrows(BusinessException.class, () -> service.register(dto)).getMessage());
    }

    @Test
    void rejectsReasonTooLong() {
        EamAssetTransferSaveDTO dto = dto();
        dto.setReason("x".repeat(501));
        assertEquals("調撥原因最多 500 字元",
                assertThrows(BusinessException.class, () -> service.register(dto)).getMessage());
    }

    @Test
    void rejectsFutureTransferDate() {
        when(operatorResolver.currentUser()).thenReturn(operator());
        EamAssetTransferSaveDTO dto = dto();
        dto.setTransferDate(LocalDate.now().plusDays(1).toString());
        assertEquals("調撥日期不可晚於今日",
                assertThrows(BusinessException.class, () -> service.register(dto)).getMessage());
    }

    @Test
    void rejectsWhenOperatorMissing() {
        when(operatorResolver.currentUser()).thenReturn(null);
        assertEquals("請先登入",
                assertThrows(BusinessException.class, () -> service.register(dto())).getMessage());
    }

    @Test
    void rejectsWhenAssetNotFound() {
        when(operatorResolver.currentUser()).thenReturn(operator());
        when(assetMapper.selectById(2L)).thenReturn(null);
        assertEquals("資產不存在",
                assertThrows(BusinessException.class, () -> service.register(dto())).getMessage());
    }

    @Test
    void rejectsWhenRulesBlocked() {
        when(operatorResolver.currentUser()).thenReturn(operator());
        EamAsset asset = asset();
        when(assetMapper.selectById(2L)).thenReturn(asset);
        when(assetMapper.selectOne(any())).thenReturn(asset);
        EamClaim claim = claim();
        when(claimMapper.selectForUpdate(1L)).thenReturn(claim);
        when(rules.blocked(any(), any())).thenReturn("僅使用中資產可調撥");
        assertEquals("僅使用中資產可調撥",
                assertThrows(BusinessException.class, () -> service.register(dto())).getMessage());
    }

    private EamAssetTransferSaveDTO dto() {
        EamAssetTransferSaveDTO dto = new EamAssetTransferSaveDTO();
        dto.setAssetId(2L);
        dto.setToUserId(20L);
        dto.setToUserEmpId("MF00020");
        dto.setToUserName("接收人");
        dto.setToDepartmentId(10L);
        dto.setTransferDate(LocalDate.now().toString());
        dto.setReason("部門校驗測試");
        dto.setExpectedVersion(1L);
        dto.setRequestKey("test-request-key-1234567890");
        return dto;
    }

    private SysUser operator() {
        SysUser u = new SysUser();
        u.setId(1L);
        u.setName("管理員");
        u.setUsername("admin");
        return u;
    }

    private EamAsset asset() {
        EamAsset a = new EamAsset();
        a.setId(2L);
        a.setStatus("in_use");
        a.setHoldType("owned");
        a.setHoldVersion(1L);
        a.setDepartment("原部門");
        a.setCurrentHolderId(22L);
        a.setUserName("原使用人");
        a.setActiveClaimId(1L);
        return a;
    }

    private EamClaim claim() {
        EamClaim c = new EamClaim();
        c.setId(1L);
        c.setAssetId(2L);
        c.setEmployeeId(22L);
        c.setStatus("claimed");
        c.setClaimDate(LocalDate.now().minusDays(10));
        return c;
    }
}
