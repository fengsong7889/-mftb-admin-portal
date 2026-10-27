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
 * (view/create/edit/delete/import/export/enable/disable/view_all/dispatch/contribute), 默认 view
 * <p>校验顺序：{@code (menu, action)} → {@link #anyOf()} 同动作换菜单 →
 * {@link #anyPermissions()} 菜单与动作同时换。三层都是 OR，但**默认拒绝**：
 * 任何一层都不命中即 403，备选集只能放宽「同一个能力由哪个菜单授予」，不能放宽能力本身。
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

    /**
     * 跨菜单且**异动作**的 OR 备选，每项写成 {@code menuKey:action}（如 {@code rdm-requirement:view_all}）。
     * <p>为什么 anyOf 不够：菜单收敛时不仅菜单变了，动作名也变了
     * （{@code rdm-intake:view} 的全量可见在新锚点上叫 {@code rdm-requirement:view_all}），
     * anyOf 只会拿同一个 action 去试其他菜单，表达不了这种“菜单+动作”成对改写。
     * <p>默认为空，对现有接口零影响。格式非法（缺冒号、菜单或动作为空）的条目按**不命中**处理
     * 并记 error：宁可让接口拒得下来，也不能拿一写错的注解去放行跨菜单能力。
     */
    String[] anyPermissions() default {};

    /** 所需操作, 默认查看 */
    String action() default "view";
}
