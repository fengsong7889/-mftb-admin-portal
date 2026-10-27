package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.entity.MeetingAttendee;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingAttendeeMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.OperatorResolver;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;

/**
 * 会议域访问守卫（"谁能看/谁能改"的唯一判定入口）。
 *
 * <p>与 {@code VehicleAccessGuard} 同一个理由：菜单权限与数据范围是两件事。
 * 持有 {@code meeting-booking} 菜单只说明能进预约页，不代表能看别人的会议、
 * 更不代表能取消别人的会。把判定收在一个类里，审计只需检查这一个文件；
 * 分散实现最常见的事故是"某个新加的接口忘了带范围过滤"。
 *
 * <p>所有判定 <b>fail-closed</b>：拿不到当前登录人、判不出身份，一律拒绝，不默认放行。
 */
@Component
@RequiredArgsConstructor
public class MeetingAccessGuard {

    private final OperatorResolver operatorResolver;
    private final PermissionService permissionService;
    private final MeetingAttendeeMapper attendeeMapper;
    private final SysUserMapper userMapper;

    /** 当前登录人；未登录一律拒绝，不允许用 null 继续往下走 */
    public SysUser currentUser() {
        SysUser user = operatorResolver.currentUser();
        if (user == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        return user;
    }

    public boolean isAdmin(SysUser user) {
        return operatorResolver.isAdmin(user);
    }

    /** 是否具备行政视野（能看全量预约记录） */
    public boolean canSeeAll(SysUser user) {
        return isAdmin(user)
                || permissionService.hasPermission(user, MeetingConstants.MENU_RECORD, MeetingConstants.ACTION_VIEW);
    }

    /** 是否可维护会议室档案（新增/编辑/停用/删除） */
    public boolean canManageRoom(SysUser user) {
        return isAdmin(user)
                || permissionService.hasPermission(user, MeetingConstants.MENU_ROOM, MeetingConstants.ACTION_EDIT);
    }

    /** 会议室档案写入的统一守卫：写方法只调这一句，不把权限判断漏到服务层各个分支里 */
    public void requireRoomManage(SysUser user) {
        if (!canManageRoom(user)) {
            throw new BusinessException("無權維護會議室檔案，請在「會議室檔案」由行政操作");
        }
    }

    /** 是否可代订与手动释放（行政专属） */
    public boolean canOperateRecords(SysUser user) {
        return isAdmin(user)
                || permissionService.hasPermission(user, MeetingConstants.MENU_RECORD, MeetingConstants.ACTION_EDIT);
    }

    /**
     * 是否持有纪要的使用侧动作权（{@code meeting-my:edit}）。
     *
     * <p>这一条只回答"能不能记"，不回答"能记谁的"：后者由 {@code requireBookingReadable} 与
     * {@code isOrganizer}/{@code myRole} 收敛，两者合起来才是前端 deriveCanRecordMinutes 的同口径。
     * 行政的代录权走 {@link #canOperateRecords}，不从这里扩。
     */
    public boolean canRecordMinutes(SysUser user) {
        return isAdmin(user)
                || permissionService.hasPermission(user, MeetingConstants.MENU_MY, MeetingConstants.ACTION_EDIT);
    }

    /**
     * 规则与黑名单维护的统一守卫。
     *
     * <p>判定锚点刻意取 {@code meeting-record:edit}（行政专属）而不是 {@code meeting-config:edit}：
     * 预约规则与黑名单会影响全站所有人的预约结果，能进"預約規則"页不等于有这份权力；
     * 而控制器上的 {@code @RequirePermission} 只管菜单入口，这一层才管"这一笔能不能改"。
     */
    public void requireRecordManager(SysUser user) {
        if (!canOperateRecords(user)) {
            throw new BusinessException("無權修改預約規則或黑名單，請在「預約記錄」由行政操作");
        }
    }

    /** 列表可见范围：非行政视野只能看到与自己相关的会议 */
    public void requireSeeAll(boolean seeAll) {
        if (!seeAll) {
            throw new BusinessException("無權查看全部預約記錄，請在「我的會議」查看與您相關的會議");
        }
    }

    /**
     * 单场会议的读取守卫：组织者、参会人、行政视野三者之外不可读（防 IDOR）。
     *
     * <p>会议详情里有参会人名单、议程与房间位置，属于内部信息；
     * 仅凭"知道 bookingId"就读是水平越权，因此这里必须是白名单式的三重判定。
     */
    public void requireBookingReadable(MeetingBooking booking, SysUser current) {
        if (canSeeAll(current) || isOrganizer(booking, current)) {
            return;
        }
        if (attendeeMapper.countAttendee(booking.getId(), current.getId()) > 0) {
            return;
        }
        throw new BusinessException("無權查看該會議");
    }

    /**
     * 单场会议的写入守卫：仅组织者本人，或持有记录管理权的行政。
     *
     * <p>参会人可以响应邀约与签到，但不能改会议时间/换房间/取消整场会——
     * 那会让"被邀请的人"反过来改掉发起人的安排。
     */
    public void requireBookingWritable(MeetingBooking booking, SysUser current) {
        if (isOrganizer(booking, current) || canOperateRecords(current)) {
            return;
        }
        throw new BusinessException("只有會議組織者或行政可以變更或取消該會議");
    }

    public boolean isOrganizer(MeetingBooking booking, SysUser current) {
        return Objects.equals(booking.getOrganizerId(), current.getId());
    }

    /** 当前用户在这场会里的身份：organizer/required/optional/external/none */
    public String myRole(MeetingBooking booking, SysUser current) {
        if (isOrganizer(booking, current)) {
            return MeetingConstants.ATTENDEE_ORGANIZER;
        }
        MeetingAttendee mine = findMyAttendee(booking.getId(), current.getId());
        return mine == null ? "none" : mine.getAttendeeType();
    }

    /** 当前用户在这场会里的响应状态（非参会人返回 null） */
    public String myResponse(MeetingBooking booking, SysUser current) {
        MeetingAttendee mine = findMyAttendee(booking.getId(), current.getId());
        return mine == null ? null : mine.getResponse();
    }

    private MeetingAttendee findMyAttendee(long bookingId, long userId) {
        LambdaQueryWrapper<MeetingAttendee> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MeetingAttendee::getBookingId, bookingId).eq(MeetingAttendee::getUserId, userId);
        List<MeetingAttendee> rows = attendeeMapper.selectList(wrapper);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /**
     * 行政代订：解析并校验"实际使用人"，返回 null 表示没有代订。
     *
     * <p>为什么收在守卫里而不是各服务各写一份：「谁能替别人订会」与「这个人还能不能被排进会」
     * 必须一起回答，拆开写就会出现"普通员工也能传 delegateForId"或"代订给了离职的人"。
     *
     * <p>权限锚刻意取 {@code meeting-record:edit}（与手动释放、代取消同源）而不是新增一个动作：
     * 菜单种子里没有 create/delete 之类动作，标一个种子里不存在的动作等于对所有人永久 403；
     * 而"替他人占用会议室"与"代操作他人的预约"本来就是同一种行政权力。
     *
     * <p>传了组织者自己的 id 归零处理：那等价于自订，留一条 delegate_for_id=组织者 的记录
     * 只会让台账里出现一堆"自己代订给自己"的噪声。
     */
    public SysUser resolveDelegateFor(Long delegateForId, SysUser operator) {
        if (delegateForId == null || delegateForId <= 0 || delegateForId.equals(operator.getId())) {
            return null;
        }
        if (!canOperateRecords(operator)) {
            throw new BusinessException("僅行政可替他人預訂會議，請由本人自行預約");
        }
        SysUser delegate = userMapper.selectById(delegateForId);
        if (delegate == null) {
            throw new BusinessException("實際使用人不存在或已刪除，請重新選擇");
        }
        if (delegate.getStatus() == null || delegate.getStatus() != 1) {
            throw new BusinessException("實際使用人已停用或離職，不可為其預訂會議");
        }
        return delegate;
    }

    /** 参会人必须是本人或行政：响应与签到都属于"替自己表态"的动作 */
    public void requireSelfOrAdmin(long targetUserId, SysUser current) {
        if (!Objects.equals(targetUserId, current.getId()) && !isAdmin(current)) {
            throw new BusinessException("只能為本人執行該操作");
        }
    }
}
