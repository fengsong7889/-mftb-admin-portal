package com.mftb.admin.config;

import org.junit.jupiter.api.Test;

import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * v3.21 存量项目编号补号的编号形态约束。
 * <p>迁移主体是 SQL 编排（依赖真实库），这里只钉住可纯函数验证的部分：补零规则、
 * 超 99 自然扩位、生成结果必须命中合规正则、旧前缀不得被误判为合规。
 */
class RdmProjectNoRepairTest {

    /** 与迁移里的 PROJECT_NO_COMPLIANT_REGEX 同形：PROJ + 8 位日期 + ≥2 位序号 */
    private static final Pattern COMPLIANT = Pattern.compile("^PROJ[0-9]{8}[0-9]{2,}$");

    @Test
    void 首位补零为01() {
        assertEquals("PROJ2026102001",
                RdmSchemaMigrationInitializer.buildProjectNo("PROJ", "20261020", 1, 2));
    }

    @Test
    void 两位数序号原样输出() {
        assertEquals("PROJ2026102012",
                RdmSchemaMigrationInitializer.buildProjectNo("PROJ", "20261020", 12, 2));
    }

    @Test
    void 超过99自然扩位而不是截断() {
        String no = RdmSchemaMigrationInitializer.buildProjectNo("PROJ", "20261020", 100, 2);
        assertEquals("PROJ20261020100", no);
        assertTrue(COMPLIANT.matcher(no).matches(), "扩位后的编号仍须合规");
    }

    @Test
    void 生成结果始终命中合规正则() {
        for (int seq = 1; seq <= 120; seq++) {
            String no = RdmSchemaMigrationInitializer.buildProjectNo("PROJ", "20261019", seq, 2);
            assertTrue(COMPLIANT.matcher(no).matches(), no);
        }
    }

    @Test
    void 旧前缀与残缺编号都不算合规() {
        assertFalse(COMPLIANT.matcher("PJ202610190001").matches(), "旧 PJ 前缀需补号");
        assertFalse(COMPLIANT.matcher("PROJ2026101").matches(), "日期段不足 8 位");
        assertFalse(COMPLIANT.matcher("PROJ202610190").matches(), "序号不足 2 位");
        assertTrue(COMPLIANT.matcher("PROJ2026102001").matches());
    }
}
