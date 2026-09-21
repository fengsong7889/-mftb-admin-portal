package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.entity.EamBorrow;
import com.mftb.admin.entity.EamClaim;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamAssetStateEventMapper;
import com.mftb.admin.mapper.EamBorrowMapper;
import com.mftb.admin.mapper.EamClaimMapper;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.service.EamAssetLifecycleService;
import com.mftb.admin.service.EamAssetLifecycleService.ClosedSource;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class EamAssetLifecycleServiceImplTest {

    @Mock private EamAssetMapper assetMapper;
    @Mock private EamClaimMapper claimMapper;
    @Mock private EamBorrowMapper borrowMapper;
    @Mock private EamLocationMapper locationMapper;
    @Mock private EamAssetStateEventMapper stateEventMapper;
    @Mock private OperatorResolver operatorResolver;

    @InjectMocks private EamAssetLifecycleServiceImpl service;

    private EamAsset heldAsset() {
        EamAsset asset = new EamAsset();
        asset.setId(1L);
        asset.setStatus("in_use");
        asset.setCurrentHolderId(22L);
        asset.setUserName("使用人");
        asset.setDepartment("運營部");
        return asset;
    }

    @Test
    void closesActiveClaimToLossClosed() {
        EamAsset asset = heldAsset();
        asset.setActiveClaimId(5L);
        EamClaim claim = new EamClaim();
        claim.setId(5L);
        claim.setStatus("claimed");
        claim.setEmployeeId(22L);
        when(claimMapper.selectForUpdate(5L)).thenReturn(claim);
        when(operatorResolver.currentOperatorName()).thenReturn("tester");

        ClosedSource closed = service.closeActiveSource(asset, EamAssetLifecycleService.CLOSE_LOSS, 99L, "報失");

        assertEquals("claim", closed.sourceType());
        assertEquals(5L, closed.sourceId());
        ArgumentCaptor<UpdateWrapper<EamClaim>> captor = ArgumentCaptor.forClass(UpdateWrapper.class);
        verify(claimMapper).update(isNull(), captor.capture());
        assertTrue(captor.getValue().getParamNameValuePairs().containsValue("loss_closed"));
    }

    @Test
    void closesActiveBorrowWhenNoActiveClaim() {
        EamAsset asset = heldAsset();
        EamBorrow borrow = new EamBorrow();
        borrow.setId(7L);
        borrow.setStatus("active");
        borrow.setHolderId(22L);
        borrow.setHolderName("借用人");
        when(borrowMapper.selectList(any())).thenReturn(List.of(borrow));
        when(borrowMapper.selectForUpdate(7L)).thenReturn(borrow);
        when(operatorResolver.currentOperatorName()).thenReturn("tester");

        ClosedSource closed = service.closeActiveSource(asset, EamAssetLifecycleService.CLOSE_SCRAP, 50L, "報廢");

        assertEquals("borrow", closed.sourceType());
        assertEquals(7L, closed.sourceId());
        ArgumentCaptor<UpdateWrapper<EamBorrow>> captor = ArgumentCaptor.forClass(UpdateWrapper.class);
        verify(borrowMapper).update(isNull(), captor.capture());
        assertTrue(captor.getValue().getParamNameValuePairs().containsValue("scrap_closed"));
    }

    @Test
    void releaseClearsHolderViaExplicitNullAndAppliesVersionIncrement() {
        EamAsset asset = heldAsset();
        when(operatorResolver.currentOperatorName()).thenReturn("tester");
        when(assetMapper.update(any(), any())).thenReturn(1);

        service.releaseAssetToStatus(asset, "lost", null, null);

        assertEquals("lost", asset.getStatus());
        ArgumentCaptor<UpdateWrapper<EamAsset>> captor = ArgumentCaptor.forClass(UpdateWrapper.class);
        verify(assetMapper).update(eq(asset), captor.capture());
        assertTrue(captor.getValue().getSqlSet().contains("current_holder_id="));
        assertTrue(captor.getValue().getSqlSet().contains("active_claim_id="));
    }

    @Test
    void releaseThrowsWhenAssetVersionChanged() {
        EamAsset asset = heldAsset();
        when(operatorResolver.currentOperatorName()).thenReturn("tester");
        when(assetMapper.update(any(), any())).thenReturn(0);

        assertThrows(BusinessException.class,
                () -> service.releaseAssetToStatus(asset, "lost", null, null));
    }
}
