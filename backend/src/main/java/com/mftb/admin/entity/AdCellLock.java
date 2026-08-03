package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 无敌星星格子加购锁实体（商家加购后锁定 60 秒，其它商家看到已售罄）
 */
@Data
@TableName("biz_ad_cell_lock")
public class AdCellLock {

    @TableId
    private Long id;

    /** 关联算法ID（biz_ad_algorithm.id） */
    private Long algoId;

    /** 投放日期 */
    private LocalDate bizDate;

    /** 商圈 */
    private Integer region;

    /** 餐段时段: breakfast/lunch/afternoon/dinner/supper */
    private String mealSlot;

    /** 锁定商家集团编码 */
    private String groupCode;

    /** 锁定门店编码 */
    private String storeCode;

    /** 锁释放时间（加购时间 + 60 秒） */
    private LocalDateTime expireAt;

    /** 创建时间 */
    private LocalDateTime createdAt;
}
