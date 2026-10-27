package com.mftb.admin.dto;

import com.mftb.admin.entity.AttPunchLog;
import lombok.Data;

/**
 * 打卡流水视图。
 * <p>
 * {@code punchAt} 输出为 {@code yyyy-MM-dd HH:mm:ss} 字符串：全局 Jackson 配置把
 * LocalDateTime 序列化成毫秒时间戳，直接返回实体会让界面显示一串数字。
 */
@Data
public class AttendancePunchVO {

    private Long id;
    private String punchAt;
    /** 考勤日期（跨夜班归属日，不等于 punchAt 的日期部分） */
    private String workDate;
    private Long userId;
    private String empNo;
    private String empName;
    private String deptName;
    private Long groupId;
    private String groupName;
    /** 1=上班卡 2=下班卡 */
    private Integer punchType;
    /** 1=釘釘同步 2=手工導入 */
    private Integer source;
    private String location;
    /** 1=正常 2=遲到 3=早退 4=外勤 5=無效卡 */
    private Integer result;

    public static AttendancePunchVO of(AttPunchLog log) {
        AttendancePunchVO vo = new AttendancePunchVO();
        vo.setId(log.getId());
        vo.setPunchAt(DateTimeFormats.of(log.getPunchAt()));
        vo.setWorkDate(log.getWorkDate() == null ? null : log.getWorkDate().toString());
        vo.setUserId(log.getUserId());
        vo.setEmpNo(log.getEmpNo());
        vo.setEmpName(log.getEmpName());
        vo.setGroupId(log.getGroupId());
        vo.setPunchType(log.getPunchType());
        vo.setSource(log.getSource());
        vo.setLocation(log.getLocation());
        vo.setResult(log.getResult());
        return vo;
    }
}
