package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 编号生成规则配置实体（对应「规则配置 > 编号生成规则」菜单）
 * 后端所有业务编号（ID/订单号/批次号等）均按本表规则生成
 */
@Data
@TableName("sys_biz_seq_rule")
public class SysBizSeqRule {

    @TableId
    private Long id;

    /** 规则唯一标识（与前端 key 一致，如 ad_order_star） */
    private String ruleKey;

    /** 业务类型名称（如 無敵星星訂單） */
    private String ruleName;

    /** 所属菜单（如 廣告銷售） */
    private String bizMenu;

    /** 编号前缀（如 DDWD） */
    private String prefix;

    /** 日期格式: YYYYMMDD / YYMM / 空串=无日期维度 */
    private String dateFormat;

    /** 自增序号位数（如 4 → 0000~9999） */
    private Integer seqLength;

    /** 序号起始: 0=从0000起 1=从0001起 */
    private Integer seqStart;

    /** 备注 */
    private String remark;

    /** 状态: 1=启用 0=停用 */
    private Integer status;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
