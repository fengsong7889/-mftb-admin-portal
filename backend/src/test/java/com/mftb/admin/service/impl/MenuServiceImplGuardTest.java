package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.PermissionDeniedException;
import com.mftb.admin.dto.MenuRequest;
import com.mftb.admin.entity.SysMenu;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysMenuMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.OperatorResolver;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 菜单配置服务端权限守卫单测。
 * <p>锁定契约：普通管理员只能改菜单名称，结构字段（Key/上级/路径/组件/图标/类型/排序/状态/动作）
 * 与新增/删除/启停一律要求内置超管。前端隐藏入口不是安全边界，必须在服务端兜住。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class MenuServiceImplGuardTest {

    private static final long MENU_ID = 30L;

    /**
     * LambdaUpdateWrapper 依赖 MyBatis-Plus 的实体 lambda 缓存，
     * 正常由 mapper 注册时构建；纯 Mockito 单测没有 SqlSession，必须手工预热，
     * 否则 set(SysMenu::getParentId, ...) 会抛 "can not find lambda cache"。
     */
    @BeforeAll
    static void initTableInfoCache() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysMenu.class);
    }

    @Mock
    private SysMenuMapper sysMenuMapper;
    @Mock
    private OperatorResolver operatorResolver;
    @Mock
    private PermissionService permissionService;

    @InjectMocks
    private MenuServiceImpl menuService;

    private SysUser adminUser;
    private SysUser normalAdmin;

    /** 库中现值：员工管理，挂在員工檔案(1084) 下，带 view/edit 两个动作 */
    private SysMenu stored;

    @BeforeEach
    void setUp() {
        adminUser = new SysUser();
        adminUser.setUsername("MF00001");
        adminUser.setRole("admin");
        normalAdmin = new SysUser();
        normalAdmin.setUsername("MF00002");
        normalAdmin.setRole("user");

        stored = new SysMenu();
        stored.setId(MENU_ID);
        stored.setParentId(null);
        stored.setMenuKey("employee-management");
        stored.setName("員工管理");
        stored.setNameEn("Employees");
        stored.setPath("/employee-management");
        stored.setIcon("TeamOutlined");
        stored.setType(2);
        stored.setSort(1);
        stored.setActions("[\"view\",\"edit\"]");
        stored.setStatus(1);
        stored.setDeleted(0);

        when(sysMenuMapper.selectById(MENU_ID)).thenReturn(stored);
        when(sysMenuMapper.selectCount(any(Wrapper.class))).thenReturn(0L);
        when(sysMenuMapper.update(isNull(), any(Wrapper.class))).thenReturn(1);
    }

    /** 与库中现值完全一致、只有名称不同的请求（前端行内改名的真实载荷形态） */
    private MenuRequest nameOnlyChange(String newName) {
        MenuRequest request = new MenuRequest();
        request.setParentId(stored.getParentId());
        request.setMenuKey(stored.getMenuKey());
        request.setName(newName);
        request.setNameEn(stored.getNameEn());
        request.setPath(stored.getPath());
        request.setIcon(stored.getIcon());
        request.setType(stored.getType());
        request.setSort(stored.getSort());
        request.setStatus(stored.getStatus());
        request.setActions(List.of("view", "edit"));
        return request;
    }

    private void loginAs(SysUser user) {
        when(operatorResolver.currentUser()).thenReturn(user);
        when(operatorResolver.isAdmin(user)).thenReturn("admin".equals(user.getRole()));
    }

    // ────────────── 普通管理员：名称可改 ──────────────

    @Test
    void normalAdminCanRenameMenuAndKeepStructureIdentical() {
        loginAs(normalAdmin);
        assertDoesNotThrow(() -> menuService.update(MENU_ID, nameOnlyChange("員工檔案")));
        verify(sysMenuMapper).update(isNull(), any(Wrapper.class));
    }

    @Test
    void normalAdminRenameToleratesActionOrderAndSurroundingWhitespace() {
        loginAs(normalAdmin);
        MenuRequest request = nameOnlyChange("員工檔案");
        // 动作顺序不同、字段带首尾空格：语义上都等于「没改」，不得误判为结构漂移
        request.setActions(List.of("edit", "view"));
        request.setIcon("  TeamOutlined  ");
        request.setPath("/employee-management ");
        assertDoesNotThrow(() -> menuService.update(MENU_ID, request));
    }

    @Test
    void normalAdminCannotWipeIconOrPathEvenToBlank() {
        loginAs(normalAdmin);
        MenuRequest blankIcon = nameOnlyChange("員工檔案");
        blankIcon.setIcon("");
        assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, blankIcon));

        MenuRequest blankPath = nameOnlyChange("員工檔案");
        blankPath.setPath(null);
        assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, blankPath));
    }

    @Test
    void normalAdminRenameTreatsNullSortAndStatusAsUnchanged() {
        loginAs(normalAdmin);
        MenuRequest request = nameOnlyChange("員工檔案");
        request.setSort(null);
        request.setStatus(null);
        assertDoesNotThrow(() -> menuService.update(MENU_ID, request));
    }

    // ────────────── 普通管理员：结构字段一律拒绝 ──────────────

    @Test
    void normalAdminCannotChangeMenuKey() {
        loginAs(normalAdmin);
        MenuRequest request = nameOnlyChange("員工檔案");
        request.setMenuKey("employee-profile");
        BusinessException ex = assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, request));
        assertTrue(ex.getMessage().contains("菜單 Key"), ex.getMessage());
        verify(sysMenuMapper, never()).update(isNull(), any(Wrapper.class));
    }

    @Test
    void normalAdminCannotChangeParentTypePathOrIcon() {
        loginAs(normalAdmin);
        MenuRequest parent = nameOnlyChange("員工檔案");
        parent.setParentId(48L);
        assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, parent)).getMessage();

        MenuRequest type = nameOnlyChange("員工檔案");
        type.setType(1);
        assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, type));

        MenuRequest path = nameOnlyChange("員工檔案");
        path.setPath("/employee-detail");
        assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, path));

        MenuRequest icon = nameOnlyChange("員工檔案");
        icon.setIcon("IdcardOutlined");
        assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, icon));

        verify(sysMenuMapper, never()).update(isNull(), any(Wrapper.class));
    }

    @Test
    void normalAdminCannotChangeSortOrActions() {
        loginAs(normalAdmin);
        MenuRequest sort = nameOnlyChange("員工檔案");
        sort.setSort(9);
        assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, sort));

        MenuRequest actions = nameOnlyChange("員工檔案");
        actions.setActions(List.of("view"));
        assertThrows(BusinessException.class, () -> menuService.update(MENU_ID, actions));
    }

    @Test
    void normalAdminCannotCreateDeleteOrToggleStatus() {
        loginAs(normalAdmin);
        assertThrows(PermissionDeniedException.class, () -> menuService.create(nameOnlyChange("新菜單")));
        assertThrows(PermissionDeniedException.class, () -> menuService.delete(MENU_ID));
        assertThrows(PermissionDeniedException.class, () -> menuService.updateStatus(MENU_ID, 0));
        verify(sysMenuMapper, never()).update(isNull(), any(Wrapper.class));
    }

    // ────────────── 内置超管：结构可改 ──────────────

    @Test
    void superAdminCanChangeStructureFields() {
        loginAs(adminUser);
        MenuRequest request = nameOnlyChange("員工檔案");
        request.setMenuKey("employee-profile");
        request.setPath("/employee-profile");
        request.setType(1);
        request.setSort(5);
        request.setActions(List.of("view"));
        assertDoesNotThrow(() -> menuService.update(MENU_ID, request));
        verify(sysMenuMapper).update(isNull(), any(Wrapper.class));
    }

    @Test
    void superAdminCanToggleStatusAndDeleteLeaf() {
        loginAs(adminUser);
        assertDoesNotThrow(() -> menuService.updateStatus(MENU_ID, 0));
        verify(sysMenuMapper).updateById(any(SysMenu.class));

        when(sysMenuMapper.selectCount(any(Wrapper.class))).thenReturn(0L);
        assertDoesNotThrow(() -> menuService.delete(MENU_ID));
        verify(sysMenuMapper).deleteById(anyLong());
    }
}
