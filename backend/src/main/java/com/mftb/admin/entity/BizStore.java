package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 门店实体
 */
@Data
@TableName("biz_store")
public class BizStore {

    @TableId
    private Long id;

    /** 所属集团ID */
    private Long groupId;

    /** 门店ID（如 S1001） */
    private String storeCode;

    /** 门店名称 */
    private String storeName;

    /** 所属品牌: flashBee / mFood / flashBee,mFood */
    private String brand;

    /** 业务频道 */
    private String bizChannel;

    /** 登录主账号 */
    private String loginAccount;

    /** 最后更新人 */
    private String updatedBy;

    /** 逻辑删除 */
    @TableLogic
    private Integer deleted;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;
}
