package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.conditions.ISqlSegment;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmFlowConfig;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmFlowConfigMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * V3 整需求流转白名单测试（任务19 / 缺口1 + 缺口6）+ V3 发布灰度读取口径（任务27）。
 * <p>锁死下列口径：
 * <ol>
 *   <li>V3 需求经 transition 只放行「准入 / 分配 / 受理 / 协调」前段动作；交付/测试/验收/发布类
 *       后段动作必须走交付项接口，不得经整需求流转绕过发布批次门禁（白名单 fail-closed）；</li>
 *   <li>V1/V2 语义完全不变：非 V3 需求不受白名单影响，任何动作都放行（由各自守卫处理）；</li>
 *   <li>缺口6：V3 实际发布能力仍被 ensureReleaseDisabledForV3 拦截，未因白名单而弱化；
 *       <b>任务27 演进后，灰度未开启（默认）时仍维持无条件阻断</b>；</li>
 *   <li>任务27 灰度读取：GLOBAL 熔断优先 → PROJECT:&lt;id&gt; → <b>两级都显式为 1 才开</b>；
 *       缺行 / null / 0 / 读库异常一律视为关闭，且<b>绝不自动开启任何项目</b>。</li>
 * </ol>
 */
class RdmFlowVersionGuardTest {

    private static final long V3_REQ = 300L;
    private static final long V2_REQ = 200L;
    private static final long PROJECT_ID = 77L;

    private RdmRequirementMapper requirementMapper;
    private RdmFlowConfigMapper flowConfigMapper;
    private RdmFlowVersionGuard guard;

    @BeforeEach
    void setUp() {
        requirementMapper = mock(RdmRequirementMapper.class);
        RdmDeliveryItemMapper deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        flowConfigMapper = mock(RdmFlowConfigMapper.class);
        when(requirementMapper.selectById(V3_REQ)).thenReturn(req(V3_REQ, RdmConstants.FLOW_VERSION_3));
        when(requirementMapper.selectById(V2_REQ)).thenReturn(req(V2_REQ, 2));
        // 默认：库里查不到任何灰度配置行 → 视为关闭（与 238 种子 GLOBAL(0,0) 同口径）
        // 用 doReturn 而非 when(...)：避免 stubbing 求值时真实调用 mock 触发已注册的 Answer
        doReturn(null).when(flowConfigMapper).selectOne(any());
        guard = new RdmFlowVersionGuard(requirementMapper, deliveryItemMapper, flowConfigMapper);
    }

    private static RdmRequirement req(long id, Integer flowVersion) {
        RdmRequirement r = new RdmRequirement();
        r.setId(id);
        r.setFlowVersion(flowVersion);
        return r;
    }

