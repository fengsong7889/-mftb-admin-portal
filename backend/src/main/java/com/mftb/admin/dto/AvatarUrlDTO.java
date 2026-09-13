package com.mftb.admin.dto;

import lombok.Data;

/**
 * 在线头像 URL 保存请求体
 */
@Data
public class AvatarUrlDTO {

    /** 头像 URL（IconFont 等外部地址） */
    private String avatarUrl;
}
