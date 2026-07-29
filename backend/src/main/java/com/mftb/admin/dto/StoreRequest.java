package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 门店新增/编辑请求
 * <p>
 * 门店ID（store_code）由系统按 MD+5位序号自增生成，不接受前端传入
 */
@Data
public class StoreRequest {

    @NotNull(message = "所属集团不能为空")
    private Long groupId;

    @NotBlank(message = "门店名称不能为空")
    private String storeName;

    /** 所属品牌 */
    private String brand;

    /** 业务频道 */
    private String bizChannel;

    /** 登录主账号 */
    private String loginAccount;
}
