package com.mftb.admin.config.migration;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 结构契约登记表（聚合器）。
 *
 * 拆分后的职责边界：本类只做「收集 + 顺序」，不持有任何业务域的实现类。
 * 各模块通过实现 {@link SchemaContractProvider} 自带契约：
 * legacy 的 LegacyCoreContracts（未拆出的域）、modules/rdm 的 RdmSchemaContracts。
 *
 * 为什么要拆：registry 会被 SchemaCheckRunner / SchemaContractValidator（迁移框架，位于 shared）
 * 直接依赖；如果 registry 继续持有 RDM 或 doc 域的契约类，就会出现 shared -> legacy 的反向依赖，
 * 与「域模块独立编译」直接冲突。
 *
 * 契约顺序 = 各 provider 的 @Order/声明顺序；同一张表只允许登记一次（重复会被校验器发现）。
 */
@Component
public class ContractRegistry {

    private final List<SchemaContractProvider> providers;

    public ContractRegistry(List<SchemaContractProvider> providers) {
        this.providers = providers;
    }

    /** 全部结构契约：按 provider 顺序拼接 */
    public List<ContractSpec> allContracts() {
        List<ContractSpec> combined = new ArrayList<>();
        providers.forEach(provider -> combined.addAll(provider.contracts()));
        return combined;
    }
}
