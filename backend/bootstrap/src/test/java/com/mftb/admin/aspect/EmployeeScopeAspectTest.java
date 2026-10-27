package com.mftb.admin.aspect;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.service.OrgScopeService;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.reflect.MethodSignature;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 花名册人员范围切面测试。
 * <p>切面类安全机制最怕的是「根本没生效」，所以这里断言的是「有没有调用范围校验」，
 * 而不是返回值。参数名解析依赖编译期 {@code -parameters}，测试同时钉住「取不到 id 时不乱校验」。
 */
class EmployeeScopeAspectTest {

    private final OrgScopeService orgScopeService = mock(OrgScopeService.class);
    private final EmployeeScopeAspect aspect = new EmployeeScopeAspect(orgScopeService);

    @Test
    @DisplayName("带 id 路径变量的方法会先校验人员在可见范围内")
    void checksEmployeeIdParameter() throws Throwable {
        aspect.guard(joinPoint(new String[]{"id", "request"}, new Object[]{7L, "payload"}));

        verify(orgScopeService).requireVisibleUser(7L);
    }

    @Test
    @DisplayName("没有 id 参数（列表/下拉）时不做人员校验，也不猜别的 Long")
    void skipsWhenNoIdParameter() throws Throwable {
        aspect.guard(joinPoint(new String[]{"page", "size", "roleId"}, new Object[]{1L, 10L, 3L}));

        verify(orgScopeService, never()).requireVisibleUser(anyLong());
    }

    @Test
    @DisplayName("越权时异常原样抛出，业务方法不被执行")
    void rejectionStopsTheHandler() throws Throwable {
        org.mockito.Mockito.doThrow(new BusinessException("無權查看該人員的資料"))
                .when(orgScopeService).requireVisibleUser(9L);
        ProceedingJoinPoint point = joinPoint(new String[]{"id"}, new Object[]{9L});

        assertThrows(BusinessException.class, () -> aspect.guard(point));
        verify(point, never()).proceed();
    }

    private ProceedingJoinPoint joinPoint(String[] parameterNames, Object[] args) {
        MethodSignature signature = mock(MethodSignature.class);
        when(signature.getParameterNames()).thenReturn(parameterNames);
        ProceedingJoinPoint point = mock(ProceedingJoinPoint.class);
        when(point.getSignature()).thenReturn(signature);
        when(point.getArgs()).thenReturn(args);
        return point;
    }
}
