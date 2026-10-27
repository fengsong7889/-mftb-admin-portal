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
    @DisplayName("晨报示例：风险项目 + 异常迭代都要出现，且不得残留占位符")
    void morningDemoShowsAttention() {
        BuiltinLayout r = service.builtinLayout("group_morning");

        assertEquals("group_morning", r.type());
        assertEquals("fixed", r.messageMode());
        assertTrue(r.title().contains("晨報"), r.title());
        assertTrue(r.content().contains("推廣金重構"), r.content());
        assertTrue(r.content().contains("需關注"), r.content());
        assertTrue(r.content().contains("逾期"), r.content());
        assertFalse(r.content().contains("{{"), r.content());
    }

    @Test
    @DisplayName("晚报示例：展示当日完成与明日到期，而不是晨报的今日到期口径")
    void eveningDemoShowsReview() {
        BuiltinLayout r = service.builtinLayout("group_evening");

        assertTrue(r.title().contains("晚報"), r.title());
        assertTrue(r.content().contains("今日完成 5 項"), r.content());
    }

    @Test
    @DisplayName("个人示例：结论是「你有 3 項要處理」（1 逾期 + 2 今日到期）")
    void personalDemoShowsUrgentCount() {
        BuiltinLayout r = service.builtinLayout("personal");

        assertEquals("personal", r.type());
        assertTrue(r.title().contains("你有 3 項要處理"), r.title());
        assertTrue(r.content().contains("今天有 3 項交付要處理"), r.content());
    }

    @Test
    @DisplayName("非法类型直接拒绝，不静默回落成晨报")
    void rejectsUnknownType() {
        assertThrows(BusinessException.class, () -> service.builtinLayout("weekly"));
    }
}
