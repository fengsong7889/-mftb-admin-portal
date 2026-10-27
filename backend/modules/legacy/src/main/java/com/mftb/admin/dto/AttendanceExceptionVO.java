package com.mftb.admin.dto;

import com.mftb.admin.entity.AttException;
import lombok.Data;

import java.time.LocalDate;

/**
 * 考勤异常视图（列表与处理页共用）。
 * <p>
 * {@code handledAt} 输出为字符串：全局 Jackson 把 LocalDateTime 序列化成毫秒时间戳，
 * 直接返回实体会让「處理時間」列显示一串数字。
 */
@Data
public class AttendanceExceptionVO {

    private Long id;
    private Long userId;
    private String empNo;
    private String empName;
    private Long deptId;
    private String deptName;
    private Long groupId;
    private String groupName;
    private LocalDate workDate;
    /** 1=遲到 2=早退 3=缺卡 4=曠工 5=未排班 */
    private Integer exceptionType;
    /** 引擎写入的量化描述（只读） */
    private String detail;
    private Integer lateMinutes;
    /** 1=待處理 2=已補卡 3=已請假抵扣 4=已加班抵扣 5=已確認 */
    private Integer status;
    private String flowNo;
    private Long oaRequestId;
    private String handler;
    private String handledAt;
    /** 处理说明（确认原因 / 补卡原因），与 detail 分列展示 */
    private String handleRemark;
    private String updatedAt;

    public static AttendanceExceptionVO of(AttException e) {
        AttendanceExceptionVO vo = new AttendanceExceptionVO();
        vo.setId(e.getId());
        vo.setUserId(e.getUserId());
        vo.setEmpNo(e.getEmpNo());
        vo.setEmpName(e.getEmpName());
        vo.setDeptId(e.getDeptId());
        vo.setDeptName(e.getDeptName());
        vo.setGroupId(e.getGroupId());
        vo.setGroupName(e.getGroupName());
        vo.setWorkDate(e.getWorkDate());
        vo.setExceptionType(e.getExceptionType());
        vo.setDetail(e.getDetail());
        vo.setLateMinutes(e.getLateMinutes());
        vo.setStatus(e.getStatus());
        vo.setFlowNo(e.getFlowNo());
        vo.setOaRequestId(e.getOaRequestId());
        vo.setHandler(e.getHandler());
        vo.setHandledAt(DateTimeFormats.of(e.getHandledAt()));
        vo.setHandleRemark(e.getHandleRemark());
        vo.setUpdatedAt(DateTimeFormats.of(e.getUpdatedAt()));
        return vo;
    }
}
