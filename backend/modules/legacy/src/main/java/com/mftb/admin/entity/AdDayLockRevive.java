package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 盘活复苏加购锁实体（商家加购后锁定 60 秒，库存>1 时多商家可分别锁同一格子）
 */
@Data
@TableName("biz_ad_day_lock_revive")
public class AdDayLockRevive {

    @TableId
    private Long id;

    /** 关联算法ID（biz_ad_algorithm.id） */
    private Long algoId;

    /** 投放日期 */
    private LocalDate bizDate;

    /** 商圈 */
    private Integer region;

    /** 锁定商家集团编码 */
    private String groupCode;

    /** 锁定门店编码 */
    private String storeCode;

    /** 锁释放时间（加购时间 + 60 秒） */
    private LocalDateTime expireAt;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
