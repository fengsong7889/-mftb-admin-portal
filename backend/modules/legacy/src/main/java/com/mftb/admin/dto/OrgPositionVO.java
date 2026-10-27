package com.mftb.admin.dto;

import com.mftb.admin.entity.OrgPosition;
import lombok.Data;

/**
 * 岗位列表视图：在岗位实体上补「当前占用」与「超编」标记。
 * <p>
 * 占用口径：{@code position_id} 命中且 {@code effective_from <= 今天}、{@code effective_to IS NULL} 的任职行
 * （未结束 = 当前在岗）。未来生效的任职不计入占用——否则"下月才到岗"会提前把编制吃满。
 * 本期只统计占用数，不改岗位表：占用是任职事实的投影，落一个冗余字段就必须处理并发与回滚。
 */
@Data
public class OrgPositionVO {

    private Long id;
    private String code;
    private String name;
    private String nameEn;
    private Long unitId;
    private Long jobGradeId;
    private Integer headcount;
    private Integer status;
    private Integer sortOrder;
    private String remark;
    private String updatedBy;
    private Long updatedAt;

    /** 当前占用（未结束任职数） */
    private Integer occupiedCount;
    /** 空缺 = 编制 - 占用（可能为负，负数即超编） */
    private Integer vacancy;
    /** 超编：编制已核定且占用 > 编制 */
    private Boolean overHeadcount;

    public static OrgPositionVO from(OrgPosition position, int occupied) {
        OrgPositionVO vo = new OrgPositionVO();
        vo.setId(position.getId());
        vo.setCode(position.getCode());
        vo.setName(position.getName());
        vo.setNameEn(position.getNameEn());
        vo.setUnitId(position.getUnitId());
        vo.setJobGradeId(position.getJobGradeId());
        vo.setHeadcount(position.getHeadcount() == null ? 0 : position.getHeadcount());
        vo.setStatus(position.getStatus());
        vo.setSortOrder(position.getSortOrder());
        vo.setRemark(position.getRemark());
        vo.setUpdatedBy(position.getUpdatedBy());
        vo.setOccupiedCount(occupied);
        int headcount = vo.getHeadcount();
        vo.setVacancy(headcount - occupied);
        // 编制 0 = 尚未核定，不能判成"超编"（那是"没定编"而不是"人多了"）
        vo.setOverHeadcount(headcount > 0 && occupied > headcount);
        return vo;
    }
}
