package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.dto.EamConsumableClaimQuery;
import com.mftb.admin.dto.EamConsumableClaimSaveDTO;
import com.mftb.admin.entity.EamConsumableClaim;
import com.mftb.admin.entity.EamConsumableItem;
import com.mftb.admin.entity.SysDepartment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.EamConsumableClaimItemMapper;
import com.mftb.admin.mapper.EamConsumableClaimMapper;
import com.mftb.admin.mapper.EamConsumableItemMapper;
import com.mftb.admin.mapper.EamConsumableStockMapper;
import com.mftb.admin.mapper.EamConsumableTxnMapper;
import com.mftb.admin.mapper.EamLocationMapper;
import com.mftb.admin.mapper.SysDepartmentMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Collection;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 耗材领用列表筛选与领用单归属落库测试。
 * <p>钉住三件事：
 * <ul>
 *   <li>前端四个查询条件（單號/申請人/所屬部門/狀態）必须下推成 SQL 条件，不能被忽略或退化为内存过滤；</li>
 *   <li>部门条件按部门树展开为 IN，选父部门必须能命中下级部门的单据（与员工列表同口径）；</li>
 *   <li>提交领用时必须写入承担部门 ID，否则按部门筛选对存量与新单据都必然落空。</li>
 * </ul>
 */
class EamConsumableClaimQueryTest {

    private static final long SELF_ID = 3L;
    private static final long SELF_DEPT_ID = 10L;

    private EamConsumableClaimMapper claimMapper;
    private SysDepartmentMapper departmentMapper;
    private EamConsumableItemMapper itemMapper;
    private OperatorResolver operatorResolver;
    private EamConsumableClaimServiceImpl service;

