package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamClaimQuery;
import com.mftb.admin.dto.EamClaimStatsVO;
import com.mftb.admin.entity.EamClaim;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamClaimEventMapper;
import com.mftb.admin.mapper.EamClaimEvidenceMapper;
import com.mftb.admin.mapper.EamClaimMapper;
import com.mftb.admin.mapper.EmpPositionRecordMapper;
import com.mftb.admin.mapper.SysConfigMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.DingTalkAppService;
import com.mftb.admin.service.EamReturnService;
import com.mftb.admin.service.EamTransferLookup;
import com.mftb.admin.service.NotificationAppService;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 领用统计（个人视图「我的资产」）口径测试。
 *
 * <p>现场缺陷：卡片显示「在用資產 1」，点进「在用資產」页签列表却是 2 条。
 * 双层根因：一是首卡用 claimed+returned 拼算，漏掉待签/取消/遗失/报废/送修等记录，
 * 与「全部記錄」页签天然对不上；二是统计只在前端挂载时取一次，之后不刷新。
 *
 * <p>这里锁住后端这一层：四张卡各自的条件必须与对应页签一致，
 * 首卡用不加状态条件的 totalCount，而不是把两个状态相加。
 */
class EamClaimStatsScopeTest {

    private static final long SELF_ID = 2L;
    private static final long OTHER_ID = 7L;

