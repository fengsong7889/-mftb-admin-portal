package com.mftb.admin.dto;

import com.mftb.admin.entity.AttHoliday;
import lombok.Data;

import java.time.LocalDate;

/**
 * 节假日视图。
 * <p>
 * {@code updatedAt} 输出可读字符串（实体是 LocalDateTime，全局 Jackson 会序列化成毫秒时间戳，
 * 直接返回实体会让「最後更新時間」列显示一串数字）。
 */
@Data
public class AttendanceHolidayVO {

    private Long id;
    private LocalDate holidayDate;
    private String holidayName;
    /** 1=法定節假日 2=調休上班 3=公司假期 */
    private Integer holidayType;
    private Integer yearNo;
    private String status;
    private String remark;
    private String updatedBy;
    private String updatedAt;

    public static AttendanceHolidayVO of(AttHoliday e) {
        AttendanceHolidayVO vo = new AttendanceHolidayVO();
        vo.setId(e.getId());
        vo.setHolidayDate(e.getHolidayDate());
        vo.setHolidayName(e.getHolidayName());
        vo.setHolidayType(e.getHolidayType());
        vo.setYearNo(e.getYearNo());
        vo.setStatus(e.getStatus());
        vo.setRemark(e.getRemark());
        vo.setUpdatedBy(e.getUpdatedBy());
        vo.setUpdatedAt(DateTimeFormats.of(e.getUpdatedAt()));
        return vo;
    }
}
