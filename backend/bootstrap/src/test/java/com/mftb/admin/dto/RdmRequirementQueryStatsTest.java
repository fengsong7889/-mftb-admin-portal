package com.mftb.admin.dto;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmRequirement;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 统计子指标与用户筛选的交集语义。
 *
 * <p>历史实现用「覆盖 status」的方式数待分配/待验收：用户筛了 evaluating 时，
 * 卡片仍按 pool / uat_pending 重新查一遍，数字不再是当前筛选结果的子集。
 * 现在改用服务端内部字段 statusScope，与用户的 status/statuses 取 AND。
 */
class RdmRequirementQueryStatsTest {

    @BeforeAll
    static void initTableInfo() {
        TableInfoHelper.initTableInfo(
                new MapperBuilderAssistant(new MybatisConfiguration(), ""), RdmRequirement.class);
    }

    @Test
    @DisplayName("statusScope 与精确 status 同时存在时取交集（筛 evaluating 时待分配必为 0）")
    void statusScopeIntersectsWithStatus() {
        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setScope(RdmConstants.SCOPE_ALL);
        query.setStatus(RdmConstants.STATUS_EVALUATING);
        query.setStatusScope(List.of(RdmConstants.STATUS_POOL));

        String sql = query.toWrapper(null).getSqlSegment();

        assertTrue(sql.contains("status ="), sql);
        assertTrue(sql.contains("status IN"), sql);
    }

    @Test
    @DisplayName("statusScope 与 statuses 集合同时存在时取交集，不覆盖用户选择")
    void statusScopeIntersectsWithStatuses() {
        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setScope(RdmConstants.SCOPE_ALL);
        query.setStatuses(List.of(RdmConstants.STATUS_ACCEPTED, RdmConstants.STATUS_PRD_DESIGNING));
        query.setStatusScope(List.of(RdmConstants.STATUS_UAT_PENDING));

        var wrapper = query.toWrapper(null);
        String sql = wrapper.getSqlSegment();
        wrapper.getParamNameValuePairs();

        // 两个 IN 条件并存，参数里同时保留用户集合与子指标集合
        assertTrue(sql.split("status IN", -1).length - 1 >= 2, sql);
        assertTrue(wrapper.getParamNameValuePairs().values().stream()
                .anyMatch(v -> String.valueOf(v).contains(RdmConstants.STATUS_ACCEPTED)));
        assertTrue(wrapper.getParamNameValuePairs().values().stream()
                .anyMatch(v -> String.valueOf(v).contains(RdmConstants.STATUS_UAT_PENDING)));
    }

    @Test
    @DisplayName("无 statusScope 时不改变原查询（普通列表不受影响）")
    void noStatusScopeKeepsSingleCondition() {
        RdmRequirementQuery query = new RdmRequirementQuery();
        query.setScope(RdmConstants.SCOPE_ALL);
        query.setStatus(RdmConstants.STATUS_TESTING);

        String sql = query.toWrapper(null).getSqlSegment();
        assertEquals(0, sql.split("status IN", -1).length - 1, sql);
        assertTrue(sql.contains("status ="), sql);
    }
}
