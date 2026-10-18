package com.mftb.admin.service;

import com.mftb.admin.entity.EmpPositionRecord;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 任职记录的统一 as-of 解析（方案 §7.2「后端唯一的 as-of 查询口径」）。
 * <p>
 * 存在理由：历史上「当前任职」有三套算法（列表按 {@code sys_user} 快照、详情按 effectiveSeq
 * 跨日期挑最大、工龄按最小序号），同一员工在不同页面给出不同答案。所有读取方一律走本服务，
 * 口径只允许存在一处。
 * <p>
 * 统一规则：只看 {@code effectiveDate <= 查询日} 的记录（未来异动不提前覆盖当前），
 * 再按 {@code effectiveDate DESC, effectiveSeq DESC} 取第一条；
 * {@code effectiveSeq} 只在同一天内有意义，跨日期比较它没有意义。
 */
public interface HrAssignmentQuery {

    /** 在职（派生态，不等于账号状态） */
    String STATUS_ACTIVE = "active";
    /** 离职（由 code=DIMISSION 的任职记录派生） */
    String STATUS_RESIGNED = "resigned";

    /**
     * 指定员工在指定时点的当前任职记录。
     *
     * @param date 查询时点（业务时区 Asia/Shanghai 的自然日）
     * @return 该时点生效的那条记录；无任何生效记录时为 empty
     */
    Optional<EmpPositionRecord> asOf(Long userId, LocalDate date);

    /** 该时点是否离职：无记录按在职处理（历史补录前的账号不应被误判离职） */
    default boolean isResignedAt(Long userId, LocalDate date) {
        return STATUS_RESIGNED.equals(employmentStatusOf(userId, date));
    }

    /** 单个员工在该时点的在职状态 */
    String employmentStatusOf(Long userId, LocalDate date);

    /**
     * 批量取该时点生效的任职记录（口径与 {@link #asOf} 完全一致，只是为了避免一人一次查询）。
     *
     * @return userId → 生效记录；该时点还没有任何生效记录的员工不出现在结果里
     */
    Map<Long, EmpPositionRecord> asOfRecords(Collection<Long> userIds, LocalDate date);

    /**
     * 批量取全部任职记录（<b>含未来生效</b>），按生效日/同日序号正序。
     * <p>给雇佣期间派生与数据核对用：派生需要看到整条时间线，不能只拿已生效的部分。
     */
    Map<Long, List<EmpPositionRecord>> historyOf(Collection<Long> userIds);

    /**
     * 批量派生在职状态（花名册列表专用，避免一人一次查询的 N+1）。
     *
     * @return userId → {@link #STATUS_ACTIVE}/{@link #STATUS_RESIGNED}；入参为空返回空 Map
     */
    Map<Long, String> employmentStatusOf(Collection<Long> userIds, LocalDate date);

    /**
     * 本次雇佣起点：该时点最近一次「入职/重新入职」的生效日。
     * <p>用于本次任职时长；不是认可工龄（后者需 HR 确认后另建字段，方案 §2.2）。
     */
    Optional<LocalDate> currentEmploymentStart(Long userId, LocalDate date);

    /** 该时点之后才生效的异动记录（界面据此提示「有 N 天后生效的安排」，不影响当前状态） */
    List<EmpPositionRecord> futureAssignments(Long userId, LocalDate date);
}
