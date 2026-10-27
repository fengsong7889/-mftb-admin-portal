package com.mftb.admin.util;

import com.mftb.admin.dto.HrPerfTemplateSaveDTO;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 等级方案（grade_scheme JSON）的统一解析与映射口径。
 * <p>
 * 「得分→等级」这一件事在校验、审批下发、报表分布三处都要算，口径不一致就会出现
 * 「审批下发的等级和台账统计的等级不是同一个」这类无法解释的数据问题，故收敛于此。
 * <p>
 * 映射规则固定为：取「分值下限不超过该得分」的等级中下限最高的那个；无匹配则返回空，
 * 绝不因为分数低就套一个模板外的等级。等级方案按分值下限降序存储（S→D）。
 */
public final class HrPerfGradeUtils {

    private HrPerfGradeUtils() {
    }

    /** 解析等级方案；脏 JSON 或空值返回空列表而不是抛异常（报表不能因一条脏数据整页失败） */
    public static List<HrPerfTemplateSaveDTO.GradeRule> parse(String json) {
        List<HrPerfTemplateSaveDTO.GradeRule> grades =
                JsonUtils.parseList(json, HrPerfTemplateSaveDTO.GradeRule.class);
        return grades == null ? List.of() : grades;
    }

    /** 按分值下限降序（S→D），与模板存储口径一致 */
    public static List<HrPerfTemplateSaveDTO.GradeRule> sortedDesc(List<HrPerfTemplateSaveDTO.GradeRule> grades) {
        if (grades == null) {
            return List.of();
        }
        return grades.stream()
                .filter(g -> g != null && g.getMinScore() != null)
                .sorted(Comparator.comparingInt(HrPerfTemplateSaveDTO.GradeRule::getMinScore).reversed())
                .toList();
    }

    /** 得分对应等级；得分为空或低于最低下限时返回 null（不造等级） */
    public static String match(List<HrPerfTemplateSaveDTO.GradeRule> grades, BigDecimal score) {
        if (score == null) {
            return null;
        }
        return sortedDesc(grades).stream()
                .filter(g -> score.compareTo(BigDecimal.valueOf(g.getMinScore())) >= 0)
                .map(HrPerfTemplateSaveDTO.GradeRule::getCode)
                .filter(code -> code != null && !code.isBlank())
                .findFirst()
                .orElse(null);
    }

    /** 模板内合法等级 code 集合（改判时校验不得凭空造等级） */
    public static Set<String> codes(List<HrPerfTemplateSaveDTO.GradeRule> grades) {
        if (grades == null) {
            return Set.of();
        }
        return grades.stream().map(HrPerfTemplateSaveDTO.GradeRule::getCode)
                .filter(code -> code != null && !code.isBlank())
                .collect(Collectors.toSet());
    }
}
