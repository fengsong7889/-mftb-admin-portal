package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrAssignment;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.Person;

import java.time.LocalDate;

/**
 * 人员主数据服务（C2 第一批）：人员、雇佣关系、任职。
 * <p>
 * 本域是 person / hr_employment / hr_assignment 的唯一写入方（方案 13.3）。
 * 账号只在 IAM；这里通过 person.sys_user_id 做显式映射，无账号人员同样可以建档。
 */
public interface HcmPersonService {

    PageResult<Person> listPersons(long page, long size, String keyword, Integer status);

    Person getPerson(Long id);

    /** 无账号建档：sysUserId 可为空；有值时校验账号存在且未被其他人员占用 */
    Person savePerson(Person entity);

    /** 删除人员：存在雇佣关系时拒绝（历史雇佣必须可追溯） */
    void deletePerson(Long id);

    PageResult<HrEmployment> listEmployments(Long personId, long page, long size, Integer status);

    HrEmployment getEmployment(Long id);

    /** 新增或编辑雇佣关系：起止日期、同法人区间不重叠、法域白名单 */
    HrEmployment saveEmployment(HrEmployment entity);

    /** 终止雇佣：只写结束日期，不物理删除 */
    HrEmployment terminateEmployment(Long id, LocalDate endDate);

    /** 按生效日查询任职：effectiveFrom <= asOf <= effectiveTo（或长期有效） */
    PageResult<HrAssignment> listAssignments(Long employmentId, LocalDate asOf, long page, long size);

    HrAssignment getAssignment(Long id);

    /** 新增或编辑任职：同法人挂树、同单位挂岗、FTE 区间、主任职唯一 */
    HrAssignment saveAssignment(HrAssignment entity);
}
