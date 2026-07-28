package com.mftb.admin.dto;

import com.mftb.admin.entity.SysPosition;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 职位视图对象
 */
@Data
public class PositionVO {

    private Long id;
    private String name;
    /** 职级序列: M=管理 T=技术 P=专业 */
    private String sequence;
    /** 职级 (如 M3 / T5 / P2) */
    private String jobLevel;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private LocalDateTime updatedAt;

    public static PositionVO from(SysPosition position) {
        PositionVO vo = new PositionVO();
        vo.setId(position.getId());
        vo.setName(position.getName());
        vo.setSequence(position.getSequence());
        vo.setJobLevel(position.getJobLevel());
        vo.setUpdatedBy(position.getUpdatedBy());
        vo.setUpdatedAt(position.getUpdatedAt());
        return vo;
    }
}
