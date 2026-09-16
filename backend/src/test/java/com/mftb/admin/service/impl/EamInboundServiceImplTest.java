package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamInboundCreateDTO;
import com.mftb.admin.entity.*;
import com.mftb.admin.mapper.*;
import com.mftb.admin.service.EamAssetService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * 验收入库 → 资产台账 → 采购订单回写 全链路回归测试。
 * 全程 mock Mapper，不连接数据库，聚焦数据一致性：
 * 逐件生成资产、批次统计、按订单明细精确回写、超收拦截、跨供应商同型号分行。
 */
@ExtendWith(MockitoExtension.class)
class EamInboundServiceImplTest {

    @Mock private EamInboundBatchMapper batchMapper;
    @Mock private EamInboundBatchItemMapper batchItemMapper;
    @Mock private EamPurchaseOrderMapper orderMapper;
    @Mock private EamPurchaseOrderItemMapper orderItemMapper;
    @Mock private EamAssetMapper assetMapper;
    @Mock private EamLocationMapper locationMapper;
    @Mock private EamModelMapper modelMapper;
    @Mock private EamAssetService assetService;
    @Mock private OperatorResolver operatorResolver;
    @Mock private BizSeqService bizSeqService;
    @InjectMocks private EamInboundServiceImpl service;

    private static final long PO_ID = 5L;
    private static final long LOCATION_ID = 9L;
    private static final long MODEL_ID = 77L;

