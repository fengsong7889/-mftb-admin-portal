package com.mftb.admin.dto;

import com.mftb.admin.entity.HrPerfIndicator;
import com.mftb.admin.entity.HrPerfTemplate;
import lombok.Data;
import org.springframework.beans.BeanUtils;

import java.math.BigDecimal;
import java.util.List;

/** 考核模板视图（含等级方案与指标清单） */
@Data
public class HrPerfTemplateVO {

    private Long id;
    private String name;
    private String applyCycleType;
    /** 等级方案 JSON：[{code,minScore,ratio}] */
    private String gradeScheme;
    private Integer weightSum;
    private Integer status;
    private String remark;
    private List<IndicatorVO> indicators;

    public static HrPerfTemplateVO from(HrPerfTemplate e, List<HrPerfIndicator> items) {
        HrPerfTemplateVO vo = new HrPerfTemplateVO();
        BeanUtils.copyProperties(e, vo);
        vo.setIndicators(items == null ? List.of() : items.stream().map(IndicatorVO::from).toList());
        return vo;
    }

    /** 指标视图 */
    @Data
    public static class IndicatorVO {
        private Long id;
        private String name;
        private String indicatorType;
        private BigDecimal weight;
        private String targetDesc;
        private String scoringDesc;
        private Integer sortOrder;

        public static IndicatorVO from(HrPerfIndicator e) {
            IndicatorVO vo = new IndicatorVO();
            BeanUtils.copyProperties(e, vo);
            return vo;
        }
    }
}
