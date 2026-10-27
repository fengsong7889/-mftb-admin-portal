package com.mftb.admin.config.migration;

/**
 * 迁移执行阶段。启动期迁移协调器按阶段顺序执行，跨模块依赖不得早于其依赖阶段。
 * 阶段序号即执行优先级，值越小越先执行。
 */
public enum SchemaPhase {
    /** 资源/环境预检（连接、方言、权限探测），不写库 */
    PRECHECK(0),
    /** 核心基础结构：sys_* 表、补列 */
    BASE_STRUCTURE(10),
    /** 各业务模块建表 */
    MODULE_STRUCTURE(20),
    /** 菜单种子（必须在权限迁移之前） */
    MENU_SEED(30),
    /** 安全的数据迁移与种子回填 */
    DATA_MIGRATION(40),
    /** 全局结构验收（契约校验），最后执行 */
    VALIDATE(50);

    private final int order;

    SchemaPhase(int order) {
        this.order = order;
    }

    public int order() {
        return order;
    }
}
