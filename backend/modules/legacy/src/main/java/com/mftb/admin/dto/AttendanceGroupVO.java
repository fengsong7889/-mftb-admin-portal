package com.mftb.admin.dto;

import com.mftb.admin.entity.AttGroup;
import lombok.Data;

import java.util.List;

/**
 * 考勤组列表/详情视图。
 * <p>
 * 名称类字段一律带快照（shiftName/groupName），列表页不再逐行回查班次表造成 N+1；
 * memberCount 只统计「当前生效」成员，历史期间不计入。
 */
@Data
public class AttendanceGroupVO {

    private Long id;

    private String groupNo;

    private String groupName;

    /** 1=固定班制 2=排班制 3=自由工時 */
    private Integer groupType;

    private Integer scopeType;

    private String scopeText;

    private String workPlace;

    private Long shiftId;

    /** 关联班次名称快照；自由工时为空 */
    private String shiftName;

    private Integer lateGraceMin;

    private Integer earlyGraceMin;

    /** 已开通来源码列表（由 punchSources 逗号串解析） */
    private List<Integer> sources;

    private String status;

    /** 当前生效成员数 */
    private Long memberCount;

    private String remark;

    private String updatedBy;

    private String updatedAt;

    /** 由实体装配，避免把 MyBatis 实体直接暴露给前端 */
    public static AttendanceGroupVO of(AttGroup group, String shiftName, Long memberCount) {
        AttendanceGroupVO vo = new AttendanceGroupVO();
        vo.setId(group.getId());
        vo.setGroupNo(group.getGroupNo());
        vo.setGroupName(group.getGroupName());
        vo.setGroupType(group.getGroupType());
        vo.setScopeType(group.getScopeType());
        vo.setScopeText(group.getScopeText());
        vo.setWorkPlace(group.getWorkPlace());
        vo.setShiftId(group.getShiftId());
        vo.setShiftName(shiftName);
        vo.setLateGraceMin(group.getLateGraceMin());
        vo.setEarlyGraceMin(group.getEarlyGraceMin());
        vo.setSources(parseSources(group.getPunchSources()));
        vo.setStatus(group.getStatus());
        vo.setMemberCount(memberCount == null ? 0L : memberCount);
        vo.setRemark(group.getRemark());
        vo.setUpdatedBy(group.getUpdatedBy());
        vo.setUpdatedAt(group.getUpdatedAt() == null ? null : group.getUpdatedAt().toString().replace('T', ' '));
        return vo;
    }

    /** 来源码解析：脏数据（非数字）直接忽略，不让一个坏值把整页打挂 */
    private static List<Integer> parseSources(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> s.matches("\\d+"))
                .map(Integer::valueOf)
                .distinct()
                .toList();
    }
}