    @BeforeAll
    static void initTableMetadata() {
        for (Class<?> entity : List.of(EamPurchaseOrder.class, EamPurchaseOrderItem.class,
                EamInboundBatch.class, EamAsset.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    @BeforeEach
    void setUp() {
        lenient().when(operatorResolver.currentOperatorName()).thenReturn("張三");
        lenient().when(bizSeqService.next(BizSeqService.RULE_EAM_INBOUND_BATCH)).thenReturn("IB202609150001");
        lenient().when(batchMapper.insert(any(EamInboundBatch.class))).thenAnswer(inv -> {
            inv.getArgument(0, EamInboundBatch.class).setId(100L);
            return 1;
        });
        EamLocation location = new EamLocation();
        location.setId(LOCATION_ID);
        location.setName("倉庫A");
        lenient().when(locationMapper.selectById(LOCATION_ID)).thenReturn(location);
        EamModel model = new EamModel();
        model.setId(MODEL_ID);
        model.setUnit("台");
        lenient().when(modelMapper.selectById(MODEL_ID)).thenReturn(model);
    }

    private EamPurchaseOrder order(String execStatus, String status) {
        EamPurchaseOrder o = new EamPurchaseOrder();
        o.setId(PO_ID);
        o.setPoNo("DDCG202609150005");
        o.setBrand(1);
        o.setDepartment("物資部");
        o.setRemark("季度採購");
        o.setExecStatus(execStatus);
        o.setStatus(status);
        o.setReturnQty(0);
        o.setExchangeQty(0);
        o.setConcessionQty(0);
        return o;
    }

    private EamPurchaseOrderItem item(long id, long modelId, int qty, int received) {
        EamPurchaseOrderItem it = new EamPurchaseOrderItem();
        it.setId(id);
        it.setOrderId(PO_ID);
        it.setGroupId("sg_" + id);
        it.setModelId(modelId);
        it.setModelName("iPhone 15 Pro");
        it.setCategoryId(3L);
        it.setCategoryName("電子設備");
        it.setCategoryCode("EC");
        it.setBrandId(8L);
        it.setBrandName("Apple");
        it.setPurchaseType("purchase");
        it.setPrice(new BigDecimal("8000"));
        it.setConfirmedPrice(new BigDecimal("8999"));
        it.setQty(qty);
        it.setReceivedQty(received);
        return it;
    }

    private EamInboundCreateDTO.InboundItem dtoItem(Long orderItemId, int qty, String disposition, boolean withPhoto) {
        EamInboundCreateDTO.InboundItem di = new EamInboundCreateDTO.InboundItem();
        di.setOrderItemId(orderItemId);
        di.setQty(qty);
        di.setLocationId(LOCATION_ID);
        di.setDisposition(disposition);
        if (withPhoto) {
            di.setPhotos(List.of(Map.of("name", "a.jpg", "dataUrl", "data:image/png;base64,AAA")));
        }
        return di;
    }

    private EamInboundCreateDTO dto(List<EamInboundCreateDTO.InboundItem> items) {
        EamInboundCreateDTO dto = new EamInboundCreateDTO();
        dto.setPoId(PO_ID);
        dto.setInboundDate("2026-09-15");
        dto.setRemark("驗收入庫");
        dto.setItems(items);
        return dto;
    }

    @SuppressWarnings("unchecked")
    private ArgumentCaptor<Wrapper<EamPurchaseOrder>> orderUpdateCaptor() {
        return ArgumentCaptor.forClass(Wrapper.class);
    }

    @Test
    void fullReceiveGeneratesOneAssetPerUnitAndMarksOrderReceived() {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("completed", "pending"));
        when(orderItemMapper.selectList(any()))
                .thenReturn(List.of(item(10L, MODEL_ID, 3, 0)))
                .thenReturn(List.of(item(10L, MODEL_ID, 3, 3)));
        when(assetService.generateAssetNo(any(), any(), any()))
                .thenReturn("TB-ZH-EC-0001", "TB-ZH-EC-0002", "TB-ZH-EC-0003");
        when(orderItemMapper.update(isNull(), any())).thenReturn(1);

        Map<String, Object> result = service.createBatch(dto(new ArrayList<>(List.of(dtoItem(10L, 3, "pass", true)))));

        assertEquals(3, result.get("generatedAssetCount"));

        ArgumentCaptor<EamAsset> assetCaptor = ArgumentCaptor.forClass(EamAsset.class);
        verify(assetMapper, times(3)).insert(assetCaptor.capture());
        List<String> nos = new ArrayList<>();
        for (EamAsset a : assetCaptor.getAllValues()) {
            assertEquals(100L, a.getBatchId());
            assertEquals(PO_ID, a.getOrderId());
            assertEquals(MODEL_ID, a.getModelId());
            assertEquals("idle", a.getStatus());
            assertEquals("self", a.getSource());
            assertEquals("owned", a.getHoldType());
            assertEquals("電子設備", a.getAssetType());
            assertEquals("EC", a.getCategoryCode());
            assertEquals("Apple", a.getBrand());
            assertEquals(8L, a.getBrandId());
            assertEquals(1, a.getCompanyBrand());
            assertEquals("物資部", a.getDepartment());
            assertNull(a.getUserName());
            assertEquals("倉庫A", a.getLocation());
            assertEquals(LOCATION_ID, a.getLocationId());
            assertEquals("台", a.getUnit());
            assertEquals("2026-09-15", a.getPurchaseDate());
            assertEquals(0, new BigDecimal("8999").compareTo(a.getPurchaseValue()));
            assertEquals("data:image/png;base64,AAA", a.getImages());
            assertEquals("張三", a.getUpdatedBy());
            nos.add(a.getAssetNo());
        }
        assertEquals(List.of("TB-ZH-EC-0001", "TB-ZH-EC-0002", "TB-ZH-EC-0003"), nos);

        // 批次统计与生成资产一致
        ArgumentCaptor<EamInboundBatch> batchCaptor = ArgumentCaptor.forClass(EamInboundBatch.class);
        verify(batchMapper).insert(batchCaptor.capture());
        EamInboundBatch batch = batchCaptor.getValue();
        assertEquals(3, batch.getTotalQty());
        assertEquals(3, batch.getAcceptedQty());
        assertEquals(0, batch.getPendingQty());
        assertEquals(0, batch.getReturnQty());
        assertEquals(1, batch.getBrand());

        // 订单明细 receivedQty 回写为 3
        ArgumentCaptor<Wrapper<EamPurchaseOrderItem>> itemCaptor = ArgumentCaptor.forClass(Wrapper.class);
        verify(orderItemMapper, times(1)).update(isNull(), itemCaptor.capture());
        assertTrue(((LambdaUpdateWrapper<EamPurchaseOrderItem>) itemCaptor.getValue())
                .getParamNameValuePairs().containsValue(3));

        // 订单整体状态回写为 received
        ArgumentCaptor<Wrapper<EamPurchaseOrder>> oc = orderUpdateCaptor();
        verify(orderMapper).update(isNull(), oc.capture());
        assertTrue(((LambdaUpdateWrapper<EamPurchaseOrder>) oc.getValue())
                .getParamNameValuePairs().containsValue("received"));
    }

    @Test
    void returnDispositionCountsSeparatelyAndLeavesOrderPartial() {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("completed", "pending"));
        EamPurchaseOrderItem updatedItem = item(10L, MODEL_ID, 4, 2);
        updatedItem.setReturnedQty(1);
        when(orderItemMapper.selectList(any()))
                .thenReturn(List.of(item(10L, MODEL_ID, 4, 0)))
                .thenReturn(List.of(updatedItem));
        when(assetService.generateAssetNo(any(), any(), any()))
                .thenReturn("TB-ZH-EC-0001", "TB-ZH-EC-0002");
        when(orderItemMapper.update(isNull(), any())).thenReturn(1);

        List<EamInboundCreateDTO.InboundItem> items = new ArrayList<>();
        items.add(dtoItem(10L, 2, "pass", false));
        items.add(dtoItem(10L, 1, "return", false));
        Map<String, Object> result = service.createBatch(dto(items));

        // 仅通过项生成资产
        assertEquals(2, result.get("generatedAssetCount"));
        verify(assetMapper, times(2)).insert(any(EamAsset.class));

        ArgumentCaptor<EamInboundBatch> bc = ArgumentCaptor.forClass(EamInboundBatch.class);
        verify(batchMapper).insert(bc.capture());
        assertEquals(3, bc.getValue().getTotalQty());
        assertEquals(2, bc.getValue().getAcceptedQty());
        assertEquals(1, bc.getValue().getReturnQty());
        assertEquals(1, bc.getValue().getPendingQty());

        ArgumentCaptor<Wrapper<EamPurchaseOrder>> oc = orderUpdateCaptor();
        verify(orderMapper).update(isNull(), oc.capture());
        assertTrue(((LambdaUpdateWrapper<EamPurchaseOrder>) oc.getValue())
                .getParamNameValuePairs().containsValue("partial"));
    }

    @Test
    void allReturnedCompletesOrderWithoutCreatingAssets() {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("completed", "pending"));
        EamPurchaseOrderItem returned = item(10L, MODEL_ID, 2, 0);
        returned.setReturnedQty(2);
        when(orderItemMapper.selectList(any()))
                .thenReturn(List.of(item(10L, MODEL_ID, 2, 0)))
                .thenReturn(List.of(returned));

        Map<String, Object> result = service.createBatch(dto(List.of(dtoItem(10L, 2, "return", false))));

        assertEquals(0, result.get("generatedAssetCount"));
        verify(assetMapper, never()).insert(any(EamAsset.class));
        ArgumentCaptor<EamInboundBatch> batch = ArgumentCaptor.forClass(EamInboundBatch.class);
        verify(batchMapper).insert(batch.capture());
        assertEquals(0, batch.getValue().getAcceptedQty());
        assertEquals(2, batch.getValue().getReturnQty());
        ArgumentCaptor<Wrapper<EamPurchaseOrder>> update = orderUpdateCaptor();
        verify(orderMapper).update(isNull(), update.capture());
        assertTrue(((LambdaUpdateWrapper<EamPurchaseOrder>) update.getValue())
                .getParamNameValuePairs().containsValue("received"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"exchange", "concession"})
    void nonAcceptedDispositionDoesNotCreateAssetsOrFinishOrder(String disposition) {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("completed", "pending"));
        when(orderItemMapper.selectList(any())).thenReturn(List.of(item(10L, MODEL_ID, 2, 0)));

        Map<String, Object> result = service.createBatch(dto(List.of(dtoItem(10L, 2, disposition, false))));

        assertEquals(0, result.get("generatedAssetCount"));
        verify(assetMapper, never()).insert(any(EamAsset.class));
        ArgumentCaptor<EamInboundBatch> batch = ArgumentCaptor.forClass(EamInboundBatch.class);
        verify(batchMapper).insert(batch.capture());
        assertEquals(0, batch.getValue().getAcceptedQty());
        assertEquals(0, batch.getValue().getReturnQty());
        assertEquals(2, batch.getValue().getPendingQty());
        assertEquals("exchange".equals(disposition) ? 2 : 0, batch.getValue().getExchangeQty());
        assertEquals("concession".equals(disposition) ? 2 : 0, batch.getValue().getConcessionQty());
        ArgumentCaptor<EamInboundBatchItem> row = ArgumentCaptor.forClass(EamInboundBatchItem.class);
        verify(batchItemMapper).insert(row.capture());
        assertEquals("exchange".equals(disposition) ? "pending" : null, row.getValue().getExchangeStatus());
        assertNull(row.getValue().getLocationId());
        ArgumentCaptor<Wrapper<EamPurchaseOrder>> update = orderUpdateCaptor();
        verify(orderMapper).update(isNull(), update.capture());
        assertTrue(((LambdaUpdateWrapper<EamPurchaseOrder>) update.getValue())
                .getParamNameValuePairs().containsValue("pending"));
    }

