package com.mftb.admin.service;

import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmProjectMemberMapper;
import com.mftb.admin.mapper.RdmReleaseBatchMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * RDM 全量可见 / 分配权的新旧锚点判定矩阵测试。
 *
 * <p>为什么单独成文件（与 {@code RdmAccessGuardTest} 分工）：那个文件锁的是「资源归属层」
 * —— 谁能读/改某一条需求；本文件锁的是「能力判定层」—— canSeeAll / canDispatch 到底认哪些
 * {@code menuKey:action}。菜单收敛（保留 rdm-requirement 锚点、退役 rdm-intake）改的正是这一层，
 * 一旦口径漂了，表现不是报错而是「有人悄悄看不见、有人悄悄多能干活」。
 *
 * <p>三条红线：
 * <ol>
 *   <li>宽权限动作（台账 view/export）永远推导不出全量可见；</li>
 *   <li>需求侧受理权（rdm-requirement:edit）永远推导不出分配权；</li>
 *   <li>新旧锚点必须判定等价 —— 这是「平移不降权」的可验证形式。</li>
 * </ol>
 * <p>前端按钮的口径（RequirementList.canDispatch、工作台身份推导）用的是同一对 key，
 * 这里钉住后端，前端只允许与其一致或更窄，不允许更宽。
 */
class RdmAccessGuardAnchorMatrixTest {

    private static final long USER_ID = 60L;

    private OperatorResolver operatorResolver;
    private PermissionService permissionService;

    /**
     * 造一个只持有给定 {@code menuKey:action} 授权的守卫。
     * <p>默认全部 false，再按 grant 精确置 true：新增动作时不会因为 Mockito 默认值而误判为已授权。
     */
    private RdmAccessGuard guardWith(Set<String> grants, boolean admin) {
        operatorResolver = mock(OperatorResolver.class);
        permissionService = mock(PermissionService.class);
        when(permissionService.hasPermission(any(), anyString(), anyString())).thenReturn(false);
        for (String grant : grants) {
            int split = grant.indexOf(':');
            String menuKey = grant.substring(0, split);
            String action = grant.substring(split + 1);
            when(permissionService.hasPermission(any(), eq(menuKey), eq(action))).thenReturn(true);
        }
        when(operatorResolver.isAdmin(any())).thenReturn(admin);
        RdmRequirementMapper requirementMapper = mock(RdmRequirementMapper.class);
        when(requirementMapper.selectById(100L)).thenReturn(requirement100());
        return new RdmAccessGuard(operatorResolver, permissionService, requirementMapper,
                mock(RdmRequirementRoleMapper.class), mock(RdmProjectMemberMapper.class),
                mock(com.mftb.admin.mapper.RdmProjectMapper.class),
                mock(RdmDeliveryItemMapper.class), mock(RdmTestBatchMapper.class),
                mock(RdmReleaseBatchMapper.class));
    }

    private static SysUser user() {
        SysUser u = new SysUser();
        u.setId(USER_ID);
        u.setEmpId("MF00060");
        u.setName("員工60");
        return u;
    }

    /** 需求 100 与 USER_ID 完全无关：能不能读全靠能力判定层放行 */
    private static RdmRequirement requirement100() {
        RdmRequirement req = new RdmRequirement();
        req.setId(100L);
        req.setReqNo("XQ202610060001");
        req.setStatus(RdmConstants.STATUS_DEVELOPING);
        req.setSubmitterUserId(11L);
        req.setAssigneePmUserId(21L);
        req.setAcceptorUserId(31L);
        req.setDevOwnerUserId(41L);
        req.setDispatcherUserId(51L);
        return req;
    }

    private boolean seeAll(Set<String> grants) {
        return guardWith(grants, false).canSeeAll(user());
    }

    private boolean dispatch(Set<String> grants) {
        return guardWith(grants, false).canDispatch(user());
    }

    /* ==================== 旧锚点（现行生产口径） ==================== */

    @Test
    @DisplayName("旧 intake:view 给全量可见，但不给分配权")
    void legacyIntakeViewSeesAllButCannotDispatch() {
        assertTrue(seeAll(Set.of(RdmConstants.MENU_INTAKE + ":view")));
        assertFalse(dispatch(Set.of(RdmConstants.MENU_INTAKE + ":view")));
    }

    @Test
    @DisplayName("旧 intake:edit 给分配权，且分配必然蕴含全量可见")
    void legacyIntakeEditImpliesSeeAll() {
        assertTrue(dispatch(Set.of(RdmConstants.MENU_INTAKE + ":edit")));
        assertTrue(seeAll(Set.of(RdmConstants.MENU_INTAKE + ":edit")));
    }

    /* ==================== 新锚点（收敛后口径） ==================== */

    @Test
    @DisplayName("新 rdm-requirement:view_all 给全量可见，不给分配权")
    void newViewAllSeesAllButCannotDispatch() {
        assertTrue(seeAll(Set.of(RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_VIEW_ALL)));
        assertFalse(dispatch(Set.of(RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_VIEW_ALL)));
    }

    @Test
    @DisplayName("新 rdm-requirement:dispatch 给分配权，且蕴含全量可见")
    void newDispatchImpliesSeeAll() {
        assertTrue(dispatch(Set.of(RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_DISPATCH)));
        assertTrue(seeAll(Set.of(RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_DISPATCH)));
    }

