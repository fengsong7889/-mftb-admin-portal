package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.constant.OrgDataScope;
import com.mftb.admin.service.OrgScopeService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 组织数据范围接口的映射与授权边界测试。
 * <p>
 * 用 standalone MockMvc 打真实路径而不是靠 401 探针：JWT 过滤器在 Spring MVC 之前
 * 统一返回 401，「路径不存在」和「存在但未登录」看起来完全一样（考勤域实测踩过）。
 */
class OrgScopeControllerMappingTest {

    private final OrgScopeService orgScopeService = mock(OrgScopeService.class);

    private MockMvc mockMvc() {
        return MockMvcBuilders.standaloneSetup(new OrgScopeController(orgScopeService)).build();
    }

    private static Map<String, Object> deptScopeDescription() {
        Map<String, Object> described = new LinkedHashMap<>();
        described.put("scope", OrgDataScope.DEPT);
        described.put("scopeLabel", OrgDataScope.LABELS.get(OrgDataScope.DEPT));
        described.put("unlimited", false);
        described.put("deptCount", 1L);
        described.put("userCount", 9L);
        return described;
    }

    @Test
    @DisplayName("GET /api/org-scope/mine 已映射，并回传档位与可见人数")
    void mineEndpointIsMappedAndReturnsScope() throws Exception {
        when(orgScopeService.describe()).thenReturn(deptScopeDescription());

        mockMvc().perform(get("/api/org-scope/mine"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.scope").value(OrgDataScope.DEPT))
                .andExpect(jsonPath("$.data.unlimited").value(false))
                .andExpect(jsonPath("$.data.userCount").value(9));
    }

    @Test
    @DisplayName("接口只读，且刻意不带 @RequirePermission：边界是「必须登录」而不是「必须持有某菜单」")
    void handlerIsReadOnlyAndIntentionallyUnannotated() {
        Method[] methods = Arrays.stream(OrgScopeController.class.getDeclaredMethods())
                // 过滤非源码方法：jacoco 会往类里插一个 $jacocoInit，它不是 handler（且不一定带 synthetic 标记）
                .filter(m -> !m.isSynthetic() && !m.getName().startsWith("$"))
                .toArray(Method[]::new);
        assertTrue(methods.length > 0, "控制器不应没有 handler");
        for (Method method : methods) {
            boolean getMapping = Arrays.stream(method.getAnnotations())
                    .map(Annotation::annotationType)
                    .anyMatch(GetMapping.class::equals);
            assertTrue(getMapping, "本接口只允许只读端点: " + method.getName());
            assertNotNull(method.getAnnotation(GetMapping.class), "缺少 GET 映射: " + method.getName());
            // 返回的是调用者自己的档位，不含他人数据；绑到某个菜单反而会让其它系统的提示页 403
            assertNull(method.getAnnotation(RequirePermission.class),
                    "自述范围接口不应绑定菜单权限: " + method.getName());
        }
    }
}
