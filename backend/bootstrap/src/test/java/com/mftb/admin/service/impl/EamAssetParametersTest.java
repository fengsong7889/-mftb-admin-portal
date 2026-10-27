package com.mftb.admin.service.impl;

import com.mftb.admin.dto.*;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** 只读参数来自同一实物台账，不修改单据快照、不新增写入。 */
@ExtendWith(MockitoExtension.class)
class EamAssetParametersTest {
    @Mock EamAssetMapper assets;
    @Mock EamClaimMapper claims;
    @Mock EamBorrowMapper borrows;
    @Mock EamReturnMapper returns;
    @Mock EamAssetTransferMapper transfers;
    @Mock EamHandoverMapper handovers;
    @Mock EamHandoverItemMapper handoverItems;
    @Mock EamCompensationMapper compensations;
    @Mock EamCompensationPaymentMapper payments;
    @Mock EamCompensationReviewMapper reviews;
    @Mock SysUserMapper users;
    @InjectMocks EamClaimServiceImpl claimService;
    @InjectMocks EamBorrowServiceImpl borrowService;
    @InjectMocks EamReturnServiceImpl returnService;
    @InjectMocks EamAssetTransferServiceImpl transferService;
    @InjectMocks EamHandoverServiceImpl handoverService;
    @InjectMocks EamCompensationServiceImpl compensationService;

    private EamAsset asset() {
        EamAsset asset = new EamAsset();
        asset.setId(7L);
        asset.setCategoryCode("0101");
        asset.setParams("{\"memory\":\"16GB\",\"count\":0}");
        return asset;
    }

    private void assertParams(Map<String, Object> params, String categoryCode) {
        assertEquals(Map.of("memory", "16GB", "count", 0), params);
        assertEquals("0101", categoryCode);
        verify(assets, never()).updateById(any(EamAsset.class));
    }

    @Test
    void claimDetailIncludesCurrentParameters() {
        EamClaim record = new EamClaim(); record.setId(1L); record.setAssetId(7L);
        when(claims.selectById(1L)).thenReturn(record);
        when(assets.selectById(7L)).thenReturn(asset());
        EamClaimVO vo = claimService.detail(1L);
        assertParams(vo.getParams(), vo.getCategoryCode());
    }

    @Test
    void borrowDetailIncludesCurrentParameters() {
        EamBorrow record = new EamBorrow(); record.setId(1L); record.setAssetId(7L);
        when(borrows.selectById(1L)).thenReturn(record);
        when(assets.selectById(7L)).thenReturn(asset());
        EamBorrowVO vo = borrowService.detail(1L);
        assertParams(vo.getParams(), vo.getCategoryCode());
    }

    @Test
    void returnDetailIncludesCurrentParameters() {
        EamReturn record = new EamReturn(); record.setId(1L); record.setAssetId(7L);
        when(returns.selectById(1L)).thenReturn(record);
        when(assets.selectById(7L)).thenReturn(asset());
        EamReturnVO vo = returnService.detail(1L);
        assertParams(vo.getParams(), vo.getCategoryCode());
    }

    @Test
    void transferKeepsSnapshotNameAndAddsCurrentParameters() {
        EamAssetTransfer record = new EamAssetTransfer(); record.setId(1L); record.setAssetId(7L);
        record.setStatus("cancelled"); record.setAssetName("调拨时名称");
        when(transfers.selectById(1L)).thenReturn(record);
        when(assets.selectById(7L)).thenReturn(asset());
        EamAssetTransferVO vo = transferService.detail(1L);
        assertParams(vo.getParams(), vo.getCategoryCode());
        assertEquals("调拨时名称", vo.getAssetName());
        verify(assets, times(1)).selectById(7L);
    }

    @Test
    void handoverBatchLoadsParametersWithoutChangingSnapshot() {
        EamHandover record = new EamHandover(); record.setId(1L);
        EamHandoverItem item = new EamHandoverItem(); item.setAssetId(7L); item.setAssetName("交接时名称");
        when(handovers.selectById(1L)).thenReturn(record);
        when(handoverItems.selectList(any())).thenReturn(List.of(item));
        when(assets.selectBatchIds(List.of(7L))).thenReturn(List.of(asset()));
        EamHandoverVO.HandoverItemVO vo = handoverService.detail(1L).getItems().get(0);
        assertParams(vo.getParams(), vo.getCategoryCode());
        assertEquals("交接时名称", vo.getAssetName());
        verify(assets, never()).selectById(any(Long.class));
    }

    @Test
    void compensationDetailIncludesCurrentParameters() {
        EamCompensation record = new EamCompensation(); record.setId(1L); record.setAssetId(7L);
        when(compensations.selectById(1L)).thenReturn(record);
        when(assets.selectById(7L)).thenReturn(asset());
        EamCompensationVO vo = compensationService.detail(1L);
        assertParams(vo.getParams(), vo.getCategoryCode());
    }

    @Test
    void deletedAssetDoesNotInventParameters() {
        EamBorrow record = new EamBorrow(); record.setId(1L); record.setAssetId(7L);
        when(borrows.selectById(1L)).thenReturn(record);
        assertNull(borrowService.detail(1L).getParams());
    }
}
