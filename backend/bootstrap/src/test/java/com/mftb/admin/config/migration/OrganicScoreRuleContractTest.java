package com.mftb.admin.config.migration;

import com.mftb.admin.entity.OrganicScoreRule;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 自然流量評分規則表結構契約回归测试。
 * <p>
 * 生产事故根因：实体新增字段（multiplier_tiers / threshold_score / region_configs）只写进了
 * {@code backend/sql/} 参考脚本，未接入启动期自动迁移，导致生产缺列、列表查询 500。
 * 本测试用反射把「实体字段」与「契约列」强绑定：以后再加字段而忘记登记契约，CI 直接失败。
 */
@DisplayName("ContractRegistry: 自然流量評分規則表契约覆盖实体全部列")
class OrganicScoreRuleContractTest {

    @Test
    @DisplayName("契约表名与实体 @TableName 一致")
    void contractTargetsOrganicScoreRuleTable() {
        ContractSpec spec = ContractRegistry.organicScoreRuleContract();
        assertEquals("biz_organic_score_rule", spec.table());
        assertNotNull(spec.createTableIfMissing(), "该表可能在全新环境首次创建，契约必须带自愈建表 DDL");
    }

    @Test
    @DisplayName("实体每个字段都有对应的契约列（建表 DDL 或补列自愈）")
    void everyEntityFieldHasContractColumn() {
        ContractSpec spec = ContractRegistry.organicScoreRuleContract();
        String createDdl = spec.createTableIfMissing().toLowerCase(Locale.ROOT);

        List<String> missing = new ArrayList<>();
        for (Field field : OrganicScoreRule.class.getDeclaredFields()) {
            if (field.isSynthetic() || Modifier.isStatic(field.getModifiers())) {
                continue;
            }
            String column = toSnakeCase(field.getName());
            boolean inCreate = createDdl.contains(column + " ");
            boolean healable = spec.requiredColumns().stream()
                    .anyMatch(c -> c.column().equals(column) && c.healable());
            if (!inCreate && !healable) {
                missing.add(field.getName() + "→" + column);
            }
        }
        assertTrue(missing.isEmpty(), "以下实体列未在结构契约中登记: " + missing);
    }

    @Test
    @DisplayName("事故三列必须可自愈补列")
    void incidentColumnsAreHealable() {
        ContractSpec spec = ContractRegistry.organicScoreRuleContract();
        for (String column : List.of("multiplier_tiers", "threshold_score", "region_configs")) {
            assertTrue(spec.requiredColumns().stream()
                            .anyMatch(c -> c.column().equals(column) && c.healable()),
                    column + " 必须登记可自愈的 ADD COLUMN DDL");
        }
    }

    /** 驼峰 → 下划线（与 MyBatis-Plus 默认 map-underscore-to-camel-case 反向一致） */
    private String toSnakeCase(String name) {
        StringBuilder sb = new StringBuilder(name.length() + 8);
        for (int i = 0; i < name.length(); i++) {
            char ch = name.charAt(i);
            if (Character.isUpperCase(ch)) {
                if (i > 0) {
                    sb.append('_');
                }
                sb.append(Character.toLowerCase(ch));
            } else {
                sb.append(ch);
            }
        }
        return sb.toString();
    }
}
