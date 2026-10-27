package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.contracts.eam.EamAssetReclaimPort;
import com.mftb.admin.dto.EamHandoverSaveDTO;
import com.mftb.admin.dto.EamHandoverVO;
import com.mftb.admin.entity.EamAsset;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.service.EamAssetReclaimAdapter;
import com.mftb.admin.service.EamHandoverService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 资产回收契约的 EAM 侧测试。
 *
 * 这些断言原先长在 HrOffboardingTaskServiceTest 里（HR 侧直接调 assetMapper/handoverService 时）。
 * 域边界建成后，资产筛选、交接单字段组装与单号回读都属于 EAM 域内行为，
 * 因此断言整体搬到这里；HR 侧只保留「发起一次 + 回写单号」的契约边界断言。
 */
class EamAssetReclaimAdapterTest {

    private static final Long LEAVING_ID = 11L;

    private EamAssetMapper assetMapper;
    private EamHandoverService handoverService;
    private EamAssetReclaimAdapter adapter;

    @BeforeEach
    void setUp() {
        assetMapper = mock(EamAssetMapper.class);
        handoverService = mock(EamHandoverService.class);
        adapter = new EamAssetReclaimAdapter(assetMapper, handoverService);
    }

    @Test
    @DisplayName("只为名下在用资产发起交接：资产 ID 全量带入，原因与接收人保持离职语义")
    void handoverIncludesAllInUseAssets() {
        when(assetMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(asset(1L), asset(2L)));
        when(handoverService.register(any(EamHandoverSaveDTO.class))).thenReturn(777L);
        EamHandoverVO created = new EamHandoverVO();
        created.setHandoverNo("HO202610180001");
        when(handoverService.detail(777L)).thenReturn(created);

        Optional<EamAssetReclaimPort.HandoverResult> result = adapter.handoverInUseAssets(LEAVING_ID, command());

        assertTrue(result.isPresent());
        assertEquals(2, result.get().assetCount());
        assertEquals("HO202610180001", result.get().handoverNo(), "优先回读业务单号");

        ArgumentCaptor<EamHandoverSaveDTO> captor = ArgumentCaptor.forClass(EamHandoverSaveDTO.class);
        verify(handoverService).register(captor.capture());
        EamHandoverSaveDTO dto = captor.getValue();
        assertEquals("resign", dto.getReason());
        assertEquals("employee", dto.getReceiverType());
        assertEquals("王小美", dto.getToUserName());
        assertEquals(List.of(1L, 2L), dto.getAssetIds());
        assertEquals("離職單據 HR001 聯動自動發起", dto.getRemark());
    }

    @Test
    @DisplayName("名下没有在用资产 → 返回 empty 且不建交接单（上层据此记 SKIPPED）")
    void noInUseAssetsSkipsHandover() {
        when(assetMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        assertTrue(adapter.handoverInUseAssets(LEAVING_ID, command()).isEmpty());
        verify(handoverService, never()).register(any());
    }

    @Test
    @DisplayName("交接单号回读失败时退回内部编号，不能让 targetRef 变空")
    void fallsBackToInternalIdWhenHandoverNoMissing() {
        when(assetMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(asset(9L)));
        when(handoverService.register(any(EamHandoverSaveDTO.class))).thenReturn(888L);
        when(handoverService.detail(anyLong())).thenReturn(null);

        Optional<EamAssetReclaimPort.HandoverResult> result = adapter.handoverInUseAssets(LEAVING_ID, command());

        assertTrue(result.isPresent());
        assertEquals("888", result.get().handoverNo());
    }

    private static EamAssetReclaimPort.ResignationHandoverCommand command() {
        return new EamAssetReclaimPort.ResignationHandoverCommand(
                "李大仁", "技術部", "王小美", "行政部", "employee",
                "2026-10-18", "resign", "HR專員", "離職單據 HR001 聯動自動發起");
    }

    private static EamAsset asset(Long id) {
        EamAsset a = new EamAsset();
        a.setId(id);
        return a;
    }
}
