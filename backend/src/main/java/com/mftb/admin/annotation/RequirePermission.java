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

    /**
     * 备选菜单集合（OR 语义）：主菜单校验不通过时，只要持有其中任一菜单的对应 action 即放行。
     * 用于跨多个菜单共享的只读接口（如 HR 字典下拉被员工详情/合同台账/字典管理共同消费），
     * 在保持“默认拒绝”的前提下避免因单一菜单绑定而误伤其他合法调用方。默认为空。
     */
    String[] anyOf() default {};

    /** 所需操作, 默认查看 */
    String action() default "view";
}
