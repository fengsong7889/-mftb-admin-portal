package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamAssetTransferSaveDTO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamAssetTransfer;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamAssetTransferMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DepartmentService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EamAssetTransferServiceImplTest {
    @Mock private EamAssetTransferMapper transferMapper;
    @Mock private EamAssetMapper assetMapper;
    @Mock private SysUserMapper userMapper;
    @Mock private DepartmentService departmentService;
    @Mock private BizSeqService bizSeqService;
    @Mock private OperatorResolver operatorResolver;
    @InjectMocks private EamAssetTransferServiceImpl service;

    @ParameterizedTest
    @ValueSource(strings = {"不存在或已刪除", "已停用", "同名部門"})
    void rejectsInvalidDepartmentBeforeAnyWrite(String reason) {
        when(departmentService.requireEnabledDepartmentName("用戶運營部"))
                .thenThrow(new BusinessException(reason));

        assertEquals(reason, assertThrows(BusinessException.class,
                () -> service.register(dto("用戶運營部"))).getMessage());
        verifyNoInteractions(transferMapper, assetMapper, userMapper, bizSeqService);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" \t "})
    void departmentRemainsRequired(String name) {
        assertTrue(assertThrows(BusinessException.class,
                () -> service.register(dto(name))).getMessage().contains("新歸屬部門不能為空"));
        verifyNoInteractions(departmentService, transferMapper, assetMapper, bizSeqService);
    }

    @Test
    void storesCanonicalDepartmentAndHolderInAssetAndSnapshot() {
        when(departmentService.requireEnabledDepartmentName("  用戶運營部  ")).thenReturn("用戶運營部");
        EamAsset asset = new EamAsset();
        asset.setId(2L);
        asset.setStatus("in_use");
        asset.setDepartment("原部門");
        asset.setCurrentHolderId(22L);
        asset.setUserName("原使用人");
        when(assetMapper.selectOne(any())).thenReturn(asset);
        SysUser recipient = new SysUser();
        recipient.setId(20L);
        recipient.setName("接收人");
        recipient.setEmpId("MF00020");
        when(userMapper.selectOne(any())).thenReturn(recipient);
        when(bizSeqService.next(BizSeqService.RULE_EAM_TRANSFER)).thenReturn("DB202609170001");
        when(transferMapper.insert(any(EamAssetTransfer.class))).thenAnswer(invocation -> {
            invocation.getArgument(0, EamAssetTransfer.class).setId(11L);
            return 1;
        });

        assertEquals(11L, service.register(dto("  用戶運營部  ")));

        ArgumentCaptor<EamAssetTransfer> snapshot = ArgumentCaptor.forClass(EamAssetTransfer.class);
        verify(transferMapper).insert(snapshot.capture());
        assertEquals("用戶運營部", snapshot.getValue().getToDepartment());
        assertEquals("原部門", snapshot.getValue().getFromDepartment());
        assertEquals(22L, snapshot.getValue().getFromUserId());
        assertEquals(20L, snapshot.getValue().getToUserId());
        verify(assetMapper).updateById(asset);
        assertEquals("用戶運營部", asset.getDepartment());
        assertEquals(20L, asset.getCurrentHolderId());
        assertEquals("接收人", asset.getUserName());
    }

    private EamAssetTransferSaveDTO dto(String department) {
        EamAssetTransferSaveDTO dto = new EamAssetTransferSaveDTO();
        dto.setAssetId(2L);
        dto.setToUserName("接收人");
        dto.setToUserEmpId("MF00020");
        dto.setToDepartment(department);
        dto.setTransferDate(LocalDate.now().toString());
        dto.setReason("部門校驗測試");
        return dto;
    }
}
