package com.mftb.admin.config.migration;

import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 结构契约登记表。新增关键业务表结构时在此登记，由 {@link SchemaContractValidator}
 * 每次启动校验并在缺失时执行“可证明安全”的自愈 DDL。
 * <p>
 * 契约保持克制：只登记事故相关/关键写入路径的表，避免对未知表误判 not-ready。
 */
@Component
public class ContractRegistry {

    /**
     * 全部结构契约。当前登记金字招牌计价主表与标签明细表
     * （对应事故：新增金字招牌定价保存报数据库异常）。
     */
    public List<ContractSpec> allContracts() {
        return List.of(signboardPricingMain(), signboardPricingLabel());
    }

    private ContractSpec signboardPricingMain() {
        return new ContractSpec(
                "signboard-pricing-main",
                "biz_ad_pricing_signboard",
                "CREATE TABLE IF NOT EXISTS biz_ad_pricing_signboard ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "pricing_no VARCHAR(32) NOT NULL COMMENT '定价编号', "
                        + "algo_id BIGINT NOT NULL COMMENT '关联算法ID', "
                        + "algo_name VARCHAR(128) DEFAULT NULL COMMENT '算法名称快照', "
                        + "brand VARCHAR(32) DEFAULT NULL COMMENT '所属品牌', "
                        + "channel INT DEFAULT NULL COMMENT '业务频道', "
                        + "presale_days INT NOT NULL DEFAULT 7 COMMENT '预售天数', "
                        + "refund_enabled INT NOT NULL DEFAULT 1 COMMENT '退款开关', "
                        + "cancel_fee_tiers TEXT DEFAULT NULL COMMENT '取消扣费梯度JSON', "
                        + "discount_mode VARCHAR(10) NOT NULL DEFAULT 'local' COMMENT '折扣模式', "
                        + "global_discount_tiers TEXT DEFAULT NULL COMMENT '全局折扣梯度JSON', "
                        + "status INT NOT NULL DEFAULT 1 COMMENT '服务状态', "
                        + "remark VARCHAR(255) DEFAULT NULL COMMENT '备注', "
                        + "updated_by VARCHAR(64) DEFAULT NULL COMMENT '最后更新人', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "UNIQUE KEY uk_pricing_signboard_no (pricing_no), "
                        + "KEY idx_pricing_signboard_algo (algo_id), "
                        + "KEY idx_pricing_signboard_status (status)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌计价主表'",
                List.of(
                        new ContractSpec.ColumnSpec("discount_mode",
                                "ALTER TABLE biz_ad_pricing_signboard ADD COLUMN discount_mode VARCHAR(10) NOT NULL DEFAULT 'local' COMMENT '折扣模式: global/local' AFTER cancel_fee_tiers"),
                        new ContractSpec.ColumnSpec("global_discount_tiers",
                                "ALTER TABLE biz_ad_pricing_signboard ADD COLUMN global_discount_tiers TEXT DEFAULT NULL COMMENT '全局折扣梯度JSON' AFTER discount_mode")
                ));
    }

    private ContractSpec signboardPricingLabel() {
        return new ContractSpec(
                "signboard-pricing-label",
                "biz_ad_pricing_signboard_label",
                "CREATE TABLE IF NOT EXISTS biz_ad_pricing_signboard_label ("
                        + "id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID', "
                        + "pricing_id BIGINT NOT NULL COMMENT '计价主表ID', "
                        + "label_type VARCHAR(32) NOT NULL COMMENT '标签类型', "
                        + "scenario VARCHAR(32) DEFAULT NULL COMMENT '场景', "
                        + "enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用', "
                        + "price DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT '标签日单价', "
                        + "discount_tiers TEXT DEFAULT NULL COMMENT '梯度折扣JSON', "
                        + "deleted TINYINT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间', "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间', "
                        + "KEY idx_signboard_label_pricing (pricing_id)"
                        + ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='金字招牌标签计价明细表'",
                List.of(
                        new ContractSpec.ColumnSpec("scenario",
                                "ALTER TABLE biz_ad_pricing_signboard_label ADD COLUMN scenario VARCHAR(32) DEFAULT NULL COMMENT '场景（all_macau/district/NULL）' AFTER label_type")
                ));
    }
}
