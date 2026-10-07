package com.mftb.admin.service;

import com.mftb.admin.dto.RdmScheduleDTO;
import com.mftb.admin.dto.RdmScheduleVO;

import java.util.List;

/**
 * 排程服务（阶段 5：依赖、关键路径、工作日历与资源负载）。
 * <p>排程结果一律服务端计算：让前端传"关键路径"或"完工日"等于把延期结论交给想报喜的人。
 */
public interface RdmScheduleService {

    /** 需求下的依赖边 */
    List<RdmScheduleVO.Dependency> listDependencies(Long reqId);

    /** 新增依赖（自环、跨需求、重复边、成环一律拒绝） */
    RdmScheduleVO.Dependency addDependency(RdmScheduleDTO.Dependency dto);

    /** 删除依赖 */
    void removeDependency(Long id);

    /** 需求排程总览：甘特条 + 关键路径 + 里程碑 */
    RdmScheduleVO.Plan plan(Long reqId);

    /** 资源负载：把计划工时按工作日摊到人头上，超容量即过载 */
    RdmScheduleVO.Workload workload(String from, String to, Long userId);

    /** 某人的日历例外 */
    List<RdmScheduleVO.CalendarItem> calendar(Long userId);

    /** 保存日历例外（同人同日重复视为修订） */
    List<RdmScheduleVO.CalendarItem> saveCalendar(RdmScheduleDTO.Calendar dto);
}
