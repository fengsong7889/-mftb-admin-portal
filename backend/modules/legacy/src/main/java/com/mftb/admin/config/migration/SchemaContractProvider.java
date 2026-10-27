package com.mftb.admin.config.migration;

import java.util.List;

/**
 * 结构契约提供者：由各业务域模块实现，启动时由 {@link ContractRegistry} 统一聚合。
 *
 * <p>为什么要有这个接口：RDM 的关键表结构契约原本直接写在 ContractRegistry（legacy）里，
 * 域模块搬家后 legacy 会反向依赖 RDM，形成编译环。改成「接口在 legacy、实现在域模块、
 * Spring 注入 List&lt;SchemaContractProvider&gt;」之后，注册表仍然只有一份，
 * 而契约的归属回到各自的域。
 *
 * <p>实现类必须是 Spring 组件；返回的契约顺序即校验顺序，域内新增契约请追加而不是插队。
 */
public interface SchemaContractProvider {

    /** 本域声明的全部结构契约（可为空，不得返回 null） */
    List<ContractSpec> contracts();
}