    private EamClaimMapper claimMapper;
    private EamClaimServiceImpl service;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), EamClaim.class);
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysUser.class);
        claimMapper = mock(EamClaimMapper.class);
        OperatorResolver resolver = mock(OperatorResolver.class);
        when(resolver.currentUser()).thenReturn(user(SELF_ID, "MF00002"));
        lenient().when(resolver.currentOperatorName()).thenReturn("馮松");
        service = new EamClaimServiceImpl(claimMapper,
                mock(EamClaimEvidenceMapper.class),
                mock(EamReturnService.class),
                mock(EamClaimEventMapper.class),
                mock(EamAssetMapper.class),
                mock(SysUserMapper.class),
                mock(EmpPositionRecordMapper.class),
                mock(BizSeqService.class),
                resolver,
                mock(DingTalkAppService.class),
                mock(NotificationAppService.class),
                mock(SysConfigMapper.class),
                mock(EamTransferLookup.class));
    }

    private static SysUser user(long id, String empId) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setUsername(empId);
        u.setEmpId(empId);
        u.setName("馮松");
        u.setDepartment("「外賣到家」事業部");
        u.setRole("user");
        return u;
    }

    @SuppressWarnings("unchecked")
    private List<LambdaQueryWrapper<EamClaim>> capturedCountWrappers() {
        ArgumentCaptor<LambdaQueryWrapper<EamClaim>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(claimMapper, times(4)).selectCount(captor.capture());
        return captor.getAllValues();
    }

    @Test
    @DisplayName("四张卡分别对应四个页签：首卡取全部記錄，其余按状态与可签条件")
    @SuppressWarnings("unchecked")
    void statsMatchTabs() {
        when(claimMapper.selectList(any())).thenReturn(List.of());
        when(claimMapper.selectCount(any())).thenReturn(0L);

        EamClaimStatsVO stats = service.myStats();

        // 首卡不再由「在用 + 已归还」相加，而是全部記錄（含待签/取消/终止态）
        assertEquals(0L, stats.getTotalCount().longValue());

        List<LambdaQueryWrapper<EamClaim>> wrappers = capturedCountWrappers();
        // 先取 SQL 片段：MP 的值占位符是懒生成的，不先调 getSqlSegment 则参数里是空的
        String total = wrappers.get(0).getSqlSegment();
        String claimed = wrappers.get(1).getSqlSegment();
        String returned = wrappers.get(2).getSqlSegment();
        String sign = wrappers.get(3).getSqlSegment();

        assertFalse(total.contains("status"), "全部記錄不得带状态条件（否则与「全部記錄」页签对不上）: " + total);

        assertTrue(claimed.contains("status"), "在用資產必须按状态过滤: " + claimed);
        assertTrue(wrappers.get(1).getParamNameValuePairs().containsValue("claimed"),
                "在用資產必须是 status=claimed: " + wrappers.get(1).getParamNameValuePairs());
        assertTrue(returned.contains("status"), "已歸還記錄必须按状态过滤: " + returned);
        assertTrue(wrappers.get(2).getParamNameValuePairs().containsValue("returned"),
                "已歸還記錄必须是 status=returned: " + wrappers.get(2).getParamNameValuePairs());

        assertTrue(sign.contains("signature_status"), "待簽記錄必须与「待我簽署」页签同条件: " + sign);
        assertTrue(wrappers.get(3).getParamNameValuePairs().containsValue("pending_signature"),
                "待簽含首次签: " + wrappers.get(3).getParamNameValuePairs());
        assertTrue(wrappers.get(3).getParamNameValuePairs().containsValue("proxy_pending"),
                "待簽含代办补签: " + wrappers.get(3).getParamNameValuePairs());
        assertTrue(wrappers.get(3).getParamNameValuePairs().containsValue("returned"),
                "已歸還但未補簽的遗留記錄必须计入待签（否则永远无法补签）: "
                        + wrappers.get(3).getParamNameValuePairs());
    }

    @Test
    @DisplayName("多状态过滤：異常終止页签一次查取消/調撥/遺失/報廢/送修")
    @SuppressWarnings("unchecked")
    void closedTabFiltersMultipleStatuses() {
        when(claimMapper.selectPage(any(), any())).thenReturn(new Page<>(1, 10));
        EamClaimQuery query = new EamClaimQuery();
        query.setStatuses(List.of("cancelled", "transferred", "loss_closed", "scrap_closed", "repair_closed"));

        service.page(query);

        ArgumentCaptor<LambdaQueryWrapper<EamClaim>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(claimMapper).selectPage(any(), captor.capture());
        LambdaQueryWrapper<EamClaim> wrapper = captor.getValue();
        assertTrue(wrapper.getSqlSegment().contains("status"), "多状态未下推: " + wrapper.getSqlSegment());
        for (String status : query.getStatuses()) {
            assertTrue(wrapper.getParamNameValuePairs().containsValue(status), "缺少状态条件: " + status);
        }
    }

    @Test
    @DisplayName("个人统计一律锁定登录人，外部传入的 employeeId 不得生效")
    @SuppressWarnings("unchecked")
    void statsScopedToCurrentEmployee() {
        when(claimMapper.selectList(any())).thenReturn(List.of());
        when(claimMapper.selectCount(any())).thenReturn(0L);

        // myStats 无入参，只能由服务端取登录人；这里同时验证 count wrapper 全部下推该条件
        service.myStats();

        for (LambdaQueryWrapper<EamClaim> wrapper : capturedCountWrappers()) {
            assertTrue(wrapper.getSqlSegment().contains("employee_id"),
                    "计数未下推领用人条件: " + wrapper.getSqlSegment());
            assertTrue(wrapper.getParamNameValuePairs().containsValue(SELF_ID),
                    "计数必须锁定登录人: " + wrapper.getParamNameValuePairs());
            assertFalse(wrapper.getParamNameValuePairs().containsValue(OTHER_ID),
                    "不得带出他人数据: " + wrapper.getParamNameValuePairs());
        }
    }

    @Test
    @DisplayName("未登录时拒绝自助统计，不给匿名通道")
    void anonymousIsRejected() {
        OperatorResolver anonymous = mock(OperatorResolver.class);
        when(anonymous.currentUser()).thenReturn(null);
        EamClaimServiceImpl anonymousService = new EamClaimServiceImpl(claimMapper,
                mock(EamClaimEvidenceMapper.class),
                mock(EamReturnService.class),
                mock(EamClaimEventMapper.class),
                mock(EamAssetMapper.class),
                mock(SysUserMapper.class),
                mock(EmpPositionRecordMapper.class),
                mock(BizSeqService.class),
                anonymous,
                mock(DingTalkAppService.class),
                mock(NotificationAppService.class),
                mock(SysConfigMapper.class),
                mock(EamTransferLookup.class));

        assertThrows(BusinessException.class, anonymousService::myStats);
    }
}
