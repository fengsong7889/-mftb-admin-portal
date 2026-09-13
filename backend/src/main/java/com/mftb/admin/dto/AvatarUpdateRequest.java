package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 头像更新请求
 */
@Data
public class AvatarUpdateRequest {

    /** 头像值（pikachu expression / dicebear URL / base64 Data URL） */
    @NotBlank(message = "頭像不能為空")
    private String avatar;
}
