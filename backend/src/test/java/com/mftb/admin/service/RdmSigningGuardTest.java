package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmRequirementRoleMapper;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 签署类守卫测试（任务19 / 决策3 + 缺口5）。
 * <p>锁死一条安全口径：<b>管理员「全量可见 / 可协调分配」不等于「可代签验收」</b>。
 * 可见范围（canSeeAll / isAdmin）与签署资格是两个正交口径，绝不能拿前者放行后者。
 * <ol>
 *   <li>管理员不是指定验收人时，产品/业务验收签署一律拒（关闭超管代签 / 自批后门）；</li>
 *   <li>只有交付项上指定的产品验收人 / 业务验收人本人能签；</li>
 *   <li>userId 为空即登录态失效，fail-closed，不能当成「任意人」放行；</li>
 *   <li>对照：管理岗守卫（协调人）仍保留 admin 直通——查看 / 分配 / 协调 ≠ 签署权。</li>
 * </ol>
 */
class RdmSigningGuardTest {

    private static final long ITEM_ID = 500L;
    private static final long ADMIN = 9L;
    private static final long PRODUCT_ACCEPTOR = 31L;
    private static final long BIZ_ACCEPTOR = 32L;
    private static final long COORDINATOR = 41L;
    private static final long STRANGER = 77L;

    private OperatorResolver operatorResolver;
    private RdmDeliveryItemMapper deliveryItemMapper;
    private RdmAccessGuard guard;

    @BeforeEach
    void setUp() {
        operatorResolver = mock(OperatorResolver.class);
        PermissionService permissionService = mock(PermissionService.class);
        RdmRequirementMapper requirementMapper = mock(RdmRequirementMapper.class);
        RdmRequirementRoleMapper roleMapper = mock(RdmRequirementRoleMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        when(roleMapper.selectList(any())).thenReturn(java.util.List.of());
        when(deliveryItemMapper.selectById(ITEM_ID)).thenReturn(item());
        guard = new RdmAccessGuard(operatorResolver, permissionService, requirementMapper, roleMapper,
                mock(com.mftb.admin.mapper.RdmProjectMemberMapper.class),
                deliveryItemMapper,
                mock(com.mftb.admin.mapper.RdmTestBatchMapper.class),
                mock(com.mftb.admin.mapper.RdmReleaseBatchMapper.class));
    }

    private static RdmDeliveryItem item() {
        RdmDeliveryItem item = new RdmDeliveryItem();
        item.setId(ITEM_ID);
        item.setReqId(100L);
        item.setCoordinatorUserId(COORDINATOR);
        item.setProductAcceptorUserId(PRODUCT_ACCEPTOR);
        item.setBizAcceptorUserId(BIZ_ACCEPTOR);
        return item;
    }

    private static SysUser user(long id) {
        SysUser u = new SysUser();
        u.setId(id);
        u.setEmpId("MF" + id);
        u.setName("員工" + id);
        return u;
    }

    /** 让认证主体为 admin（isAdmin 需 currentUser 与 userId 一致且 isAdmin(currentUser)=true） */
    private void loginAsAdmin() {
        SysUser admin = user(ADMIN);
        when(operatorResolver.currentUser()).thenReturn(admin);
        when(operatorResolver.isAdmin(admin)).thenReturn(true);
    }

    /* ==================== 决策3：签署类守卫取消 admin 直通 ==================== */

    @Test
    @DisplayName("管理员不是产品验收人时不能代签产品验收（admin 直通已移除）")
    void adminCannotSignProductAcceptance() {
        loginAsAdmin();
        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.requireProductAcceptor(ITEM_ID, ADMIN));
        assertTrue(ex.getMessage().contains("產品驗收人"), ex.getMessage());
    }

    @Test
    @DisplayName("管理员不是业务验收人时不能代签业务验收（admin 直通已移除）")
    void adminCannotSignBizAcceptance() {
        loginAsAdmin();
        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.requireBizAcceptor(ITEM_ID, ADMIN));
        assertTrue(ex.getMessage().contains("業務驗收人"), ex.getMessage());
    }

    @Test
    @DisplayName("管理员即使全量可见也不能自批：非指定验收人一律拒")
    void adminCannotSelfApprove() {
        loginAsAdmin();
        assertThrows(BusinessException.class, () -> guard.requireProductAcceptor(ITEM_ID, ADMIN));
        assertThrows(BusinessException.class, () -> guard.requireBizAcceptor(ITEM_ID, ADMIN));
    }

    @Test
    @DisplayName("只有指定的产品/业务验收人本人可以签署")
    void onlyDesignatedAcceptorsCanSign() {
        when(operatorResolver.isAdmin(any())).thenReturn(false);
        assertDoesNotThrow(() -> guard.requireProductAcceptor(ITEM_ID, PRODUCT_ACCEPTOR));
        assertDoesNotThrow(() -> guard.requireBizAcceptor(ITEM_ID, BIZ_ACCEPTOR));
        // 产品验收人不能越权签业务验收，反之亦然
        assertThrows(BusinessException.class, () -> guard.requireBizAcceptor(ITEM_ID, PRODUCT_ACCEPTOR));
        assertThrows(BusinessException.class, () -> guard.requireProductAcceptor(ITEM_ID, BIZ_ACCEPTOR));
        // 无关的人两种签署都拒
        assertThrows(BusinessException.class, () -> guard.requireProductAcceptor(ITEM_ID, STRANGER));
        assertThrows(BusinessException.class, () -> guard.requireBizAcceptor(ITEM_ID, STRANGER));
    }

    /* ==================== 缺口5：身份 fail-closed ==================== */

    @Test
    @DisplayName("userId 为空视为登录态失效，签署守卫 fail-closed 而非放行")
    void nullUserIsRejected() {
        BusinessException ex = assertThrows(BusinessException.class,
                () -> guard.requireProductAcceptor(ITEM_ID, null));
        assertTrue(ex.getMessage().contains("登錄狀態失效"), ex.getMessage());
        assertThrows(BusinessException.class, () -> guard.requireBizAcceptor(ITEM_ID, null));
    }

    /* ==================== 对照：管理岗守卫仍保留 admin 直通 ==================== */

    @Test
    @DisplayName("对照：协调人（管理岗）守卫仍保留 admin 直通——协调/分配 ≠ 签署权")
    void coordinatorGuardKeepsAdminPassthrough() {
        loginAsAdmin();
        assertDoesNotThrow(() -> guard.requireDeliveryCoordinator(ITEM_ID, ADMIN));
        // 非协调人非管理员仍拒（currentUser 为 admin，与 STRANGER 不一致，isAdmin 为 false）
        assertThrows(BusinessException.class, () -> guard.requireDeliveryCoordinator(ITEM_ID, STRANGER));
        // 协调人本人可
        assertDoesNotThrow(() -> guard.requireDeliveryCoordinator(ITEM_ID, COORDINATOR));
    }
}