    @Test
    @DisplayName("V3 需求放行准入/分配/受理/协调等前段动作")
    void v3AllowsFrontStageActions() {
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V3_REQ, RdmConstants.ACTION_SUBMIT));
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V3_REQ, RdmConstants.ACTION_APPROVE_INTAKE));
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V3_REQ, RdmConstants.ACTION_DISPATCH));
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V3_REQ, RdmConstants.ACTION_ACCEPT));
    }

    @Test
    @DisplayName("V3 需求拒绝开发/测试/验收/发布等后段动作（必须走交付项接口）")
    void v3RejectsBackStageActions() {
        for (String action : new String[]{
                RdmConstants.ACTION_DEV_START, RdmConstants.ACTION_TEST_START,
                RdmConstants.ACTION_REVIEW_PASS, RdmConstants.ACTION_SUBMIT_UAT,
                RdmConstants.ACTION_RELEASE, RdmConstants.ACTION_VERIFY}) {
            BusinessException ex = assertThrows(BusinessException.class,
                    () -> guard.requireV3TransitionAllowed(V3_REQ, action),
                    "动作应被拒绝: " + action);
            assertTrue(ex.getMessage().contains("交付項"), ex.getMessage());
        }
    }

    @Test
    @DisplayName("白名单 fail-closed：未显列入或空动作一律拒")
    void v3RejectsUnknownAction() {
        assertThrows(BusinessException.class,
                () -> guard.requireV3TransitionAllowed(V3_REQ, "some_future_action"));
        assertThrows(BusinessException.class,
                () -> guard.requireV3TransitionAllowed(V3_REQ, null));
    }

    @Test
    @DisplayName("V1/V2 语义不变：后段动作不受白名单影响，全部放行")
    void v1v2Unaffected() {
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V2_REQ, RdmConstants.ACTION_DEV_START));
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(V2_REQ, RdmConstants.ACTION_RELEASE));
        // 需求不存在时也维持旧链路语义，不在此拦
        assertDoesNotThrow(() -> guard.requireV3TransitionAllowed(999L, RdmConstants.ACTION_RELEASE));
    }

    @Test
    @DisplayName("缺口6：V3 发布能力仍被无条件拦截，白名单未弱化发布门禁")
    void releaseStillDisabledForV3() {
        assertThrows(BusinessException.class, () -> guard.ensureReleaseDisabledForV3(1L));
    }

    /* ==================== 任务27：V3 发布灰度（默认关闭） ==================== */

    @Test
    @DisplayName("灰度默认关闭：库中无配置行时 isV3ReleaseEnabled=false，守卫仍无条件阻断")
    void grayscaleDefaultsToClosedWhenNoConfigRow() {
        assertFalse(guard.isV3ReleaseEnabled(PROJECT_ID), "缺行必须视为关闭，绝不自动开启");
        assertFalse(guard.isV3ReleaseEnabled(null));
        assertThrows(BusinessException.class, () -> guard.ensureReleaseDisabledForV3(1L, PROJECT_ID));
    }

    @Test
    @DisplayName("灰度默认关闭：GLOBAL 与 PROJECT 两行都是 0（238 种子口径）时仍阻断")
    void grayscaleClosedWhenBothFlagsOff() {
        stubFlowConfig(config(RdmConstants.FLOW_SCOPE_GLOBAL, 0, 0),
                config(RdmConstants.projectScopeKey(PROJECT_ID), 0, 0));
        assertFalse(guard.isV3ReleaseEnabled(PROJECT_ID));
        assertThrows(BusinessException.class, () -> guard.ensureReleaseDisabledForV3(1L, PROJECT_ID));
    }

    @Test
    @DisplayName("GLOBAL 熔断优先：全局已开但 global_release_paused=1 时一律关闭")
    void globalPauseWinsOverEnabledFlags() {
        stubFlowConfig(config(RdmConstants.FLOW_SCOPE_GLOBAL, 1, 1),
                config(RdmConstants.projectScopeKey(PROJECT_ID), 1, 0));
        assertFalse(guard.isV3ReleaseEnabled(PROJECT_ID), "全局熔断必须压过项目级开启");
        assertThrows(BusinessException.class, () -> guard.ensureReleaseDisabledForV3(1L, PROJECT_ID));
    }

    @Test
    @DisplayName("仅 GLOBAL 开启不够：项目行缺失或为 0 时仍关闭")
    void projectLevelRequired() {
        stubFlowConfig(config(RdmConstants.FLOW_SCOPE_GLOBAL, 1, 0), null);
        assertFalse(guard.isV3ReleaseEnabled(PROJECT_ID), "项目行缺失必须视为关闭");

        stubFlowConfig(config(RdmConstants.FLOW_SCOPE_GLOBAL, 1, 0),
                config(RdmConstants.projectScopeKey(PROJECT_ID), 0, 0));
        assertFalse(guard.isV3ReleaseEnabled(PROJECT_ID));
        assertThrows(BusinessException.class, () -> guard.ensureReleaseDisabledForV3(1L, PROJECT_ID));
    }

    @Test
    @DisplayName("null 标志位视同关闭（不靠默认值臆测开启）")
    void nullFlagsTreatedAsOff() {
        stubFlowConfig(config(RdmConstants.FLOW_SCOPE_GLOBAL, null, 0),
                config(RdmConstants.projectScopeKey(PROJECT_ID), 1, 0));
        assertFalse(guard.isV3ReleaseEnabled(PROJECT_ID));
    }

    @Test
    @DisplayName("两级都显式开启且未熔断时才放行，守卫不再抛错")
    void enabledOnlyWhenBothLevelsOn() {
        stubFlowConfig(config(RdmConstants.FLOW_SCOPE_GLOBAL, 1, 0),
                config(RdmConstants.projectScopeKey(PROJECT_ID), 1, 0));
        assertTrue(guard.isV3ReleaseEnabled(PROJECT_ID));
        // 防假绿：必须确实分别读了 GLOBAL 与 PROJECT:<id> 两行，否则「路由恒 null」也能蒙对
        assertScopesQueried(RdmConstants.FLOW_SCOPE_GLOBAL, RdmConstants.projectScopeKey(PROJECT_ID));
        assertDoesNotThrow(() -> guard.ensureReleaseDisabledForV3(1L, PROJECT_ID));
        // projectId 为空时无法定位项目行，仍 fail-closed
        assertFalse(guard.isV3ReleaseEnabled(null));
        assertThrows(BusinessException.class, () -> guard.ensureReleaseDisabledForV3(1L, null));
    }

    @Test
    @DisplayName("读库异常也归为关闭（fail-closed，不因异常放行发布）")
    void readFailureFailsClosed() {
        doThrow(new RuntimeException("db down")).when(flowConfigMapper).selectOne(any());
        assertFalse(guard.isV3ReleaseEnabled(PROJECT_ID));
        assertThrows(BusinessException.class, () -> guard.ensureReleaseDisabledForV3(1L, PROJECT_ID));
    }

    @Test
    @DisplayName("产品补验时限：GLOBAL 行缺失/非法时回退常量默认，绝不回退成 0 天")
    void productVerificationDaysFallsBackToConstant() {
        assertEquals(RdmConstants.DEFAULT_PRODUCT_VERIFICATION_DAYS, guard.productVerificationDays());

        stubFlowConfig(config(RdmConstants.FLOW_SCOPE_GLOBAL, 0, 0), null);
        assertEquals(RdmConstants.DEFAULT_PRODUCT_VERIFICATION_DAYS, guard.productVerificationDays());

        RdmFlowConfig illegal = config(RdmConstants.FLOW_SCOPE_GLOBAL, 0, 0);
        illegal.setProductVerificationDays(0);
        stubFlowConfig(illegal, null);
        assertEquals(RdmConstants.DEFAULT_PRODUCT_VERIFICATION_DAYS, guard.productVerificationDays());

        RdmFlowConfig legal = config(RdmConstants.FLOW_SCOPE_GLOBAL, 0, 0);
        legal.setProductVerificationDays(3);
        stubFlowConfig(legal, null);
        assertEquals(3, guard.productVerificationDays());
    }

    /* ==================== 测试辅助 ==================== */

    private static RdmFlowConfig config(String scopeKey, Integer v3ReleaseEnabled, Integer globalReleasePaused) {
        RdmFlowConfig c = new RdmFlowConfig();
        c.setScopeKey(scopeKey);
        c.setV3ReleaseEnabled(v3ReleaseEnabled);
        c.setGlobalReleasePaused(globalReleasePaused);
        c.setProductVerificationDays(RdmConstants.DEFAULT_PRODUCT_VERIFICATION_DAYS);
        return c;
    }

    /**
     * 按 {@code scope_key} 精确路由灰度配置行（从 LambdaQueryWrapper 实际绑定的参数对里取 scopeKey），
     * 避免依赖「先 GLOBAL 后 PROJECT」的调用顺序，口径变更时测试不会假绿。
     */
    private void stubFlowConfig(RdmFlowConfig global, RdmFlowConfig project) {
        doAnswer(inv -> {
            String scopeKey = resolveScopeKey(inv.getArgument(0));
            if (RdmConstants.FLOW_SCOPE_GLOBAL.equals(scopeKey)) {
                return global;
            }
            return scopeKey == null ? null : project;
        }).when(flowConfigMapper).selectOne(any());
    }

    /**
     * 从 wrapper 还原实际绑定的 {@code scope_key} 值。
     *
     * <p><b>为何需要主动求值</b>：{@code LambdaQueryWrapper.eq(SFunction, val)} 把「列名段」与「值段」
     * 都包成延迟的 {@link ISqlSegment}，只有走 MyBatis 执行链（{@code getSqlSegment()}）时
     * {@code formatParam} 才会把值写入 {@code paramNameValuePairs}。纯 mock 单测不触发执行链，
     * 直接读 {@code getParamNameValuePairs()} 会得到<b>空 Map</b>，路由恒为 null → 所有灰度用例假绿。
     *
     * <p>因此这里逐段求值：值段可安全求值并回填参数；列名段依赖 TableInfo/Lambda 缓存，
     * 无容器时会抛异常，忽略即可（我们只需要值段）。
     */
    private static String resolveScopeKey(Object argument) {
        if (!(argument instanceof AbstractWrapper<?, ?, ?> wrapper)) {
            return null;
        }
        for (ISqlSegment segment : wrapper.getExpression().getNormal()) {
            try {
                segment.getSqlSegment();
            } catch (Exception | LinkageError ignored) {
                // 列名段在无 MyBatis-Plus TableInfo 缓存时必然失败，与取值无关
            }
        }
        return wrapper.getParamNameValuePairs().values().stream()
                .map(String::valueOf)
                .filter(v -> RdmConstants.FLOW_SCOPE_GLOBAL.equals(v)
                        || v.startsWith(RdmConstants.FLOW_SCOPE_PROJECT_PREFIX))
                .findFirst()
                .orElse(null);
    }

    /** 断言守卫确实按预期 scope_key 逐行查询过灰度配置（防「路由恒 null」型假绿）。 */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void assertScopesQueried(String... expectedScopeKeys) {
        ArgumentCaptor<Wrapper<RdmFlowConfig>> captor = ArgumentCaptor.forClass(Wrapper.class);
        verify(flowConfigMapper, atLeastOnce()).selectOne(captor.capture());
        List<Object> captured = new java.util.ArrayList<>(captor.getAllValues());
        List<String> actual = captured.stream()
                .map(RdmFlowVersionGuardTest::resolveScopeKey)
                .toList();
        for (String expected : expectedScopeKeys) {
            assertTrue(actual.contains(expected),
                    "应按 scope_key 查询灰度配置行: " + expected + "，实际查询: " + actual);
        }
    }
}
