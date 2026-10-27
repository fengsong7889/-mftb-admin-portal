package com.mftb.admin.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 指定离职交接接收人请求。
 * <p>只有 userId：接收人姓名由服务端按 id 反查后落快照，不接受前端传姓名 ——
 * 否则「显示的名字」与「真正拿到资产的人」可能不是同一个人。
 */
@Data
public class HrOffboardingReceiverRequest {

    /** 接收人 sys_user.id（必须在操作者的组织数据范围内，服务端逐个校验） */
    @NotNull(message = "請選擇交接接收人")
    private Long receiverUserId;
}
