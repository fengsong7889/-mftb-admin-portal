/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.support;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.AdAlgorithmQuery;
import com.mftb.admin.entity.AdAlgorithm;
import org.springframework.util.StringUtils;

import java.util.Objects;

/** 只使用固定 JSON 路径和绑定参数，目标／业务筛选必须在 SQL 分页之前执行。 */
public final class AdStarAlgorithmQuerySupport {
    private static final String SAFE_PARAMS = "(CASE WHEN JSON_VALID(params) THEN params ELSE JSON_OBJECT() END)";
    private static final String HAS_SCOPE = "JSON_CONTAINS_PATH(" + SAFE_PARAMS + ", 'one', '$.schemaVersion', '$.targetType')";
    private static final String TARGET = "JSON_UNQUOTE(JSON_EXTRACT(" + SAFE_PARAMS + ", '$.targetType'))";
    private static final String BUSINESSES = "JSON_EXTRACT(" + SAFE_PARAMS + ", '$.applicableBusinessTypes')";
    private static final int LEGACY_GROUP_BUY_CHANNEL = 4;
    private AdStarAlgorithmQuerySupport() { }

    public static void apply(LambdaQueryWrapper<AdAlgorithm> wrapper, AdAlgorithmQuery query) {
        Integer target = query.getTargetType();
        Integer business = query.getBusinessType();
        if (target != null && target != AdStarAlgorithmParams.STORE && target != AdStarAlgorithmParams.PRODUCT) throw invalid();
        if (business != null && business != 1 && business != AdStarAlgorithmParams.GROUP_BUY_BUSINESS) throw invalid();
        if (Objects.equals(target, AdStarAlgorithmParams.PRODUCT)) {
            if (!Objects.equals(query.getAlgoType(), AdStarAlgorithmParams.ALGORITHM_TYPE)
                    || !Objects.equals(business, AdStarAlgorithmParams.GROUP_BUY_BUSINESS)
                    || StringUtils.hasText(query.getStoreCode()) || Boolean.TRUE.equals(query.getHasPricing())
                    || query.getPricingChannel() != null) throw invalid();
            wrapper.eq(AdAlgorithm::getAlgoType, AdStarAlgorithmParams.ALGORITHM_TYPE).apply(TARGET + " = {0}", "2");
        } else {
            // 所有旧下拉默认排除商品，不能靠前端记得传 targetType 才保护。
            wrapper.and(w -> w.ne(AdAlgorithm::getAlgoType, AdStarAlgorithmParams.ALGORITHM_TYPE)
                    .or().apply(HAS_SCOPE + " = 0")
                    .or().apply(TARGET + " = {0}", "1"));
        }
        if (business != null) {
            wrapper.and(w -> {
                w.nested(versioned -> versioned.eq(AdAlgorithm::getAlgoType, AdStarAlgorithmParams.ALGORITHM_TYPE)
                        .apply(HAS_SCOPE + " = 1")
                        .apply("JSON_CONTAINS(" + BUSINESSES + ", {0}) = 1", String.valueOf(business)));
                w.or(legacy -> {
                    legacy.and(noScope -> noScope.ne(AdAlgorithm::getAlgoType, AdStarAlgorithmParams.ALGORITHM_TYPE)
                            .or().apply(HAS_SCOPE + " = 0"));
                    if (business == AdStarAlgorithmParams.GROUP_BUY_BUSINESS) legacy.eq(AdAlgorithm::getChannel, LEGACY_GROUP_BUY_CHANNEL);
                    else legacy.and(ch -> ch.ne(AdAlgorithm::getChannel, LEGACY_GROUP_BUY_CHANNEL).or().isNull(AdAlgorithm::getChannel));
                });
            });
        }
        if (query.getUpdatedFrom() != null && query.getUpdatedTo() != null && query.getUpdatedFrom().isAfter(query.getUpdatedTo())) throw invalid();
        if (StringUtils.hasText(query.getCode())) wrapper.like(AdAlgorithm::getAlgoCode, query.getCode().trim());
        if (StringUtils.hasText(query.getName())) wrapper.like(AdAlgorithm::getAlgoName, query.getName().trim());
        if (StringUtils.hasText(query.getUpdatedBy())) wrapper.like(AdAlgorithm::getUpdatedBy, query.getUpdatedBy().trim());
        if (query.getUpdatedFrom() != null) wrapper.ge(AdAlgorithm::getUpdatedAt, query.getUpdatedFrom());
        if (query.getUpdatedTo() != null) wrapper.le(AdAlgorithm::getUpdatedAt, query.getUpdatedTo());
    }

    private static BusinessException invalid() { return new BusinessException(422, "算法查詢的業務範圍或推廣對象無效"); }
}