    @Test
    void repeatedRowsMustShareTheRemainingQuantityIncludingPriorReturns() {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("completed", "partial"));
        EamPurchaseOrderItem remaining = item(10L, MODEL_ID, 4, 1);
        remaining.setReturnedQty(1);
        when(orderItemMapper.selectList(any())).thenReturn(List.of(remaining));

        BusinessException ex = assertThrows(BusinessException.class, () -> service.createBatch(dto(List.of(
                dtoItem(10L, 1, "pass", false), dtoItem(10L, 2, "return", false)))));

        assertTrue(ex.getMessage().contains("超出訂單剩餘數量"));
        verifyNoInteractions(batchMapper, batchItemMapper, assetMapper);
        verify(orderItemMapper, never()).update(any(), any());
    }

    @Test
    void leaseSourceStillStartsIdleAndOwnedWithFallbackPrice() {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("completed", "pending"));
        EamPurchaseOrderItem leaseItem = item(10L, MODEL_ID, 1, 0);
        leaseItem.setPurchaseType("lease");
        leaseItem.setConfirmedPrice(null);
        leaseItem.setParams("{\"storage\":\"256GB\"}");
        when(orderItemMapper.selectList(any()))
                .thenReturn(List.of(leaseItem)).thenReturn(List.of(item(10L, MODEL_ID, 1, 1)));
        when(orderItemMapper.update(isNull(), any())).thenReturn(1);
        when(assetService.generateAssetNo(any(), any(), any())).thenReturn("TB-ZH-EC-0001");

        service.createBatch(dto(List.of(dtoItem(10L, 1, "pass", false))));

        ArgumentCaptor<EamAsset> asset = ArgumentCaptor.forClass(EamAsset.class);
        verify(assetMapper).insert(asset.capture());
        assertEquals("lease", asset.getValue().getSource());
        assertEquals("owned", asset.getValue().getHoldType());
        assertEquals("idle", asset.getValue().getStatus());
        assertEquals(leaseItem.getPrice(), asset.getValue().getPurchaseValue());
        assertEquals(leaseItem.getParams(), asset.getValue().getParams());
    }

    @Test
    void oversubmissionIsRejectedBeforeAnyWrite() {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("completed", "partial"));
        when(orderItemMapper.selectList(any())).thenReturn(List.of(item(10L, MODEL_ID, 3, 2)));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBatch(dto(new ArrayList<>(List.of(dtoItem(10L, 2, "pass", false))))));
        assertTrue(ex.getMessage().contains("超出訂單剩餘數量"));

        verify(batchMapper, never()).insert(any(EamInboundBatch.class));
        verify(assetMapper, never()).insert(any(EamAsset.class));
        verify(orderItemMapper, never()).update(any(), any());
        verify(orderMapper, never()).update(any(), any());
    }

    @Test
    void notCompletedOrderCannotBeReceived() {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("purchasing", "pending"));

        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.createBatch(dto(new ArrayList<>(List.of(dtoItem(10L, 1, "pass", false))))));
        assertTrue(ex.getMessage().contains("採購完成後才可驗收入庫"));
        verify(assetMapper, never()).insert(any(EamAsset.class));
    }

    @Test
    void sameModelAcrossSuppliersWritesBackPerOrderItem() {
        when(orderMapper.selectForUpdate(PO_ID)).thenReturn(order("completed", "pending"));
        when(orderItemMapper.selectList(any()))
                .thenReturn(List.of(item(10L, MODEL_ID, 2, 0), item(11L, MODEL_ID, 2, 0)))
                .thenReturn(List.of(item(10L, MODEL_ID, 2, 2), item(11L, MODEL_ID, 2, 1)));
        when(assetService.generateAssetNo(any(), any(), any()))
                .thenReturn("TB-ZH-EC-0001", "TB-ZH-EC-0002", "TB-ZH-EC-0003");
        when(orderItemMapper.update(isNull(), any())).thenReturn(1);

        List<EamInboundCreateDTO.InboundItem> items = new ArrayList<>();
        items.add(dtoItem(10L, 2, "pass", false));
        items.add(dtoItem(11L, 1, "pass", false));
        Map<String, Object> result = service.createBatch(dto(items));

        assertEquals(3, result.get("generatedAssetCount"));

        // 两条明细分别回写：item10 → 2, item11 → 1（按 orderItemId 而非 modelId）
        ArgumentCaptor<Wrapper<EamPurchaseOrderItem>> ic = ArgumentCaptor.forClass(Wrapper.class);
        verify(orderItemMapper, times(2)).update(isNull(), ic.capture());
        List<Object> receivedValues = new ArrayList<>();
        for (Wrapper<EamPurchaseOrderItem> w : ic.getAllValues()) {
            receivedValues.addAll(((LambdaUpdateWrapper<EamPurchaseOrderItem>) w).getParamNameValuePairs().values());
        }
        assertTrue(receivedValues.contains(2));
        assertTrue(receivedValues.contains(1));

        // 订单未全部验收 → partial
        ArgumentCaptor<Wrapper<EamPurchaseOrder>> oc = orderUpdateCaptor();
        verify(orderMapper).update(isNull(), oc.capture());
        assertTrue(((LambdaUpdateWrapper<EamPurchaseOrder>) oc.getValue())
                .getParamNameValuePairs().containsValue("partial"));
    }
}
