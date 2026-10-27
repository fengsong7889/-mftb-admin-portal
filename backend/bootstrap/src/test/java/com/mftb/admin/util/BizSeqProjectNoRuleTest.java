package com.mftb.admin.util;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.entity.SysBizSeqRule;
import com.mftb.admin.mapper.BizSeqMapper;
import com.mftb.admin.mapper.SysBizSeqRuleMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 项目编号发号口径测试（方案 §1.1 / §五「项目编号发号口径」）。
 *
 * <p>规则行已由 {@code rdm:schema:v3.16} 改为 {@code PROJ + YYYYMMDD + 2 位日流水}，
 * 但<b>发号代码零改动</b>——格式完全由 {@code sys_biz_seq_rule} 驱动。本测试钉住的正是
 * 「同一份代码 + 新规则行 = 新编号形态」这条等式，防止有人日后改 {@code BizSeqService}
 * 时把补零位数、日期段或重置粒度弄坏（编号一旦发出去就是对外事实，改错无法回收）。
 *
 * <p>四条口径：
 * <ol>
 *   <li>形态：{@code PROJ2026101901}（前缀 + 8 位日期 + 2 位补零流水）；</li>
 *   <li>每日从 01 重置：序号键含日期段，跨日即换键；</li>
 *   <li>超 99 自然扩位为 100，<b>不截断、不循环复用</b>（截断会撞唯一键 uk_project_no）；</li>
 *   <li>规则缺失/停用 fail-closed 抛错，绝不回落到别的前缀。</li>
 * </ol>
 */
class BizSeqProjectNoRuleTest {

    private static final String RULE_KEY = "rdm_project";
    private static final LocalDate DAY = LocalDate.of(2026, 10, 19);

