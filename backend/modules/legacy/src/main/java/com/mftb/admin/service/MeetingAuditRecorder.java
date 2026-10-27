package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingEvent;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingEventMapper;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Objects;

/**
 * 会议域审计轨迹写入器（唯一入口）。
 *
 * <p>审计写入散在各服务里迟早会长出"某个新操作忘了记"的洞，因此收成一个组件：
 * 所有轨迹都必须带操作人（或显式的 SYSTEM）、变更前后快照与幂等键。
 *
 * <p><b>幂等键与操作人构成唯一键</b>：前端一次点击因网络重试打到两次，
 * 业务侧靠 {@code request_key} 挡住重复占用，轨迹侧靠同一个键挡住重复记录，两边用同一个键才对得上。
 *
 * <p>写入失败<b>不吞异常</b>：轨迹与业务变更同事务，审计写不进去就说明这一笔本来不该生效。
 */
@Component
@RequiredArgsConstructor
public class MeetingAuditRecorder {

    /** 快照序列化上限：TEXT 列容得下，超长说明取错对象（比如把整个参会人名单塞进单字段） */
    private static final int MAX_JSON_LENGTH = 60000;

    private final MeetingEventMapper eventMapper;

    /** 记录一场会议的生命周期事件 */
    public void recordBooking(Long bookingId, Long roomId, String bookingNo, String eventCode, String reason,
                              Object before, Object after, SysUser operator, String requestKey) {
        MeetingEvent event = new MeetingEvent();
        event.setBookingId(bookingId);
        event.setRoomId(roomId);
        event.setTargetNo(nullToEmpty(truncate(bookingNo, 32)));
        event.setEventCode(eventCode);
        event.setReason(truncate(reason, 300));
        event.setBeforeJson(toJson(before));
        event.setAfterJson(toJson(after));
        fillOperator(event, operator);
        event.setRequestKey(StringUtils.hasText(requestKey) ? truncate(requestKey, 64) : null);
        eventMapper.insert(event);
    }

    /**
     * 记录会议室档案变更。
     *
     * <p>{@code bookingId} 为 NULL：房间的新增/改规则/停用与某场会议无关，
     * 但同样必须留痕——行政改小了容量或调短了可预约窗，事后要能查到是谁在哪天改的。
     */
    public void recordRoom(Long roomId, String roomNo, String eventCode, String reason,
                           Object before, Object after, SysUser operator, String requestKey) {
        recordBooking(null, roomId, roomNo, eventCode, reason, before, after, operator, requestKey);
    }

    /**
     * 系统动作（自动释放、到期收尾）。
     *
     * <p>操作人姓名固定 {@code SYSTEM} 且 {@code operatorId} 为 NULL：机器改的状态一旦与人工操作
     * 混在同一个名字里，行政就再也分不清"人放掉的房"和"系统放掉的房"。
     */
    public void recordSystem(Long bookingId, Long roomId, String bookingNo, String eventCode, String reason,
                             Object before, Object after) {
        MeetingEvent event = new MeetingEvent();
        event.setBookingId(bookingId);
        event.setRoomId(roomId);
        event.setTargetNo(nullToEmpty(truncate(bookingNo, 32)));
        event.setEventCode(eventCode);
        event.setReason(truncate(reason, 300));
        event.setBeforeJson(toJson(before));
        event.setAfterJson(toJson(after));
        event.setOperatorId(null);
        event.setOperatorName(MeetingConstants.OPERATOR_SYSTEM);
        event.setOperatorEmpNo("");
        eventMapper.insert(event);
    }

    /** NOT NULL DEFAULT '' 的列不接受 null：显式转空串，不依赖驱动行为 */
    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private void fillOperator(MeetingEvent event, SysUser operator) {
        if (operator == null) {
            throw new BusinessException("審計缺少操作人，請重新登錄後重試");
        }
        event.setOperatorId(operator.getId());
        event.setOperatorName(nullToEmpty(truncate(StringUtils.hasText(operator.getName())
                ? operator.getName() : operator.getUsername(), 64)));
        event.setOperatorEmpNo(nullToEmpty(truncate(Objects.toString(operator.getEmpId(), ""), 32)));
    }

    /** 快照序列化：失败只记类型与原因，不把对象内容原样抛给用户 */
    private static String toJson(Object value) {
        if (value == null) {
            return null;
        }
        String json = JsonUtils.toJson(value);
        return json != null && json.length() > MAX_JSON_LENGTH ? null : json;
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() > max ? value.substring(0, max) : value;
    }
}
