package com.mftb.admin.service.impl;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.RdmTaskTypeConfig;
import com.mftb.admin.mapper.RdmTaskTypeConfigMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 任务类型字典服务测试。
 *
 * <p>锁死三条口径：
 * <ol>
 *   <li>聚合桶兜底：design→design、qa→qa、其余（含字典缺行/非法 category）→dev，永不落 null；</li>
 *   <li>写路径强校验：code 格式 / label / color / category 白名单，未知编码拒绝新增；</li>
 *   <li>存在即放行：resolveByCode 只认 code，与启停无关（停用不影响存量任务解析）。</li>
 * </ol>
 */
class RdmTaskTypeServiceTest {

    private RdmTaskTypeConfigMapper dictMapper;
    private OperatorResolver operatorResolver;
    private RdmTaskTypeServiceImpl service;

    @BeforeEach
    void setUp() {
        dictMapper = mock(RdmTaskTypeConfigMapper.class);
        operatorResolver = mock(OperatorResolver.class);
        service = new RdmTaskTypeServiceImpl(dictMapper, operatorResolver);
        when(operatorResolver.currentOperatorName()).thenReturn("MF00041|李四");
    }

    private static RdmTaskTypeConfig cfg(String code, String category) {
        RdmTaskTypeConfig c = new RdmTaskTypeConfig();
        c.setId(1L);
        c.setCode(code);
        c.setLabel(code);
        c.setColor("#1890FF");
        c.setCategory(category);
        c.setEnabled(1);
        return c;
    }

    @Test
    @DisplayName("聚合桶：design/qa 归位，其余与字典缺行一律 dev 兜底")
    void categoryFallsBackToDev() {
        when(dictMapper.selectOne(any())).thenReturn(cfg("design", RdmTaskTypeConfig.CATEGORY_DESIGN));
        assertEquals(RdmTaskTypeConfig.CATEGORY_DESIGN, service.categoryOf("design"));

        when(dictMapper.selectOne(any())).thenReturn(cfg("qa", RdmTaskTypeConfig.CATEGORY_QA));
        assertEquals(RdmTaskTypeConfig.CATEGORY_QA, service.categoryOf("qa"));

        when(dictMapper.selectOne(any())).thenReturn(cfg("android", RdmTaskTypeConfig.CATEGORY_DEV));
        assertEquals(RdmTaskTypeConfig.CATEGORY_DEV, service.categoryOf("android"));

        // 字典缺行：新类型/未知 code 按内置语义兜底（design/qa 例外，其余 dev）
        when(dictMapper.selectOne(any())).thenReturn(null);
        assertEquals(RdmTaskTypeConfig.CATEGORY_DEV, service.categoryOf("firmware"));
        assertEquals(RdmTaskTypeConfig.CATEGORY_DEV, service.categoryOf(null));
        assertEquals(RdmTaskTypeConfig.CATEGORY_DESIGN, service.categoryOf("design"));
        assertEquals(RdmTaskTypeConfig.CATEGORY_QA, service.categoryOf("qa"));
    }

    @Test
    @DisplayName("聚合桶：配置了白名单外的 category 一律按 dev 兜底，不产生统计黑洞")
    void categoryInvalidFallsBackToDev() {
        when(dictMapper.selectOne(any())).thenReturn(cfg("android", "native"));
        assertEquals(RdmTaskTypeConfig.CATEGORY_DEV, service.categoryOf("android"));
    }

    @Test
    @DisplayName("resolveByCode：空串/空白不查库直接 null，存在即返回（与启停无关）")
    void resolveByCodeBlankOrHit() {
        when(dictMapper.selectOne(any())).thenReturn(cfg("backend", RdmTaskTypeConfig.CATEGORY_DEV));
        assertEquals("backend", service.resolveByCode("backend").getCode());
        // 空入参不触达 mapper
        assertNull(service.resolveByCode(null));
        assertNull(service.resolveByCode("  "));
    }

    @Test
    @DisplayName("新增：编码格式/颜色/聚合桶强校验，非法即拒")
    void createRejectsInvalidPayload() {
        RdmTaskTypeConfig upperCode = cfg("Android", RdmTaskTypeConfig.CATEGORY_DEV);
        assertThrows(BusinessException.class, () -> service.create(upperCode), "大写编码应被拒");

        RdmTaskTypeConfig badColor = cfg("android", RdmTaskTypeConfig.CATEGORY_DEV);
        badColor.setColor("red");
        assertThrows(BusinessException.class, () -> service.create(badColor), "非法颜色应被拒");

        RdmTaskTypeConfig badCategory = cfg("android", "native");
        assertThrows(BusinessException.class, () -> service.create(badCategory), "非法聚合桶应被拒");

        RdmTaskTypeConfig blankLabel = cfg("android", RdmTaskTypeConfig.CATEGORY_DEV);
        blankLabel.setLabel(null);
        assertThrows(BusinessException.class, () -> service.create(blankLabel), "空显示名应被拒");
    }

    @Test
    @DisplayName("新增：重复编码被拒，成功时默认启用/排序并注入操作人")
    void createDuplicateRejectedAndDefaultsApplied() {
        when(dictMapper.selectCount(any())).thenReturn(1L);
        RdmTaskTypeConfig dup = cfg("backend", RdmTaskTypeConfig.CATEGORY_DEV);
        assertThrows(BusinessException.class, () -> service.create(dup));

        when(dictMapper.selectCount(any())).thenReturn(0L);
        RdmTaskTypeConfig ok = cfg("android", RdmTaskTypeConfig.CATEGORY_DEV);
        ok.setEnabled(null);
        ok.setSortOrder(null);
        service.create(ok);
        assertEquals(1, ok.getEnabled());
        assertEquals(0, ok.getSortOrder());
        assertEquals("MF00041|李四", ok.getCreatedBy());
        verify(dictMapper).insert(ok);
    }

    @Test
    @DisplayName("启停：状态只接受 0/1，停用不影响 resolveByCode 命中")
    void statusOnlyAcceptsBinary() {
        when(dictMapper.selectById(1L)).thenReturn(cfg("backend", RdmTaskTypeConfig.CATEGORY_DEV));
        assertThrows(BusinessException.class, () -> service.updateStatus(1L, 2));
        service.updateStatus(1L, 0);
        // 「存在即放行」：停用行 resolve 照常命中（selectOne 由 mapper 控制，此处只断言调用链路不依赖 enabled）
        when(dictMapper.selectOne(any())).thenReturn(cfg("backend", RdmTaskTypeConfig.CATEGORY_DEV));
        assertTrue(service.resolveByCode("backend") != null);
    }
}
