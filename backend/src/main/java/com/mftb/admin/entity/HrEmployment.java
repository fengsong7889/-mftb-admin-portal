package com.mftb.admin.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 雇佣关系（表 hr_employment）：某个人与某个雇主法人之间的雇佣事实。
 * <p>
 * 不是劳动合同本身：合同是法律文件（C4 台账），雇佣关系是"这段时间他在这个法人下工作"。
 * 返聘要新开一段期间，但仍是同一个人（person_id 不变）。
 * <p>
 * 起止日期与状态分开：离职日（end_date）是事实，状态是流程结果；
 * 不要把"已离职"写进状态就以为表达了离职时间。
 */
@Data
@TableName("hr_employment")
public class HrEmployment {

    @TableId
    private Long id;

    /** 人员 ID */
    private Long personId;

    /** 雇主法人 ID（org_legal_entity） */
    private Long legalEntityId;

    /** 雇佣编号（稳定业务键，全库唯一） */
    private String employmentNo;

    /** 雇佣类型：FULL_TIME / PART_TIME / INTERN / DISPATCH / OUTSOURCE */
    private String employmentType;

    /** 法域：CN/HK/MO；与雇主注册地分开维护，不相互推断 */
    private String jurisdiction;

    /** 雇佣开始日期（不得从账号创建时间推定） */
    private LocalDate startDate;

    /** 雇佣结束日期；为空表示无固定期限 */
    private LocalDate endDate;

    /** 状态：1=有效 0=已终止 */
    private Integer status;

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
