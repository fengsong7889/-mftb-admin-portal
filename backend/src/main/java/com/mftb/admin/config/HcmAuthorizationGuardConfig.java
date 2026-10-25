package com.mftb.admin.config;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 把 HCM 路径级鉴权兜底挂到 {@code /api/hcm/**}。
 * <p>只覆盖 HCM 新域：既有接口的历史行为不在本轮改动范围内（方案：旧模块逐域迁移，不一次性改）。
 */
@Configuration
@RequiredArgsConstructor
public class HcmAuthorizationGuardConfig implements WebMvcConfigurer {

    private final HcmAuthorizationGuardInterceptor hcmAuthorizationGuardInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(hcmAuthorizationGuardInterceptor).addPathPatterns("/api/hcm/**");
    }
}
