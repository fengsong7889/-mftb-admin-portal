package com.mftb.admin.dto;

import com.mftb.admin.entity.HrOffboardingTask;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 离职联动任务视图。
 * <p>{@code lastError} 必须一路带到界面：它既可能是失败原因，也可能是「还没指定交接接收人」
 * 这类等待说明 —— 少了它，HR 只看到一个红色状态却不知道要做什么。
 */
@Data
public class HrOffboardingTaskVO {

    private Long id;
    private Long requestId;
    private String reqNo;
    private Long userId;
    private String empNo;
    private String taskType;
    private String status;
    private Integer attempts;
    private String lastError;
    private String resultSummary;
    private String targetRef;
    private LocalDate effectiveDate;
    private LocalDateTime updatedAt;

    public static HrOffboardingTaskVO from(HrOffboardingTask entity) {
        if (entity == null) {
            return null;
        }
        HrOffboardingTaskVO vo = new HrOffboardingTaskVO();
        vo.setId(entity.getId());
        vo.setRequestId(entity.getRequestId());
        vo.setReqNo(entity.getReqNo());
        vo.setUserId(entity.getUserId());
        vo.setEmpNo(entity.getEmpNo());
        vo.setTaskType(entity.getTaskType());
        vo.setStatus(entity.getStatus());
        vo.setAttempts(entity.getAttempts());
        vo.setLastError(entity.getLastError());
        vo.setResultSummary(entity.getResultSummary());
        vo.setTargetRef(entity.getTargetRef());
        vo.setEffectiveDate(entity.getEffectiveDate());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
