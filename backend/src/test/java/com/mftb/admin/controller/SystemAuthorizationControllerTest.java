package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PortalSystemVO;
import com.mftb.admin.dto.SystemAuthorizationRequest;
import com.mftb.admin.dto.SystemAuthorizationVO;
import com.mftb.admin.entity.SysSystem;
import com.mftb.admin.mapper.SysSystemMapper;
import com.mftb.admin.service.SystemAuthorizationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SystemAuthorizationController 单元测试（Round 4）。
 * <p>覆盖：启用系统目录读取顺序 / 角色读写转发到 service / 部门读写转发到 service。
 * <p>不测 @RequirePermission 拦截，那部分由 PermissionAspect 集成用例与后续灰度观察覆盖。
 */
class SystemAuthorizationControllerTest {

    private SystemAuthorizationService systemAuthorizationService;
    private SysSystemMapper sysSystemMapper;
    private SystemAuthorizationController controller;

    @BeforeEach
    void setUp() {
        systemAuthorizationService = mock(SystemAuthorizationService.class);
        sysSystemMapper = mock(SysSystemMapper.class);
        controller = new SystemAuthorizationController(systemAuthorizationService, sysSystemMapper);
    }

    @Test
    @DisplayName("catalog：按 sys_system.sort 升序返回启用系统")
    void catalogReturnsEnabledSystemsInOrder() {
        when(sysSystemMapper.selectList(ArgumentMatchers.<com.baomidou.mybatisplus.core.conditions.Wrapper<SysSystem>>any()))
                .thenReturn(List.of(buildSystem("ads", "廣告與推廣系統", 10), buildSystem("hr", "HR 系統", 60)));

        Result<List<PortalSystemVO>> result = controller.catalog();

        assertEquals(200, result.getCode());
        assertEquals(2, result.getData().size());
        assertEquals("ads", result.getData().get(0).getCode());
        assertEquals("hr", result.getData().get(1).getCode());
    }

    @Test
    @DisplayName("readRole：转发到 service.read(TARGET_ROLE, id, code)")
    void readRoleDelegates() {
        SystemAuthorizationVO vo = new SystemAuthorizationVO();
        vo.setTargetType("role");
        vo.setTargetId(42L);
        vo.setSystemCode("ads");
        when(systemAuthorizationService.read("role", 42L, "ads")).thenReturn(vo);

        Result<SystemAuthorizationVO> result = controller.readRole(42L, "ads");

        assertEquals(200, result.getCode());
        assertEquals(vo, result.getData());
        verify(systemAuthorizationService).read("role", 42L, "ads");
    }

    @Test
    @DisplayName("saveDepartment：转发到 service.save(TARGET_DEPARTMENT, id, code, payload)")
    void saveDepartmentDelegates() {
        SystemAuthorizationRequest req = new SystemAuthorizationRequest();
        req.setSystemAccess(true);
        SystemAuthorizationVO returned = new SystemAuthorizationVO();
        returned.setTargetType("department");
        returned.setTargetId(7L);
        returned.setSystemCode("eam");
        when(systemAuthorizationService.save("department", 7L, "eam", req)).thenReturn(returned);

        Result<SystemAuthorizationVO> result = controller.saveDepartment(7L, "eam", req);

        assertEquals(200, result.getCode());
        assertEquals(returned, result.getData());
        verify(systemAuthorizationService).save("department", 7L, "eam", req);
    }

    private SysSystem buildSystem(String code, String name, int sort) {
        SysSystem s = new SysSystem();
        s.setCode(code);
        s.setName(name);
        s.setSort(sort);
        s.setStatus(1);
        s.setDeleted(0);
        return s;
    }
}
