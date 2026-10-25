package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 任职（表 hr_assignment）：某段雇佣期间里的岗位、部门、经理、地点与 FTE。
 * <p>
 * 日期生效是这张表的核心：{@code effectiveFrom/effectiveTo} 是业务生效区间，
 * {@code seqNo} 用来排序"同一天发生多次变更"——同日多次不能靠 id 大小决定先后，
 * 也不能跨日期排序（方案 5.1）。
 * <p>
 * {@code primaryFlag} 的"主任职唯一"由数据库生成列 + 唯一键兜住（见迁移 292），
 * 不单靠服务层检查：并发提交两份主任职时服务层检查会同时通过。
 */
@Data
@TableName("hr_assignment")
public class HrAssignment {

    @TableId
    private Long id;

    /** 雇佣关系 ID */
    private Long employmentId;

    /** 管理组织 ID（org_unit），必须与雇佣的法人一致 */
    private Long unitId;

    /** 岗位 ID（org_position）；为空表示"尚未定岗" */
    private Long positionId;

    /** 直属经理（person.id，不是账号） */
    private Long managerPersonId;

    /** 工作地点（先存自由文本，C1 的工作地点主数据落地后改为外键） */
    private String workLocation;

    /** FTE：0.10 ~ 1.00，Decimal 不用浮点 */
    private BigDecimal fte;

    /** 是否主任职：1=是 0=否；同一雇佣关系同一时间只能有一个主任职 */
    private Integer primaryFlag;

    /** 生效起（含） */
    private LocalDate effectiveFrom;

    /** 生效止（含）；为空表示持续有效 */
    private LocalDate effectiveTo;

    /** 同日序号：同一天多次变更按此排序，不跨日期比较 */
    private Integer seqNo;

    /** 备注 */
    private String remark;

    /** 最后更新人 */
    private String updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createdAt;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updatedAt;

    @TableLogic
    private Integer deleted;
}
