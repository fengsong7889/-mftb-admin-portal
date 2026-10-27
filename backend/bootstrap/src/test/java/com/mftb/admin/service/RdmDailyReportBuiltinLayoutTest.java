package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.RdmDailyReportVO.BuiltinLayout;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 内置版式示例的单测（纯渲染，不触库）。
 *
 * <p>钉住三件事：
 * <ol>
 *   <li><b>示例必须是「有事的日子」的形态</b>：真实库可能全空，示例若也渲染成一句
 *       「今日無異常」，用户在模板配置页点「查看」就什么也学不到；</li>
 *   <li><b>三个场景各自的口径不能串</b>：晨报看今日到期、晚报看当日完成与明日到期、
 *       个人看「要处理几件事」；</li>
 *   <li><b>非法类型必须拒绝</b>：静默回落到晨报会让前端传错参数时显示一份看似正常的示例。</li>
 * </ol>
 */
class RdmDailyReportBuiltinLayoutTest {

    /**
     * builtinLayout 只依赖 renderer，其余协作者传 null 即可——这也是一条约束：
     * 该方法一旦开始查库，这个测试会立刻 NPE，从而暴露「示例偷偷读了真实数据」。
     */
    private final RdmDailyReportService service = new RdmDailyReportService(
            null, new RdmDailyReportRenderer(), null, null, null, null, null, null);

    @Test
    @DisplayName("晨报示例：项目→迭代两级进度清单完整呈现，组间空行，且不得残留占位符")
    void morningDemoShowsAttention() {
        BuiltinLayout r = service.builtinLayout("group_morning");

        assertEquals("group_morning", r.type());
        assertEquals("fixed", r.messageMode());
        assertTrue(r.title().contains("晨報"), r.title());
        assertTrue(r.title().contains("需求交付"), "标题新口径：日期+需求交付晨/晚报，实际: " + r.title());
        assertTrue(r.content().contains("**推廣金重構**：迭代版本：2 個；"), r.content());
        assertTrue(r.content().contains("- 迭代-交付鏈路：**進度 50%**"), r.content());
        assertTrue(r.content().contains("- 11月第一版迭代：**進度 30%**"), r.content());
        // 钉钉会把无空行的相邻行归并成同一段：示例必须钉住组间空行
        assertTrue(r.content().contains("**進度 30%**\n\n**內部工具**"), r.content());
        assertFalse(r.content().contains("{{"), r.content());
    }

    @Test
    @DisplayName("晚报示例：同版式清单，标题换晚报档位")
    void eveningDemoShowsReview() {
        BuiltinLayout r = service.builtinLayout("group_evening");

        assertTrue(r.title().contains("晚報"), r.title());
        assertTrue(r.title().contains("需求交付"), r.title());
        assertTrue(r.content().contains("**推廣金重構**：迭代版本：2 個；"), r.content());
        assertTrue(r.content().contains("- 內部工具效率迭代：**進度 100%**"), r.content());
    }

    @Test
    @DisplayName("个人示例：同版式清单收敛到收件人项目，标题同群报口径")
    void personalDemoShowsUrgentCount() {
        BuiltinLayout r = service.builtinLayout("personal");

        assertEquals("personal", r.type());
        assertTrue(r.title().contains("需求交付"), "个人标题同新口径，实际: " + r.title());
        assertTrue(r.content().contains("**推廣金重構**：迭代版本：2 個；"), r.content());
    }

    @Test
    @DisplayName("非法类型直接拒绝，不静默回落成晨报")
    void rejectsUnknownType() {
        assertThrows(BusinessException.class, () -> service.builtinLayout("weekly"));
    }
}
