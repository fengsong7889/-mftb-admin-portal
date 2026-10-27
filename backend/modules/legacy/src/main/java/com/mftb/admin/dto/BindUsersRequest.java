package com.mftb.admin.dto;

import lombok.Data;

import java.util.List;

/**
 * 角色绑定账号请求
 */
@Data
public class BindUsersRequest {

    /** 绑定该角色的用户ID全量列表 (未包含的用户将解绑) */
    private List<Long> userIds;
}
