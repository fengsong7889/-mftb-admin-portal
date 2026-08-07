package com.mftb.admin.annotation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 接口权限注解: 标注在 Controller 方法上, 由 PermissionAspect 统一校验
 * <p>
 * menu 对应 sys_menu.menu_key; action 对应授权操作
 * (view/create/edit/delete/import/export/enable/disable), 默认 view
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequirePermission {

    /** 菜单标识 (sys_menu.menu_key) */
    String menu();

    /** 所需操作, 默认查看 */
    String action() default "view";
}
