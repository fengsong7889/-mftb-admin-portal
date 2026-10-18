package com.mftb.admin.service;

import com.mftb.admin.dto.BasicInfoRequest;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;

import java.util.List;
import java.util.Map;

/**
 * 集团员工服务
 */
public interface EmployeeService {

    /**
     * 全量导出的硬上限：超了就拒，而不是默默多拉或偷偷提高分页上限。
     * <p>方案 §5.1 要求大批量导出走任务化；一期先卡住范围，异步导出随人事报表批次一并实现。
     */
    int ROSTER_EXPORT_MAX_ROWS = 5000;

    /**
     * 分页查询员工（服务端完整筛选与计数）。
     * departmentId 含全部子孙部门；employmentStatus 由职务记录派生（active/resigned）。
     *
     * @param visibleUserIds 组织数据范围收敛集合：{@code null} = 不收敛，空集 = 一条也不给。
     *                       <p>为什么由调用方而不是本服务解析：{@code GET /employees} 同时是
     *                       OA/EAM/会议/RDM 等部门「选个人」下拉的数据源（前端 fetchEmployeeOptions），
     *                       在那里加收敛会让受限角色在其它模块突然选不到人。花名册是
     *                       「按人划权限看名单」（必须收敛），人员下拉是「引用一个人」（不收敛），
     *                       两者口径本来就不同（方案 §7.3 的三维模型只适用于前者）。
     *                       所以收敛写在花名册与导出的 controller 入口，不写在服务里。
     */
    PageResult<EmployeeVO> list(long page, long size, String keyword, String employmentStatus,
                                Long departmentId, String sequence, String jobLevel, String rank,
                                Long roleId, String updatedBy, String updatedAtFrom, String updatedAtTo,
                                java.util.Set<Long> visibleUserIds);

    /** 按 ID 获取单个员工详情（含派生在职状态），员工不存在抛出业务异常 */
    EmployeeVO getDetail(Long id);

    /** 新增员工 */
    EmployeeVO create(EmployeeRequest request);

    /** 编辑员工 */
    EmployeeVO update(Long id, EmployeeRequest request);

    /**
     * 调整员工的功能角色（独立动作 {@code authorize}）。
     * <p>与 {@link #update} 分开：编辑人事资料不应获得提权能力。传空集合为「清空角色」。
     */
    EmployeeVO bindRoles(Long id, List<Long> functionRoleIds);

    /** 重置密码 */
    void resetPassword(Long id, String password);

    /** 启用/停用 */
    void updateStatus(Long id, Integer status);

    /** 删除员工 */
    void delete(Long id);

    /**
     * 获取员工基础信息（个人信息 + 证件信息 + 通讯信息）。
     * @param reveal true=返回证件号/住址明文（仅供受控明文端点使用）；false=默认脱敏。
     */
    Map<String, Object> getBasicInfo(Long id, boolean reveal);

    /** 保存员工基础信息 */
    void saveBasicInfo(Long id, BasicInfoRequest request);
}
