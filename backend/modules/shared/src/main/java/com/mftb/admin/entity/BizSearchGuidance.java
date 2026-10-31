package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 搜索引导配置实体（方案 §11.1「搜索引导配置」）。
 * <p>管理底纹词/自然热搜/推广搜索/候选热词。付费推广词与自然热搜分区，禁止用付款修改自然热度数值；
 * 底纹词仅作提示、点击推荐词才提交搜索，不支持任意外链跳转。
 */
@Data
@TableName("biz_search_guidance")
public class BizSearchGuidance {

    @TableId
    private Long id;

    /** 配置编号（BizSeqService 取号， interim 由服务层生成） */
    private String configNo;

    /** 配置名称（人类可读标识，方案 §11.1 定版的权威业务字段；服务层强制必填且 ≤60 字） */
    private String configName;

    /** 类型: 1=底纹词 2=自然热搜 3=推广搜索 4=候选热词 */
    private Integer wordType;

    /** 展示词 */
    private String displayText;

    /** 点击后提交的搜索词 */
    private String targetQuery;

    /** APP 所属品牌: flashBee/mFood */
    private String brand;

    /** 场景: 1=首页 2=频道 3=店内 */
    private Integer surface;

    /** 业务频道: 1=美食外卖 2=超市百货 3=团购到店 */
    private Integer bizChannel;

    /** 区域编码（空=全城） */
    private String regionCode;

    /** 展示次序 1-20 */
    private Integer priority;

    /** 来源: 1=人工策划 2=去重搜索趋势 3=商业计划 */
    private Integer source;

    private LocalDate startDate;

    private LocalDate endDate;

    /** 审批: 1=未审批 2=已审批 3=驳回 */
    private Integer approvalStatus;

    /** 服务状态: 1=启用 2=停用 */
    private Integer status;

    private String remark;

    private String createdBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    private String updatedBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
