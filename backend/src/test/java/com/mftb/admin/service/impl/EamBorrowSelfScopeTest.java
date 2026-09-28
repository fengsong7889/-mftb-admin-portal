package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.EamBorrowQuery;
import com.mftb.admin.dto.EamBorrowStatsVO;
import com.mftb.admin.dto.EamBorrowVO;
import com.mftb.admin.entity.EamBorrow;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamAssetMapper;
import com.mftb.admin.mapper.EamBorrowMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;

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
 * 借用自助视图（/api/eam/borrows/my*）数据范围测试。
 * <p>
 * 「我的资产」页对任何登录员工开放，因此借用域必须自己锁死两件事：
 * 列表/统计必然下推本人借用人条件（外部传入的 holderId 不得生效）、他人单据必然 403。
 */
class EamBorrowSelfScopeTest {

    private static final long SELF_ID = 2L;
    private static final long OTHER_ID = 7L;

    private EamBorrowMapper borrowMapper;
    private EamBorrowServiceImpl service;

    private final SysUser self = user(SELF_ID, "MF00002", "馮松");
    private final SysUser other = user(OTHER_ID, "MF00007", "李四");

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), ""), EamBorrow.class);
        borrowMapper = mock(EamBorrowMapper.class);
        OperatorResolver resolver = mock(OperatorResolver.class);
        when(resolver.currentUser()).thenReturn(self);
        lenient().when(resolver.currentOperatorName()).thenReturn(self.getName());
        service = new EamBorrowServiceImpl(borrowMapper, mock(EamAssetMapper.class),
                mock(SysUserMapper.class), mock(BizSeqService.class), resolver);
    }

    private static SysUser user(long id, String empId, String name) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setUsername(empId);
        u.setEmpId(empId);
        u.setName(name);
        u.setDepartment("測試部");
        u.setRole("user");
        return u;
    }

    private static EamBorrow borrow(long id, Long holderId) {
        EamBorrow e = new EamBorrow();
        e.setId(id);
        e.setBorrowNo("JY" + id);
        e.setAssetId(6L);
        e.setHolderId(holderId);
        e.setHolderName("員工" + holderId);
        e.setDepartment("測試部");
        e.setStatus("active");
        e.setStartDate(LocalDate.now().minusDays(10));
        e.setDueDate(LocalDate.now().plusDays(20));
        e.setRenewCount(0);
        e.setPurpose("E2E借用測試");
        return e;
    }

    @SuppressWarnings("unchecked")
    private LambdaQueryWrapper<EamBorrow> capturedPageWrapper() {
        ArgumentCaptor<LambdaQueryWrapper<EamBorrow>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(borrowMapper).selectPage(any(Page.class), captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("本人借用列表下推借用人条件，且忽略外部传入的 holderId")
    @SuppressWarnings("unchecked")
    void myPageAlwaysScopedToCurrentHolder() {
        when(borrowMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));
        EamBorrowQuery query = new EamBorrowQuery();
        query.setHolderId(OTHER_ID);

        service.myPage(query);

        LambdaQueryWrapper<EamBorrow> wrapper = capturedPageWrapper();
        assertTrue(wrapper.getSqlSegment().contains("holder_id"), "未下推借用人条件: " + wrapper.getSqlSegment());
        assertTrue(wrapper.getParamNameValuePairs().containsValue(SELF_ID),
                "必须锁定登录人: " + wrapper.getParamNameValuePairs());
        assertFalse(wrapper.getParamNameValuePairs().containsValue(OTHER_ID),
                "外部传入的 holderId 不得生效: " + wrapper.getParamNameValuePairs());
    }

    @Test
    @DisplayName("本人借用统计与列表同口径")
    @SuppressWarnings("unchecked")
    void myStatsSharesListScope() {
        when(borrowMapper.selectCount(any())).thenReturn(0L);

        EamBorrowStatsVO stats = service.myStats();

        assertEquals(0L, stats.getTotalCount().longValue());
        ArgumentCaptor<LambdaQueryWrapper<EamBorrow>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(borrowMapper, times(4)).selectCount(captor.capture());
        for (LambdaQueryWrapper<EamBorrow> wrapper : captor.getAllValues()) {
            assertTrue(wrapper.getSqlSegment().contains("holder_id"), "计数未下推借用人条件: " + wrapper.getSqlSegment());
            assertTrue(wrapper.getParamNameValuePairs().containsValue(SELF_ID),
                    "计数必须锁定登录人: " + wrapper.getParamNameValuePairs());
        }
    }

    @Test
    @DisplayName("查看他人借用记录被拒，提示为数据范围语义而非缺菜单权限")
    void otherHolderDetailIsRejected() {
        when(borrowMapper.selectById(9L)).thenReturn(borrow(9L, OTHER_ID));

        BusinessException denied = assertThrows(BusinessException.class, () -> service.myDetail(9L));
        assertTrue(denied.getMessage().contains("本人的資料"), "实际提示: " + denied.getMessage());
        assertEquals(403, denied.getCode().intValue());
    }

    @Test
    @DisplayName("查看本人借用记录放行")
    void ownDetailIsAllowed() {
        when(borrowMapper.selectById(9L)).thenReturn(borrow(9L, SELF_ID));

        EamBorrowVO vo = service.myDetail(9L);

        assertEquals("JY9", vo.getBorrowNo());
        assertEquals(SELF_ID, vo.getHolderId().longValue());
    }

    @Test
    @DisplayName("未登录时拒绝自助查询，不给匿名通道")
    void anonymousIsRejected() {
        OperatorResolver anonymous = mock(OperatorResolver.class);
        when(anonymous.currentUser()).thenReturn(null);
        EamBorrowServiceImpl anonymousService = new EamBorrowServiceImpl(borrowMapper, mock(EamAssetMapper.class),
                mock(SysUserMapper.class), mock(BizSeqService.class), anonymous);

        assertThrows(BusinessException.class, () -> anonymousService.myPage(new EamBorrowQuery()));
        assertThrows(BusinessException.class, anonymousService::myStats);
        assertThrows(BusinessException.class, () -> anonymousService.myDetail(9L));
    }
}
