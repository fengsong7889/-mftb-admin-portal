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
 * 人员档案扩展项（表 hr_profile_item）：教育 / 履历 / 资质 / 奖惩。
 * <p>
 * 为什么是一张表：这五类都是"挂在人员身上的档案证据行"，生命周期完全一致——
 * HR 手工维护、可附证据、需核实、无审批流、不参与日期生效引擎。分五张表会让
 * 详情页要发五个请求、校验写五遍，而它们的差异只是字段语义。
 * <p>
 * 与 {@code emp_position_record} 的区别：那张表是任职事实（影响编制与薪资），
 * 本表只做档案证据，不参与任何核算。
 */
@Data
@TableName("hr_profile_item")
public class HrProfileItem {

    @TableId
    private Long id;

    /** 人员 ID */
    private Long personId;

    /** 类型：EDUCATION 教育 / WORK 履历 / QUALIFICATION 资质 / REWARD 奖励 / PUNISH 处分 */
    private String itemType;

    /** 标题：学校 / 公司 / 证书名 / 奖惩事项 */
    private String title;

    /** 机构：学校名 / 公司名 / 发证机构 */
    private String orgName;

    /** 角色：专业 / 职位 / 等级 */
    private String roleTitle;

    /** 证书编号（资质类使用） */
    private String certNo;

    /** 开始日期（教育入学 / 履历入职 / 证书生效） */
    private LocalDate startDate;

    /** 结束日期（毕业 / 离职 / 证书到期；空=至今或长期有效） */
    private LocalDate endDate;

    /** 证据地址（毕业证/离职证明/证书扫描件） */
    private String evidenceUrl;

    /** 证据文件名 */
    private String evidenceName;

    /** 核实状态：0=待核实 1=已核实 */
    private Integer verifyStatus;

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
