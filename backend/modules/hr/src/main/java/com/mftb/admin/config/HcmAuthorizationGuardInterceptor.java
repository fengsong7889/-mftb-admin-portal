package com.mftb.admin.config;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.PermissionDeniedException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * HCM 接口的「路径级兜底拒绝」。
 * <p>
 * 为什么需要它：{@code PermissionAspect} 只对标注了 {@code @RequirePermission} 的方法生效，
 * 新加一个忘标注的端点会变成"登录即可访问"的裸接口（安全审查 CWE-862 指出的正是这一点）。
 * 本拦截器对 {@code /api/hcm/**} 做 fail-closed：处理链上的方法没有该注解就一律 403，
 * 而不是放行。这样「忘标注」的后果是接口不可用（立刻暴露），而不是静默开放。
 * <p>
 * 注意：它只补"有没有声明"，不替代注解本身的动作校验——真正的菜单/动作判定仍在
 * {@code PermissionAspect} 里执行。
 */
@Component
public class HcmAuthorizationGuardInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            // 预检、静态资源等非控制器请求不在此路径下；真出现也按默认拒绝
            throw PermissionDeniedException.unscopedEndpoint(request.getRequestURI());
        }
        RequirePermission annotation = handlerMethod.getMethodAnnotation(RequirePermission.class);
        if (annotation == null) {
            throw PermissionDeniedException.unscopedEndpoint(request.getRequestURI());
        }
        return true;
    }
}