    /**
     * LambdaQueryWrapper 解析「方法引用 → 列名」依赖 MyBatis-Plus 的 TableInfo 缓存，
     * 没有 Spring 容器时该缓存为空，会抛「can not find lambda cache for this entity」。
     * 按仓库既有做法（RdmRequirementQueryScopeTest）在测试类里手动初始化。
     */
    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), SysBizSeqRule.class);
    }

    /** 构造一个规则行完全按 v3.16 迁移后的形态（PROJ / YYYYMMDD / 2 位 / 从 1 起）的服务 */
    private BizSeqService serviceWithRule(Integer currentSeq) {
        return serviceWith(rule(RULE_KEY, "PROJ", "YYYYMMDD", 2, 1, 1), currentSeq);
    }

    private BizSeqService serviceWith(SysBizSeqRule rule, Integer currentSeq) {
        SysBizSeqRuleMapper ruleMapper = mock(SysBizSeqRuleMapper.class);
        when(ruleMapper.selectList(any())).thenReturn(rule == null ? List.of() : List.of(rule));
        BizSeqMapper seqMapper = mock(BizSeqMapper.class);
        when(seqMapper.selectCurrentValue(anyString(), anyString())).thenReturn(currentSeq);
        return new BizSeqService(seqMapper, ruleMapper);
    }

    private static SysBizSeqRule rule(String key, String prefix, String dateFormat,
                                      Integer seqLength, Integer seqStart, Integer status) {
        SysBizSeqRule r = new SysBizSeqRule();
        r.setRuleKey(key);
        r.setPrefix(prefix);
        r.setDateFormat(dateFormat);
        r.setSeqLength(seqLength);
        r.setSeqStart(seqStart);
        r.setStatus(status);
        return r;
    }

    @Test
    @DisplayName("形态：PROJ + YYYYMMDD + 2 位补零流水，当日首号为 01")
    void generatesProjPlusDatePlusTwoDigitSeq() {
        assertEquals("PROJ2026101901", serviceWithRule(1).next(RULE_KEY, DAY));
        assertEquals("PROJ2026101902", serviceWithRule(2).next(RULE_KEY, DAY));
        assertEquals("PROJ2026101909", serviceWithRule(9).next(RULE_KEY, DAY),
                "个位数必须左补零，否则编号长度不齐、排序也会错");
    }

    @Test
    @DisplayName("超 99 自然扩位为 100，不截断也不循环复用（截断会撞 uk_project_no）")
    void expandsBeyond99WithoutTruncation() {
        assertEquals("PROJ2026101999", serviceWithRule(99).next(RULE_KEY, DAY));
        String hundredth = serviceWithRule(100).next(RULE_KEY, DAY);
        assertEquals("PROJ20261019100", hundredth);
        assertEquals(15, hundredth.length(), "扩位后长度自然增长，不得回绕成 00");
        assertTrue(hundredth.endsWith("100"), "不得截断成两位: " + hundredth);
    }

    @Test
    @DisplayName("每日从 01 重置：序号键含日期段，跨日即换键（不是全局连号）")
    void resetsPerDayViaDateScopedSeqKey() {
        BizSeqService service = serviceWithRule(1);
        assertEquals("PROJ2026101901", service.next(RULE_KEY, DAY));
        assertEquals("PROJ2026102001", service.next(RULE_KEY, DAY.plusDays(1)),
                "次日必须重新从 01 起，且日期段跟随");

        // 直接钉住序号键：initSeq/increaseSeq 的 dateKey 就是日期段，这正是「按日重置」的实现依据
        BizSeqMapper seqMapper = mock(BizSeqMapper.class);
        when(seqMapper.selectCurrentValue(anyString(), anyString())).thenReturn(1);
        SysBizSeqRuleMapper ruleMapper = mock(SysBizSeqRuleMapper.class);
        when(ruleMapper.selectList(any())).thenReturn(List.of(rule(RULE_KEY, "PROJ", "YYYYMMDD", 2, 1, 1)));
        new BizSeqService(seqMapper, ruleMapper).next(RULE_KEY, DAY);
        verify(seqMapper).initSeq(eq("PROJ"), eq("20261019"));
        verify(seqMapper).increaseSeq(eq("PROJ"), eq("20261019"));
    }

    @Test
    @DisplayName("seq_start=0 时表内从 1 计数、编号从 00 起（既有口径不被本次改动破坏）")
    void honoursSeqStartZeroConvention() {
        // 本项目 rdm_project 用 seq_start=1，但 BizSeqService 还服务其它 seq_start=0 的规则，
        // 改项目编号规则不能顺带改掉这条全局约定
        assertEquals("PROJ2026101900",
                serviceWith(rule(RULE_KEY, "PROJ", "YYYYMMDD", 2, 0, 1), 1).next(RULE_KEY, DAY));
    }

    @Test
    @DisplayName("fail-closed：规则行缺失或停用时抛错，绝不回落到旧前缀 PJ 或别处发号")
    void failsClosedWhenRuleMissingOrDisabled() {
        BusinessException missing = assertThrows(BusinessException.class,
                () -> serviceWith(null, 1).next(RULE_KEY, DAY));
        assertTrue(missing.getMessage().contains(RULE_KEY), "报错应带规则 key 便于定位: " + missing.getMessage());

        assertThrows(BusinessException.class,
                () -> serviceWith(rule(RULE_KEY, "PROJ", "YYYYMMDD", 2, 1, 0), 1).next(RULE_KEY, DAY),
                "status=0（停用）必须拒发，不能静默用停用规则发号");
    }

    @Test
    @DisplayName("日期段粒度由规则行决定：改成 YYYYMM 即按月重置（证明格式确实由配置驱动）")
    void dateFormatDrivesResetGranularity() {
        assertEquals("PROJ20261001",
                serviceWith(rule(RULE_KEY, "PROJ", "YYYYMM", 2, 1, 1), 1).next(RULE_KEY, DAY),
                "同一份代码按规则行的 date_format 产出不同日期段，证明发号形态确实由配置驱动");
    }
}
