package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.entity.RdmRequirement;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 提交侧合并视图（本人提交的 ∪ 待本人審批的）的数据范围测试。
 *
 * <p>为什么单独测这两段：「提需求」菜单原先只有 approving 一个切片，提出人看不到自己提的单，
 * 已改成一条 OR 并集。这条并集是「谁能看到哪些需求」在提交侧的唯一 SQL 层防线 ——
 * 前端删掉视图栏不改变可见范围，服务端拼错条件（漏了提出人那一半、或退化成 relatedOnly 的
 * 四字段并集）都不会报错，只会让用户看到一批不属于他的单。
 *
 * <p>本测试不连数据库：{@code applySubmitterUnion} 是纯函数，直接断言生成的 SQL 片段。
 */
class RdmIntakeUnionScopeTest {

    private static final Long ME = 41L;

    /**
     * LambdaQueryWrapper 解析「方法引用 → 列名」依赖 MyBatis-Plus 的 TableInfo 缓存，
     * 没有 Spring 容器时该缓存是空的，getSqlSegment() 会抛
     * 「can not find lambda cache for this entity」。这里按仓库既有做法手动初始化。
     */
    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), RdmRequirement.class);
    }

    @Test
    @DisplayName("有限视角：一条 OR 同时接住本人提交与审批待办，两个字段都在")
    void restrictedUnionKeepsBothHalves() {
        LambdaQueryWrapper<RdmRequirement> wrapper = new LambdaQueryWrapper<>();
        RdmRequirementServiceImpl.applySubmitterUnion(wrapper, ME, List.of(7L, 8L));

        String sql = wrapper.getSqlSegment();
        assertTrue(sql.contains("submitter_user_id"), "漏了提出人那一半，用户就看不到自己提的单。SQL: " + sql);
        assertTrue(sql.contains("id IN"), "漏了审批待办那一半，就退回成原来的 approving 单切片。SQL: " + sql);
        assertTrue(sql.contains(" OR "), "两半必须是 OR，用 AND 会把并集收成空集。SQL: " + sql);
    }

    @Test
    @DisplayName("无审批待办：退化成「本人提交的」，不能因为集合空就放开全量")
    void emptyTodoFallsBackToSubmitterOnly() {
        LambdaQueryWrapper<RdmRequirement> wrapper = new LambdaQueryWrapper<>();
        RdmRequirementServiceImpl.applySubmitterUnion(wrapper, ME, List.of());

        String sql = wrapper.getSqlSegment();
        assertTrue(sql.contains("submitter_user_id"), "空待办也要按提出人收敛。SQL: " + sql);
        assertFalse(sql.contains("id IN"), "空集合做 IN 会渲染成 IN () 直接语法报错。SQL: " + sql);
    }

    /**
     * 未登录路径：{@code scopeUserId} 用 -1 兜底而不是 null，条件仍要落到 SQL 上。
     * <p>这是 fail-closed 的关键一条 —— 「不加条件」等于把全公司需求放给一个没有身份的连接。
     * <p>待办集合同时为空是真实组合：{@code approvingRequirementIds(null)} 就是返回空集，
     * 所以本例走的是「只按提出人收敛」那条分支，-1 不命中任何人 → 空列表。
     */
    @Test
    @DisplayName("未登录（-1 兜底 + 无待办）仍加提出人条件，结果收敛为空集而不是全量")
    void unauthenticatedSentinelStillNarrows() {
        LambdaQueryWrapper<RdmRequirement> wrapper = new LambdaQueryWrapper<>();
        RdmRequirementServiceImpl.applySubmitterUnion(wrapper, -1L, List.of());

        String sql = wrapper.getSqlSegment();
        assertTrue(sql.contains("submitter_user_id"), "无身份也必须带人员条件。SQL: " + sql);
        assertTrue(wrapper.getParamNameValuePairs().containsValue(-1L),
                "-1 必须真的绑进参数，否则收敛为空集是靠不上 SQL 的。params: " + wrapper.getParamNameValuePairs());
    }

    /**
     * 持分配权的人（canSeeAll）在本视角也不拿全量。
     * <p>钉住这条是因为它与其他视角的 null=不受限约定故意不同：合并前本菜单给他们的
     * 就只有其 OA 待办，并集也不能把它变成全公司需求（要全量请走需求管理）。
     */
    @Test
    @DisplayName("有限视角的 SQL 不因管理视角而丢掉人员条件（本视角永远按本人收敛）")
    void unionAlwaysBindsSubmitterEvenForPrivilegedCaller() {
        LambdaQueryWrapper<RdmRequirement> wrapper = new LambdaQueryWrapper<>();
        // 服务层对 canSeeAll 也传真实 id（selfUserId），而不像其他视角传 null
        RdmRequirementServiceImpl.applySubmitterUnion(wrapper, ME, List.of(7L));

        String sql = wrapper.getSqlSegment();
        assertTrue(sql.contains("submitter_user_id"),
                "本视角没有「不加人员条件」的分支。SQL: " + sql);
        assertTrue(sql.contains("id IN"), "同时要带上该我审的那半。SQL: " + sql);
    }

    @Test
    @DisplayName("计数去重：本人提交的单同时是该我审的，只能算一条")
    void unionCountDeduplicatesSelfApprovedRows() {
        Set<Long> mineIds = new LinkedHashSet<>(List.of(7L, 9L));

        assertEquals(3L, RdmRequirementServiceImpl.mergeUnionCount(2L, mineIds, List.of(7L, 8L)),
                "2 条本人提交 + 待办里的 8（7 已在本人提交里，不能重复计）");
        assertEquals(2L, RdmRequirementServiceImpl.mergeUnionCount(2L, mineIds, List.of()),
                "没有待办时就是本人提交数");
        assertEquals(2L, RdmRequirementServiceImpl.mergeUnionCount(2L, mineIds, null));
    }
}
