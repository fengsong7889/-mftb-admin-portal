package com.mftb.admin.dto;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Collection;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 需求列表视角（scope）的数据范围口径测试。
 *
 * <p>为什么单独测 {@link RdmRequirementQuery}：视角收敛是「谁能看到哪些需求」的
 * 唯一 SQL 层防线，而 {@code applyScope} 的 switch 没有白名单 —— 未注册的新 scope
 * 会静默落到 default 分支变成「我提的需求」，界面看起来正常、数据却是错的。
 * 这类退化只有断言能拦住。
 *
 * <p>本测试不连数据库：{@code toWrapper} 是纯函数，直接断言生成的 SQL 片段与参数。
 */
class RdmRequirementQueryScopeTest {

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

    private RdmRequirementQuery withScope(String scope) {
        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setScope(scope);
        return query;
    }

    /**
     * 只取「视角自身的条件」，剥掉 relatedOnly 追加的那一段。
     * <p>必须剥：relatedOnly 是「提出人 OR 產品經理 OR 研發負責人 OR 驗收人」四字段并集，
     * 任何视角的完整 SQL 里都出现 acceptor_user_id。直接对整段做 contains 判断，
     * 「有没有按验收人收敛」这个断言会永远为真，等于没测。
     */
    private String scopeCondition(RdmRequirementQuery query, Long currentUserId) {
        String segment = query.toWrapper(currentUserId).getSqlSegment();
        int relatedTail = segment.indexOf(" AND (submitter_user_id");
        return relatedTail < 0 ? segment : segment.substring(0, relatedTail);
    }

    private Collection<Object> params(RdmRequirementQuery query, Long currentUserId) {
        var wrapper = query.toWrapper(currentUserId);
        // 必须先渲染一次 SQL 片段：MyBatis-Plus 的 eq() 把值注册放在 supplier 里延迟执行，
        // 不调 getSqlSegment() 的话 paramNameValuePairs 是空的，contains 断言会永远为 false。
        wrapper.getSqlSegment();
        return wrapper.getParamNameValuePairs().values();
    }

    @Test
    @DisplayName("上线后待评分：按验收人字段收敛，且只捞 released")
    void acceptancePostIsAcceptorBoundAndReleasedOnly() {
        RdmRequirementQuery query = withScope(RdmConstants.SCOPE_ACCEPTANCE_POST);
        String condition = scopeCondition(query, ME);

        assertTrue(condition.contains("acceptor_user_id"),
                "必须按验收人收敛，否则提单人会在「待我验收」里看到一堆自己签不了的单");
        assertTrue(condition.contains("status ="), "该视角是单一状态，不是 in");
        assertTrue(params(query, ME).contains(RdmConstants.STATUS_RELEASED));
        assertFalse(params(query, ME).contains(RdmConstants.STATUS_UAT_PENDING),
                "预验收与上线后验收是两件事实，队列不能混");
    }

    @Test
    @DisplayName("我的验收记录：多状态 in，含已上线待评分/已确认交付/预验收退回")
    void acceptanceHistoryCoversSignedStatuses() {
        RdmRequirementQuery query = withScope(RdmConstants.SCOPE_ACCEPTANCE_HISTORY);
        String condition = scopeCondition(query, ME);
        Collection<Object> values = params(query, ME);

        assertTrue(condition.contains("acceptor_user_id"));
        assertTrue(condition.contains("status IN ("), "记录页是多状态 in");
        assertTrue(values.contains(RdmConstants.STATUS_RELEASED),
                "上线后验收通过时状态仍是 released（只写结论不改状态），漏掉它刚签完的人在自己记录里找不到单");
        assertTrue(values.contains(RdmConstants.STATUS_VERIFIED));
        assertTrue(values.contains(RdmConstants.STATUS_UAT_REJECTED));
    }

    @Test
    @DisplayName("管理视角（currentUserId=null）不加人员条件，但状态口径照旧生效")
    void unrestrictedViewDropsPersonFilterOnly() {
        RdmRequirementQuery query = withScope(RdmConstants.SCOPE_ACCEPTANCE_POST);
        String condition = scopeCondition(query, null);

        assertFalse(condition.contains("acceptor_user_id"), "管理视角不该再被验收人字段限制");
        assertTrue(condition.contains("status ="), "状态口径对管理视角同样生效");
        assertTrue(params(query, null).contains(RdmConstants.STATUS_RELEASED));
    }

    @Test
    @DisplayName("未注册的 scope 静默退化成「我提的需求」——新增视角必须在本文件登记断言")
    void unknownScopeSilentlyFallsBackToMine() {
        RdmRequirementQuery query = withScope("acceptance_post_typo");
        String condition = scopeCondition(query, ME);

        // 记录既有行为：switch 的 default 分支按提出人收敛，不报错也不告警。
        // 所以每加一个 scope 都必须在这里补一条断言，否则漏登记只会以「数据不对」的形式暴露。
        assertTrue(condition.contains("submitter_user_id"), "未注册视角会落到 default（按提出人）");
        assertFalse(condition.contains("acceptor_user_id"));
        assertFalse(condition.contains("status"), "default 分支不带状态条件");
    }

