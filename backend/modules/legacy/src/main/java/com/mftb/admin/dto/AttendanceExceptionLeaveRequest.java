package com.mftb.admin.dto;

import lombok.Data;

/**
 * 异常关联假单抵扣请求。
 * <p>
 * 只收假单 ID：假单的当事人、区间与审批状态一律由服务端回查校验，
 * 不接受前端传"已核准"或"区间"这类结论性字段——那是把安全校验交给客户端。
 */
@Data
public class AttendanceExceptionLeaveRequest {

    /** 请假单 ID（hr_leave_request.id） */
    private Long leaveId;
}
