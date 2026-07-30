package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 推广金交易明细实体（充消对账报表由本表按集团按日聚合得出）
 */
@Data
@TableName("biz_fin_detail")
public class FinDetail {

    @TableId
    private Long id;

    /** 明细ID: MX + 年月日 + 4位自增 */
    private String detailId;

    /** 集团ID */
    private String groupCode;

    /** 集团名称 */
    private String groupName;

    /** 所属品牌 */
    private String brand;

    /** 门店ID（集团维度记 --） */
    private String storeCode;

    /** 门店名称 */
    private String storeName;

    /** 业务频道 */
    private String channel;

    /** 交易类型: 充值 / 扣款 / 消费 / 转入 / 转出 */
    private String tradeType;

    /** 变动类别: 充值 / 充值批次扣款 / 账户扣款 / 欠款偿还 / 转账转出(入) / 合并转出(入) / 消费类型枚举 */
    private String changeType;

    /** 交易时间 */
    private LocalDateTime tradeTime;

    /** 虚拟账户变动金额（+增 -减） */
    private BigDecimal virtualChange;

    /** 实收账户变动金额（NULL=不涉及，前端展示 --） */
    private BigDecimal actualChange;

    /** 关联批次号（扣款行为被扣减的批次） */
    private String batchNo;

    /** 流程编号 */
    private String flowNo;

    /** 所属BD */
    private String bd;

    /** 备注 */
    private String remark;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