    /**
     * 平移的正确性形式：新旧锚点必须判定一致。
     * <p>只要这条成立，「把 intake:view/edit 换成 view_all/dispatch」就不会改变任何人的有效能力；
     * 反过来若哪天 canSeeAll 改成只认新锚点而动作还没平移，这里会先失败，而不是等用户看不见单子。
     */
    @Test
    @DisplayName("平移等价：新旧锚点对同一能力的判定完全一致")
    void oldAndNewAnchorsAreEquivalent() {
        assertEqualsPair(RdmConstants.MENU_INTAKE + ":view",
                RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_VIEW_ALL);
        assertEqualsPair(RdmConstants.MENU_INTAKE + ":edit",
                RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_DISPATCH);
    }

    private void assertEqualsPair(String legacyGrant, String newGrant) {
        assertEquals(seeAll(Set.of(legacyGrant)), seeAll(Set.of(newGrant)),
                "全量可见判定漂移: " + legacyGrant + " vs " + newGrant);
        assertEquals(dispatch(Set.of(legacyGrant)), dispatch(Set.of(newGrant)),
                "分配权判定漂移: " + legacyGrant + " vs " + newGrant);
    }

    /* ==================== 负向：宽权限不得推导窄能力 ==================== */

    @Test
    @DisplayName("需求清单 view/export 是人人可看的宽权限，推导不出全量可见与分配")
    void wideReadActionsNeverGrantCapability() {
        for (String action : new String[]{"view", "export"}) {
            Set<String> grants = Set.of(RdmConstants.MENU_REQUIREMENT + ":" + action);
            assertFalse(seeAll(grants), action + " 不应给全量可见");
            assertFalse(dispatch(grants), action + " 不应给分配权");
        }
    }

    /**
     * RdmAccessGuard.canDispatch 的注释早就声明「刻意不认 requirement:edit」，但此前没有断言钉住。
     * <p>合起来的后果是：给产品经理开受理权（正常操作）会连带把整池分配权扫出去。
     */
    @Test
    @DisplayName("受理权 rdm-requirement:edit 不等于分配权，也不等于全量可见")
    void productEditNeverMeansDispatchOrSeeAll() {
        Set<String> grants = Set.of(RdmConstants.MENU_REQUIREMENT + ":edit");
        assertFalse(dispatch(grants), "受理权推导不出分配权");
        assertFalse(seeAll(grants), "受理权推导不出全量可见");
    }

    @Test
    @DisplayName("沟通权 contribute 既不开放量可见，也不开分配、不提需求")
    void contributeGrantsNothingBroader() {
        Set<String> grants = Set.of(RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_CONTRIBUTE);
        assertFalse(seeAll(grants));
        assertFalse(dispatch(grants));
    }

    @Test
    @DisplayName("未登录（null 主体）fail-closed：两个能力都判否")
    void nullUserFailsClosed() {
        RdmAccessGuard guard = guardWith(Set.of(RdmConstants.MENU_INTAKE + ":view"), false);
        assertFalse(guard.canSeeAll(null));
        assertFalse(guard.canDispatch(null));
    }

    @Test
    @DisplayName("超管代码直通两个能力（不依赖授权行，菜单误删也不至于看不见系统）")
    void adminBypassesBoth() {
        RdmAccessGuard guard = guardWith(Set.of(), true);
        assertTrue(guard.canSeeAll(user()));
        assertTrue(guard.canDispatch(user()));
    }

    /* ==================== 能力判定真的作用到资源守卫上 ==================== */

    @Test
    @DisplayName("view_all 让与己无关的需求可读；没有它则被拒")
    void viewAllOpensCrossOwnerRead() {
        RdmAccessGuard granted = guardWith(
                Set.of(RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_VIEW_ALL), false);
        assertDoesNotThrow(() -> granted.requireVisible(requirement100(), user(), "查看詳情"));

        RdmAccessGuard plain = guardWith(Set.of(RdmConstants.MENU_REQUIREMENT + ":view"), false);
        assertThrows(RuntimeException.class, () -> plain.requireVisible(requirement100(), user(), "查看詳情"));
    }

    /**
     * 既有口径的显式记录：全量可见者可以跨需求写交付物（项目协调场景），
     * 而只持有沟通权/受理范围的人仍受资源归属约束。本轮不改这个语义，只把它钉住，
     * 避免锚点收敛时顺手把「看得见」变成「改得动」或反之。
     */
    @Test
    @DisplayName("全量可见可跨需求写交付物；沟通权不行")
    void seeAllPassesDeliveryWriterButContributeDoesNot() {
        RdmAccessGuard granted = guardWith(
                Set.of(RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_VIEW_ALL), false);
        assertDoesNotThrow(() -> granted.requireDeliveryWriter(requirement100(), user(), "編輯 PRD"));
        RdmAccessGuard narrow = guardWith(
                Set.of(RdmConstants.MENU_REQUIREMENT + ":" + RdmConstants.ACTION_CONTRIBUTE), false);
        assertThrows(RuntimeException.class, () -> narrow.requireDeliveryWriter(requirement100(), user(), "編輯 PRD"));
    }
}