    @Test
    @DisplayName("上线前预验收口径保持不变：只按状态收敛，不叠加验收人字段")
    void preReleaseAcceptanceScopeUnchanged() {
        RdmRequirementQuery query = withScope(RdmConstants.SCOPE_ACCEPTANCE);
        String condition = scopeCondition(query, ME);

        assertTrue(condition.contains("status ="));
        assertFalse(condition.contains("acceptor_user_id"),
                "该视角历史口径是「与我相关且 uat_pending」；改成按验收人收敛会缩小存量用户能看到的范围");
        assertTrue(params(query, ME).contains(RdmConstants.STATUS_UAT_PENDING));
    }

    /**
     * 治理侧「全部」只看已准入需求（需求提交/需求管理拆分 · 批次 1）。
     * <p>这是「审批中/被驳回/草稿不得出现在需求管理」的唯一 SQL 层防线：前端隐藏不是边界，
     * 改 URL 或直连 API 传 scope=all 就能绕过。同时它也保证治理侧每一行都有正式需求编号。
     * <p>为何断言 `status <> ?` 而不是 `status NOT IN`：`notIn(column, Set)` 在本项目的
     * MyBatis-Plus 版本上会渲染成 `status NOT IN ()`（零占位符、参数表也不绑定这三个值），
     * MySQL 直接语法报错；所以实现改用逐个 ne，本测试也随之把「三个排除条件 + 三个参数都到位」
     * 当成硬断言 —— 只验状态名出现在参数里、不验 SQL 形状的话，空 IN 召回这种错会溜过去。
     */
    @Test
    @DisplayName("治理侧全部：逐条排除草稿/待审批/审批驳回三类准入前状态")
    void managementAllExcludesPreAdmissionStatuses() {
        RdmRequirementQuery query = withScope(RdmConstants.SCOPE_ALL);
        String condition = scopeCondition(query, ME);
        Collection<Object> values = params(query, ME);

        long exclusionCount = condition.split("status <> ", -1).length - 1;
        assertTrue(exclusionCount >= 3,
                "三个准入前状态必须各有一条排除条件，否则未准入需求会泄露到需求管理/看板/计数/导出。SQL: " + condition);
        assertTrue(values.contains(RdmConstants.STATUS_DRAFT),
                "排除集合未绑定到 SQL 参数上（空 IN/NOT IN 会直接报错）。SQL: " + condition + " | params: " + values);
        assertTrue(values.contains(RdmConstants.STATUS_INTAKE_PENDING),
                "排除集合未绑定到 SQL 参数上。SQL: " + condition + " | params: " + values);
        assertTrue(values.contains(RdmConstants.STATUS_INTAKE_REJECTED),
                "排除集合未绑定到 SQL 参数上。SQL: " + condition + " | params: " + values);
    }

    /**
     * 管理视角（currentUserId=null，仅 PMO/超管）也不能因此拿到准入前需求：
     * 不收人员条件不等于不收状态口径，否则未发号的行会进入需求管理。
     */
    @Test
    @DisplayName("治理侧全部对管理视角同样收口：无人员条件但保留准入状态排除")
    void managementAllStillExcludesPreAdmissionForUnrestrictedUser() {
        RdmRequirementQuery query = withScope(RdmConstants.SCOPE_ALL);
        String condition = scopeCondition(query, null);

        assertTrue(condition.contains("status <> "),
                "准入口径对管理视角同样生效（不受人员条件收敛影响）。SQL: " + condition);
        assertFalse(condition.contains("submitter_user_id"), "管理视角不该被提出人字段限制");
    }

    /**
     * 「处理中」不再包含待审批：待审批是提交侧的审批待办，处理人是审批人，
     * 不在 PM/验收人/研发负责人三个执行字段上；继续列进去会让计数与需求管理口径对不上。
     */
    @Test
    @DisplayName("处理中队列：不含待审批，只含已准入的执行中状态")
    void todoExcludesIntakePending() {
        RdmRequirementQuery query = withScope(RdmConstants.SCOPE_TODO);
        String condition = scopeCondition(query, ME);
        Collection<Object> values = params(query, ME);

        assertTrue(condition.contains("status IN ("));
        assertFalse(values.contains(RdmConstants.STATUS_INTAKE_PENDING),
                "待审批属提交侧，不得出现在治理侧的处理中队列");
        assertTrue(values.contains(RdmConstants.STATUS_POOL));
        assertTrue(values.contains(RdmConstants.STATUS_ASSIGNED));
        assertTrue(values.contains(RdmConstants.STATUS_UAT_PENDING));
    }
}
