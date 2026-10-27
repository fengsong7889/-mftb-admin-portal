package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VehicleDto;
import com.mftb.admin.dto.VehicleUseDto;
import com.mftb.admin.service.VehicleService;
import com.mftb.admin.service.VehicleUseService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 用车接口映射与权限注解守卫测试。
 *
 * <p>两件事各自解决一类静默故障：
 * <ol>
 *   <li>用 standalone MockMvc 打真实路径：路径写错或方法没映射时，HTTP 层直接 404/405，
 *       而不是等前端联调时才发现。未登录探针证明不了这件事——JWT 过滤器在 MVC 之前
 *       就统一返回 401，存在与不存在的路径看起来一样。</li>
 *   <li>反射断言每个 handler 都带 {@code @RequirePermission}：新增接口时忘记加注解，
 *       后果是"该接口对任何登录用户敞开"，而这在功能测试里完全看不出来。</li>
 * </ol>
 */
class VehicleControllerMappingTest {

    private static final List<String> HANDLER_ANNOTATIONS = List.of(
            "org.springframework.web.bind.annotation.GetMapping",
            "org.springframework.web.bind.annotation.PostMapping",
            "org.springframework.web.bind.annotation.PutMapping",
            "org.springframework.web.bind.annotation.DeleteMapping");

    @Test
    @DisplayName("车辆档案路由可映射")
    void vehicleRoutesResolve() throws Exception {
        VehicleService service = mock(VehicleService.class);
        when(service.page(any(VehicleDto.Query.class))).thenReturn(new PageResult<>(List.of(), 0L));
        when(service.available(any(VehicleDto.AvailableQuery.class))).thenReturn(List.of());
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new VehicleController(service)).build();

        mvc.perform(get("/api/vehicle/vehicles")).andExpect(status().isOk());
        mvc.perform(get("/api/vehicle/vehicles/available")).andExpect(status().isOk());
        verify(service).page(any(VehicleDto.Query.class));
    }

    @Test
    @DisplayName("用车单与台账路由可映射")
    void useAndLedgerRoutesResolve() throws Exception {
        VehicleUseService service = mock(VehicleUseService.class);
        when(service.page(any(VehicleUseDto.Query.class))).thenReturn(new PageResult<>(List.of(), 0L));
        when(service.todoStats(any(VehicleUseDto.Query.class))).thenReturn(new VehicleUseDto.TodoStats());
        when(service.ledgerStats(any(VehicleUseDto.Query.class))).thenReturn(new VehicleUseDto.LedgerStats());
        when(service.backfill(any(VehicleUseDto.Backfill.class))).thenReturn(1L);
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new VehicleUseController(service)).build();

        mvc.perform(get("/api/vehicle/uses")).andExpect(status().isOk());
        mvc.perform(get("/api/vehicle/uses/todo-stats")).andExpect(status().isOk());
        mvc.perform(get("/api/vehicle/ledger/stats")).andExpect(status().isOk());
        mvc.perform(get("/api/vehicle/my-uses")).andExpect(status().isOk());
        mvc.perform(post("/api/vehicle/uses/confirm")
                .contentType("application/json")
                .content("{\"useId\":1,\"reason\":\"無誤\"}")).andExpect(status().isOk());
        verify(service).confirm(any(VehicleUseDto.Confirm.class));
    }

    @Test
    @DisplayName("我的用车列表强制本人口径，不接受前端传 userId")
    void myUsesForceSelfScope() throws Exception {
        VehicleUseService service = mock(VehicleUseService.class);
        when(service.page(any(VehicleUseDto.Query.class))).thenReturn(new PageResult<>(List.of(), 0L));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(new VehicleUseController(service)).build();

        mvc.perform(get("/api/vehicle/my-uses")).andExpect(status().isOk());

        var captor = org.mockito.ArgumentCaptor.forClass(VehicleUseDto.Query.class);
        verify(service).page(captor.capture());
        // scope 由服务端设定，前端即使传 my_driving 也不能越界读到别人的单
        assertTrue("my_applied".equals(captor.getValue().getScope()),
                "我的用车接口必须固定 scope，实际=" + captor.getValue().getScope());
    }

    @Test
    @DisplayName("每个用车接口都必须声明 @RequirePermission")
    void everyHandlerIsPermissionAnnotated() {
        int checked = 0;
        for (Class<?> controller : List.of(VehicleController.class, VehicleUseController.class)) {
            for (Method method : controller.getDeclaredMethods()) {
                boolean isHandler = java.util.Arrays.stream(method.getAnnotations())
                        .anyMatch(a -> HANDLER_ANNOTATIONS.contains(a.annotationType().getName()));
                if (!isHandler) {
                    continue;
                }
                RequirePermission permission = method.getAnnotation(RequirePermission.class);
                assertNotNull(permission,
                        controller.getSimpleName() + "#" + method.getName() + " 缺少 @RequirePermission，会对所有登录用户敞开");
                assertTrue(List.of(VehicleConstants.MENU_FILES, VehicleConstants.MENU_DISPATCH,
                                VehicleConstants.MENU_LEDGER, VehicleConstants.MENU_MY_USE)
                                .stream().anyMatch(k -> k.equals(permission.menu())
                                        || java.util.Arrays.asList(permission.anyOf()).contains(k)),
                        controller.getSimpleName() + "#" + method.getName() + " 的菜单标识不属于用车域");
                checked++;
            }
        }
        assertTrue(checked >= 20, "用车接口数量异常偏少，疑似反射未扫到 handler: " + checked);
    }
}