    @BeforeEach
    void setUp() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), EamConsumableClaim.class);
        claimMapper = mock(EamConsumableClaimMapper.class);
        departmentMapper = mock(SysDepartmentMapper.class);
        itemMapper = mock(EamConsumableItemMapper.class);
        operatorResolver = mock(OperatorResolver.class);
        lenient().when(claimMapper.selectPage(any(Page.class), any())).thenReturn(new Page<>(1, 10));
        service = new EamConsumableClaimServiceImpl(
                claimMapper, mock(EamConsumableClaimItemMapper.class), mock(EamConsumableStockMapper.class),
                itemMapper, mock(EamConsumableTxnMapper.class), mock(EamLocationMapper.class),
                mock(SysUserMapper.class), departmentMapper, operatorResolver, mock(BizSeqService.class));
    }

    private static SysDepartment dept(long id, Long parentId) {
        SysDepartment d = new SysDepartment();
        d.setId(id);
        d.setParentId(parentId);
        d.setName("部門" + id);
        d.setStatus(1);
        return d;
    }

    @SuppressWarnings("unchecked")
    private LambdaQueryWrapper<EamConsumableClaim> capturedPageWrapper() {
        ArgumentCaptor<LambdaQueryWrapper<EamConsumableClaim>> captor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(claimMapper).selectPage(any(Page.class), captor.capture());
        return captor.getValue();
    }

    /**
     * 取已绑定的参数值。
     * <p>MyBatis-Plus 的 IN/LIKE 条件将取值包在 ISqlSegment 里，直到 getSqlSegment()
     * 才真正写入 paramNameValuePairs；故断言前必须先物化一次 SQL，否则拿到空 map（假红）。
     */
    private static Collection<Object> boundValues(LambdaQueryWrapper<EamConsumableClaim> wrapper) {
        wrapper.getSqlSegment();
        return wrapper.getParamNameValuePairs().values();
    }

    @Test
    @DisplayName("单号/申请人/部门/状态四个条件全部下推为 SQL")
    @SuppressWarnings("unchecked")
    void pagePushesAllSearchFieldsIntoSql() {
        when(departmentMapper.selectList(any())).thenReturn(List.of(dept(SELF_DEPT_ID, null)));
        EamConsumableClaimQuery query = new EamConsumableClaimQuery();
        query.setClaimNo(" HCLY2026 ");
        query.setApplicantName("張");
        query.setDepartmentId(SELF_DEPT_ID);
        query.setStatus("issued");

        service.page(query);

        LambdaQueryWrapper<EamConsumableClaim> wrapper = capturedPageWrapper();
        String sql = wrapper.getSqlSegment();
        Collection<Object> values = boundValues(wrapper);
        assertTrue(sql.contains("claim_no"), "单号条件未下推: " + sql);
        assertTrue(sql.contains("applicant_name"), "申请人条件未下推: " + sql);
        assertTrue(sql.contains("department_id"), "部门条件未下推: " + sql);
        assertTrue(sql.contains("status"), "状态条件未下推: " + sql);
        // 模糊匹配必须带 %，且首尾空格已裁剪；否则前端输入 HCLY2026 会退化成精确匹配
        assertTrue(values.contains("%HCLY2026%"), "单号应按裁剪后的模糊值绑定: " + values + ", sql=" + sql);
        assertTrue(values.contains("%張%"), "申请人应按模糊值绑定: " + values);
        assertTrue(values.contains(SELF_DEPT_ID), "部门 ID 应绑定: " + values + ", sql=" + sql);
        assertTrue(values.contains("issued"), "状态应绑定: " + values);
    }

    @Test
    @DisplayName("部门条件按部门树展开，父部门命中全部子孙部门单据")
    @SuppressWarnings("unchecked")
    void departmentFilterExpandsDescendants() {
        // 1 总裁办 → 2 行政部 → 3 后勤组；4 财务部挂在 9 下，与 1 无关
        when(departmentMapper.selectList(any())).thenReturn(List.of(
                dept(1L, null), dept(2L, 1L), dept(3L, 2L), dept(4L, 9L)));
        EamConsumableClaimQuery query = new EamConsumableClaimQuery();
        query.setDepartmentId(1L);

        service.page(query);

        LambdaQueryWrapper<EamConsumableClaim> wrapper = capturedPageWrapper();
        String sql = wrapper.getSqlSegment();
        Collection<Object> values = boundValues(wrapper);
        assertTrue(values.contains(1L) && values.contains(2L) && values.contains(3L),
                "父部门必须同时命中子孙部门, sql=" + sql + ", values=" + values);
        assertFalse(values.contains(4L), "无关部门不得进入 IN 列表: " + values);
    }

    @Test
    @DisplayName("空条件不追加任何业务筛选")
    void emptyQueryAddsNoBusinessConditions() {
        service.page(new EamConsumableClaimQuery());

        String sql = capturedPageWrapper().getSqlSegment();
        for (String column : List.of("claim_no", "applicant_name", "department_id", "status", "applicant_id")) {
            assertFalse(sql.contains(column), "空条件不应出现 " + column + " 过滤: " + sql);
        }
    }

    @Test
    @DisplayName("我的领用视图锁定本人的同时保留筛选条件")
    @SuppressWarnings("unchecked")
    void myClaimsKeepsFiltersAndLocksApplicant() {
        when(departmentMapper.selectList(any())).thenReturn(List.of(dept(SELF_DEPT_ID, null)));
        SysUser self = new SysUser();
        self.setId(SELF_ID);
        self.setEmpId("MF00003");
        self.setName("馮松");
        when(operatorResolver.currentUser()).thenReturn(self);
        EamConsumableClaimQuery query = new EamConsumableClaimQuery();
        query.setStatus("pending");
        query.setDepartmentId(SELF_DEPT_ID);

        service.myClaims(query);

        LambdaQueryWrapper<EamConsumableClaim> wrapper = capturedPageWrapper();
        String sql = wrapper.getSqlSegment();
        Collection<Object> values = boundValues(wrapper);
        assertTrue(values.contains(SELF_ID), "我的领用必须锁定登录人: " + values);
        assertTrue(values.contains("pending"), "筛选条件不得因切换到我的领用而丢失: " + values);
        assertTrue(values.contains(SELF_DEPT_ID), "部门条件应同样作用于我的领用: " + values);
        assertTrue(sql.contains("applicant_id"), "本人视图必须下推申请人条件: " + sql);
    }

    @Test
    @DisplayName("提交领用时写入承担部门 ID（否则部门筛选必然落空）")
    void submitPersistsDepartmentId() {
        SysUser self = new SysUser();
        self.setId(SELF_ID);
        self.setEmpId("MF00003");
        self.setName("馮松");
        self.setDepartment("行政部");
        self.setDepartmentId(SELF_DEPT_ID);
        when(operatorResolver.currentUser()).thenReturn(self);
        lenient().when(operatorResolver.currentOperatorName()).thenReturn("馮松");

        BizSeqService bizSeqService = mock(BizSeqService.class);
        when(bizSeqService.next(BizSeqService.RULE_EAM_CONSUMABLE_CLAIM)).thenReturn("HCLY202610090001");
        EamConsumableStockMapper stockMapper = mock(EamConsumableStockMapper.class);
        when(stockMapper.lock(anyLong(), anyLong(), anyInt())).thenReturn(1);
        // submit 末尾 return claim.getId()（原始类型 long），必须模拟数据库回写主键
        when(claimMapper.insert(any(EamConsumableClaim.class))).thenAnswer(inv -> {
            inv.getArgument(0, EamConsumableClaim.class).setId(500L);
            return 1;
        });
        service = new EamConsumableClaimServiceImpl(
                claimMapper, mock(EamConsumableClaimItemMapper.class), stockMapper, itemMapper,
                mock(EamConsumableTxnMapper.class), mock(EamLocationMapper.class), mock(SysUserMapper.class),
                departmentMapper, operatorResolver, bizSeqService);

        EamConsumableItem item = new EamConsumableItem();
        item.setId(100L);
        item.setItemCode("HC000001");
        item.setName("中性筆");
        item.setUnit("支");
        item.setStatus("enabled");
        item.setCompanyBrand(1L);
        item.setPurchaseCompanyId(2L);
        item.setPurchaseCompany("珠海閃蜂科技有限公司");
        item.setPerClaimLimit(0);
        when(itemMapper.selectById(100L)).thenReturn(item);

        EamConsumableClaimSaveDTO dto = new EamConsumableClaimSaveDTO();
        dto.setReason("辦公室補貨");
        EamConsumableClaimSaveDTO.Line line = new EamConsumableClaimSaveDTO.Line();
        line.setItemId(100L);
        line.setQty(5);
        dto.setItems(List.of(line));

        service.submit(dto);

        ArgumentCaptor<EamConsumableClaim> captor = ArgumentCaptor.forClass(EamConsumableClaim.class);
        verify(claimMapper).insert(captor.capture());
        EamConsumableClaim saved = captor.getValue();
        assertEquals(SELF_DEPT_ID, saved.getDepartmentId() == null ? -1L : saved.getDepartmentId().longValue(),
                "领用单必须落库承担部门 ID");
        assertEquals("行政部", saved.getDepartment(), "部门名称快照同步保留");
    }
}
