package com.mftb.admin.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 标记「按员工路径参数做组织数据范围收敛」的控制器或方法。
 * <p>
 * 路径里带 {@code /{id}}（员工 id）的端点一律走 {@code EmployeeScopeAspect} 校验：
 * 操作者必须在自己的可见人员范围内，否则拒绝。
 * <p>
 * 为什么用注解 + 切面而不是每个方法手写一次：{@code EmployeeController} 有 30+ 个
 * {@code /{id}/...} 端点（基本资料、薪酬、合同、职务、紧急联系人…），逐个手写必然漏，
 * 而漏一个就是一个越权口子；注解在类上一次，之后新增端点自动被覆盖。
 * <p>
 * 为什么不在服务层的 {@code requireUser} 里统一加：离职办理、异动自动停号等内部调用也走同一批
 * 服务方法，它们的语义是「人事事实执行」而不是「某人查看某员工」，在那些路径上加人员范围会把
 * 正常办理拒掉。收敛只该发生在 HTTP 入口。
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface EnsureEmployeeScope {
}
