package com.mftb.admin.dto;

import com.mftb.admin.entity.DocViewLog;
import com.mftb.admin.util.DateTimeUtils;
import lombok.Data;

/** 查閱留痕 VO */
@Data
public class DocViewLogVO {

    private Long id;
    private String userName;
    private String department;
    private String viewedAt;
    private Integer durationSec;

    public static DocViewLogVO from(DocViewLog l) {
        DocViewLogVO v = new DocViewLogVO();
        v.setId(l.getId());
        v.setUserName(l.getUserName());
        v.setDepartment(l.getDepartment());
        v.setViewedAt(DateTimeUtils.format(l.getViewedAt()));
        v.setDurationSec(l.getDurationSec());
        return v;
    }
}
