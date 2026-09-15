package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.entity.EamPurchaseOrder;
import com.mftb.admin.entity.EamPurchaseOrderItem;
import com.mftb.admin.entity.EamPurchaseRequest;
import com.mftb.admin.entity.OaRequest;
import com.mftb.admin.mapper.EamPurchaseOrderItemMapper;
import com.mftb.admin.mapper.EamPurchaseOrderMapper;
import com.mftb.admin.mapper.EamPurchaseRequestMapper;
import com.mftb.admin.mapper.OaRequestMapper;
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

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 采购订单关联数据回归测试，不连接真实数据库。 */
@ExtendWith(MockitoExtension.class)
class EamPurchaseServiceImplTest {
    @Mock private EamPurchaseOrderMapper orderMapper;
    @Mock private EamPurchaseOrderItemMapper itemMapper;
    @Mock private EamPurchaseRequestMapper requestMapper;
    @Mock private OaRequestMapper oaRequestMapper;
    @Mock private OperatorResolver operatorResolver;
    @Mock private BizSeqService bizSeqService;
    @InjectMocks private EamPurchaseServiceImpl service;

    private EamPurchaseOrder order;
    private EamPurchaseRequest request;

    @BeforeAll
    static void initTableMetadata() {
        for (Class<?> entity : List.of(EamPurchaseOrder.class, EamPurchaseOrderItem.class,
                EamPurchaseRequest.class, OaRequest.class)) {
            TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), entity);
        }
    }

    @BeforeEach
    void setUp() {
        order = new EamPurchaseOrder();
        order.setId(30L);
        order.setPoNo("DDCG202609150003");
        order.setReqId(3L);
        request = new EamPurchaseRequest();
        request.setId(3L);
        request.setReqNo("CG202609150002");
        request.setFlowNo("CG202609150002");
    }

    private void mockDetail() {
        when(orderMapper.selectById(order.getId())).thenReturn(order);
        if (order.getReqId() != null && order.getReqId() > 0) {
            when(requestMapper.selectBatchIds(List.of(order.getReqId()))).thenReturn(List.of(request));
        }
    }

    private OaRequest oaRequest(String flowNo, String formData) {
        OaRequest oa = new OaRequest();
        oa.setFlowNo(flowNo);
        oa.setFormData(formData);
        return oa;
    }

    @Test
    void detailReturnsRequestNumberAndPreservesOrderBrand() {
        order.setBrand(2);
        request.setBrand(1);
        mockDetail();

        Map<String, Object> detail = service.getOrderDetail(order.getId());

        assertEquals("CG202609150002", detail.get("reqNo"));
        assertEquals(3L, detail.get("reqId"));
        assertEquals(2, detail.get("brand"));
        verifyNoInteractions(oaRequestMapper);
    }

    @Test
    void missingOrderBrandUsesPurchaseRequestBrand() {
        request.setBrand(1);
        mockDetail();

        assertEquals(1, service.getOrderDetail(order.getId()).get("brand"));
        verifyNoInteractions(oaRequestMapper);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"brand\":1}", "{\"brand\":\"1\"}"})
    void legacyOrderUsesOriginalOaFormWithoutDatabaseWrites(String formData) {
        mockDetail();
        when(oaRequestMapper.selectList(any())).thenReturn(List.of(oaRequest(request.getFlowNo(), formData)));

        Map<String, Object> detail = service.getOrderDetail(order.getId());

        assertEquals(1, detail.get("brand"));
        assertEquals(request.getReqNo(), detail.get("reqNo"));
        assertNull(order.getBrand());
        verify(orderMapper).selectById(order.getId());
        verify(requestMapper).selectBatchIds(List.of(3L));
        verifyNoMoreInteractions(orderMapper, requestMapper);
        verify(oaRequestMapper).selectList(argThat((LambdaQueryWrapper<OaRequest> query) -> {
            query.getSqlSegment();
            return query.getParamNameValuePairs().containsValue("oa_purchase")
                    && query.getParamNameValuePairs().containsValue("CG202609150002");
        }));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"brand\":null}", "{\"brand\":\"unknown\"}", "null", "invalid-json"})
    void missingOrInvalidOriginalBrandStaysEmpty(String formData) {
        mockDetail();
        when(oaRequestMapper.selectList(any())).thenReturn(List.of(oaRequest(request.getFlowNo(), formData)));

        assertNull(service.getOrderDetail(order.getId()).get("brand"));
    }

    @Test
    void missingOaRecordStaysEmpty() {
        mockDetail();
        assertNull(service.getOrderDetail(order.getId()).get("brand"));
    }

    @Test
    void directOrderDoesNotQueryRequests() {
        order.setReqId(0L);
        order.setBrand(2);
        mockDetail();

        Map<String, Object> detail = service.getOrderDetail(order.getId());

        assertNull(detail.get("reqNo"));
        assertEquals(2, detail.get("brand"));
        verifyNoInteractions(requestMapper, oaRequestMapper);
    }

    @Test
    void missingPurchaseRequestDoesNotInventFlowOrBrand() {
        when(orderMapper.selectById(order.getId())).thenReturn(order);

        Map<String, Object> detail = service.getOrderDetail(order.getId());

        assertNull(detail.get("reqNo"));
        assertNull(detail.get("brand"));
        verifyNoInteractions(oaRequestMapper);
    }

    @Test
    void pageAndDetailReturnTheSameBrandAndRequestNumber() {
        mockDetail();
        when(oaRequestMapper.selectList(any())).thenReturn(List.of(oaRequest(request.getFlowNo(), "{\"brand\":2}")));
        Page<EamPurchaseOrder> page = new Page<>(1, 10, 1);
        page.setRecords(List.of(order));
        when(orderMapper.selectPage(org.mockito.ArgumentMatchers.<Page<EamPurchaseOrder>>any(), any())).thenReturn(page);

        Map<String, Object> record = service.pageOrders(1, 10, null, null, null, null,
                null, null, null, null, null, null).getRecords().get(0);
        Map<String, Object> detail = service.getOrderDetail(order.getId());

        assertEquals("CG202609150002", record.get("reqNo"));
        assertEquals(2, record.get("brand"));
        assertEquals(record.get("reqNo"), detail.get("reqNo"));
        assertEquals(record.get("brand"), detail.get("brand"));
    }

    @Test
    void pageResolvesBrandsByFlowNumberInOneBatch() {
        EamPurchaseOrder other = new EamPurchaseOrder();
        other.setId(31L);
        other.setReqId(4L);
        EamPurchaseRequest otherRequest = new EamPurchaseRequest();
        otherRequest.setId(4L);
        otherRequest.setReqNo("CG202609150003");
        otherRequest.setFlowNo("CG202609150003");
        Page<EamPurchaseOrder> page = new Page<>(1, 10, 2);
        page.setRecords(List.of(order, other));
        when(orderMapper.selectPage(org.mockito.ArgumentMatchers.<Page<EamPurchaseOrder>>any(), any())).thenReturn(page);
        when(requestMapper.selectBatchIds(List.of(3L, 4L))).thenReturn(List.of(request, otherRequest));
        when(oaRequestMapper.selectList(any())).thenReturn(List.of(
                oaRequest(otherRequest.getFlowNo(), "{\"brand\":2}"),
                oaRequest(request.getFlowNo(), "{\"brand\":1}")));

        List<Map<String, Object>> records = service.pageOrders(1, 10, null, null, null, null,
                null, null, null, null, null, null).getRecords();

        assertEquals(1, records.get(0).get("brand"));
        assertEquals(2, records.get(1).get("brand"));
        assertEquals(otherRequest.getReqNo(), records.get(1).get("reqNo"));
        verify(oaRequestMapper, times(1)).selectList(any());
        verify(requestMapper, times(1)).selectBatchIds(anyCollection());
    }

    @Test
    void automaticallyCreatedOrderPersistsRequestBrand() {
        request.setBrand(1);
        when(requestMapper.selectById(3L)).thenReturn(request);
        when(bizSeqService.next(BizSeqService.RULE_EAM_PURCHASE_ORDER)).thenReturn(order.getPoNo());
        when(orderMapper.insert(any(EamPurchaseOrder.class))).thenAnswer(invocation -> {
            EamPurchaseOrder created = invocation.getArgument(0);
            created.setId(30L);
            return 1;
        });

        assertEquals(30L, service.createOrderFromRequest(3L, List.of()));

        ArgumentCaptor<EamPurchaseOrder> captor = ArgumentCaptor.forClass(EamPurchaseOrder.class);
        verify(orderMapper).insert(captor.capture());
        assertEquals(1, captor.getValue().getBrand());
        assertEquals(3L, captor.getValue().getReqId());
    }
}
