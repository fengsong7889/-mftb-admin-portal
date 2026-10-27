package com.mftb.admin.config;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.PermissionDeniedException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.method.HandlerMethod;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 路径级兜底的行为：未标注 @RequirePermission 的 HCM 端点必须被拒绝，
 * 已标注的放行交给 PermissionAspect 继续判定。
 */
class HcmAuthorizationGuardInterceptorTest {

    private final HcmAuthorizationGuardInterceptor interceptor = new HcmAuthorizationGuardInterceptor();

    /** 测试用控制器：一个已标注、一个漏标注 */
    static class DemoController {
        @RequirePermission(menu = "hcm-person")
        public void guarded() {
        }

        public void unguarded() {
        }
    }

    private HandlerMethod handler(String methodName) throws NoSuchMethodException {
        Method method = DemoController.class.getMethod(methodName);
        return new HandlerMethod(new DemoController(), method);
    }

    @Test
    @DisplayName("漏标注 @RequirePermission 的端点按默认拒绝处理")
    void deniesUnguardedEndpoint() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/hcm/v1/hr/persons");
        PermissionDeniedException ex = assertThrows(PermissionDeniedException.class,
                () -> interceptor.preHandle(request, new MockHttpServletResponse(), handler("unguarded")));
        assertTrue(ex.getMessage().contains("接口未声明权限"));
    }

    @Test
    @DisplayName("已声明权限的端点放行，由 PermissionAspect 继续判定动作")
    void allowsGuardedEndpoint() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/hcm/v1/hr/persons");
        boolean allowed = interceptor.preHandle(request, new MockHttpServletResponse(), handler("guarded"));
        assertTrue(allowed);
    }

    @Test
    @DisplayName("非控制器处理器（如资源请求）同样按默认拒绝处理")
    void deniesNonHandlerMethod() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/hcm/v1/hr/persons");
        PermissionDeniedException ex = assertThrows(PermissionDeniedException.class,
                () -> interceptor.preHandle(request, new MockHttpServletResponse(), new Object()));
        assertTrue(ex.getMessage().contains("接口未声明权限"));
        assertEquals(true, true);
    }
}
