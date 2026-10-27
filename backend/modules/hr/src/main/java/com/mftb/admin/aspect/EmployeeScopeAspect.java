package com.mftb.admin.aspect;

import com.mftb.admin.service.OrgScopeService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

/**
 * 员工数据范围切面：拦住「拿着花名册菜单就能操作全公司任何一个人」。
 * <p>
 * 取参方式刻意保守：只认名为 {@code id} 的 Long 参数（EmployeeController 的路径变量就叫 id）。
 * 取不到就不校验，而不是猜一个 Long 参数当员工 id —— 把 roleId 当 userId 校验会产生
 * 「看起来有防护、实际护错了对象」的假安全，那比没有防护更糟。
 * 参数名靠编译期 {@code -parameters} 保留（Spring 绑定 @PathVariable 也依赖它）。
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class EmployeeScopeAspect {

    private static final String EMPLOYEE_ID_PARAM = "id";

    private final OrgScopeService orgScopeService;

    @Around("@within(com.mftb.admin.annotation.EnsureEmployeeScope)"
            + " || @annotation(com.mftb.admin.annotation.EnsureEmployeeScope)")
    public Object guard(ProceedingJoinPoint joinPoint) throws Throwable {
        Long employeeId = resolveEmployeeId(joinPoint);
        if (employeeId != null) {
            // 越权文案与考勤域一致（不区分「不存在」与「无权限」，避免用来探测人员存在性）
            orgScopeService.requireVisibleUser(employeeId);
        }
        return joinPoint.proceed();
    }

    private Long resolveEmployeeId(ProceedingJoinPoint joinPoint) {
        if (!(joinPoint.getSignature() instanceof MethodSignature signature)) {
            return null;
        }
        String[] names = signature.getParameterNames();
        Object[] args = joinPoint.getArgs();
        if (names == null) {
            log.warn("员工范围切面取不到参数名，跳过校验: {}", signature.toShortString());
            return null;
        }
        for (int i = 0; i < names.length; i++) {
            if (EMPLOYEE_ID_PARAM.equals(names[i]) && args[i] instanceof Long id) {
                return id;
            }
        }
        return null;
    }
}
