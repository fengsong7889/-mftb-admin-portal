package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VehicleUseDto;

import java.util.List;

/**
 * 用车单服务（直接登记 / 安排 / 出还车 / 确认 / 补录 / 更正 / 台账）
 *
 * <p>两条路径汇入同一份台账是本项目的第一期核心：审批用车与授权直接登记共用本服务、
 * 共用 biz_vehicle_use / biz_vehicle_trip，只有 {@code source} 与 {@code approvalOutcome} 不同。
 * 严禁为"直接登记"另建一套单据表，否则台账必然出现两份口径。
 *
 * <p>每个写动作都满足三件事：事务内锁住相关资源、幂等键去重、乐观锁版本推进。
 */
public interface VehicleUseService {

    /** 分页查询用车单，按 scope 强制数据范围 */
    PageResult<VehicleUseDto.VO> page(VehicleUseDto.Query query);

    /** 用车单详情（含行程、可执行动作、车辆阻断原因） */
    VehicleUseDto.VO detail(long id);

    /**
     * 待办分组统计（办理页顶部统计卡 + Tab 徽标）。
     *
     * <p>必须接与列表同一份查询条件：卡片与徽标展示的是「当前筛选下的待办数」，
     * 不带条件就会让全局数字冒充筛选结果，数据量一大用户按错单。
     */
    VehicleUseDto.TodoStats todoStats(VehicleUseDto.Query query);

    /**
     * 发起用车申请：一期只落草稿。
     *
     * <p>OA 审批对接在 B2 提供，本方法不会把单据伪装成"审批中"。
     */
    long createDraft(VehicleUseDto.Draft dto);

    /** 授权直接登记：建立"待出车"单据，四重前置条件在服务层校验 */
    long directRegister(VehicleUseDto.DirectRegister dto);

    /** 车辆安排（审批通过后由车管办理；也用于改派） */
    void assign(VehicleUseDto.Assign dto);

    /** 出车登记 */
    void depart(VehicleUseDto.Depart dto);

    /** 归还登记 */
    void ret(VehicleUseDto.Return dto);

    /** 归还确认归档：确认后才计入正式台账 */
    void confirm(VehicleUseDto.Confirm dto);

    /** 事后补录：先入待核对，不直接计入正式汇总 */
    long backfill(VehicleUseDto.Backfill dto);

    /** 授权更正：已结束单据的唯一修改入口，保留修改前后值 */
    void correct(VehicleUseDto.Correct dto);

    /** 台账分页（实际发生过的行程） */
    PageResult<VehicleUseDto.VO> ledgerPage(VehicleUseDto.Query query);

    /** 台账汇总（与 ledgerPage 同一套过滤条件，保证页面与导出对得上） */
    VehicleUseDto.LedgerStats ledgerStats(VehicleUseDto.Query query);

    /** 按部门汇总 */
    List<VehicleUseDto.SummaryRow> ledgerByDepartment();

    /** 按车辆汇总 */
    List<VehicleUseDto.SummaryRow> ledgerByVehicle();

    /** 审计轨迹（受限独立记录页） */
    List<VehicleUseDto.EventVO> events(long useId);
}
