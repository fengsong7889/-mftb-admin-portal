package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 商户集团新增/编辑请求
 * <p>
 * 集团ID（group_code）由系统按 JT+6位序号自增生成，不接受前端传入
 */
@Data
public class MerchantGroupRequest {

    @NotBlank(message = "集团名称不能为空")
    private String groupName;

    /** 登录主账号 */
    private String loginAccount;
}
