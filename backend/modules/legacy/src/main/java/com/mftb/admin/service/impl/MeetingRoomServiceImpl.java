package com.mftb.admin.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingRoomDto;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingRoom;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingBookingMapper;
import com.mftb.admin.mapper.MeetingRoomMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.MeetingAccessGuard;
import com.mftb.admin.service.MeetingAuditRecorder;
import com.mftb.admin.service.MeetingRoomService;
import com.mftb.admin.service.MeetingRuleService;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/** 会议室档案服务实现 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MeetingRoomServiceImpl implements MeetingRoomService {

    /** 允许的房间状态（与 DB CHECK 一致，但先在这里给出可读错误，而不是等驱动抛 3819） */
    private static final Set<String> ROOM_STATUSES = Set.of(
            MeetingConstants.ROOM_ACTIVE, MeetingConstants.ROOM_MAINTENANCE, MeetingConstants.ROOM_DISABLED);

    /** 忙闲视图最长跨度：超过它一次取数会拉回整月占用段，前端也画不下，按非法请求拒掉 */
    private static final long MAX_WINDOW_DAYS = 14;
    /** 房间详情页「占用情况」最多显示的未来预约数 */
    private static final int UPCOMING_LIMIT = 50;
    /** 预约页房间候选上限 */
    private static final int MAX_OPTION_ROOMS = 200;

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    /** 脱敏房间的占用标题：只说"占了"，不说"谁在开什么会"（全系统文案用繁中，与忙闲图例的"已佔 n 段"同源） */
    private static final String OCCUPIED_LABEL = "已佔用";

    private final MeetingRoomMapper roomMapper;
    private final MeetingBookingMapper bookingMapper;
    private final SysUserMapper userMapper;
    private final MeetingAccessGuard guard;
    private final MeetingRuleService ruleService;
    private final MeetingAuditRecorder auditRecorder;

    /* ==================== 查询 ==================== */

    @Override
    public MeetingRoomDto.PageWithStats listWithStats(MeetingRoomDto.Query query) {
        MeetingRoomDto.PageWithStats result = new MeetingRoomDto.PageWithStats();
        Page<MeetingRoom> page = new Page<>(
                PageResult.normalizePage(query.getPage() == null ? 1 : query.getPage()),
                PageResult.normalizeSize(query.getSize() == null ? 20 : query.getSize()));
        Page<MeetingRoom> paged = roomMapper.selectPage(page, buildWrapper(query));
        List<MeetingRoomDto.VO> records = paged.getRecords().stream().map(this::toVO).toList();
        attachAdminUserNames(records);
        result.setPage(new PageResult<>(records, paged.getTotal()));
        // 统计卡与列表共用同一组条件：先筛后统计，否则"总数"永远是全库数字，改了筛选没反应
        result.setStats(buildStats(query));
        return result;
    }

    @Override
    public MeetingRoomDto.VO detail(long id) {
        MeetingRoom room = requireRoom(id);
        MeetingRoomDto.VO vo = toVO(room);
        attachAdminUserNames(List.of(vo));
        vo.setFutureBookingCount(bookingMapper.countFutureOccupyingByRoom(id));
        return vo;
    }

    /* ==================== 写入 ==================== */

    @Override
    @Transactional(rollbackFor = Exception.class)
    public long create(MeetingRoomDto.Form form) {
        SysUser current = guard.currentUser();
        guard.requireRoomManage(current);
        MeetingRoom room = new MeetingRoom();
        applyForm(room, form);
        room.setStatus(defaultStatus(form.getStatus()));
        room.setApprovalRequired(0);
        room.setVersion(0);
        try {
            roomMapper.insert(room);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            // 编号撞唯一键：库里异常信息含索引名，不回传，只给业务可读结论
            throw new BusinessException("會議室編號已存在：" + form.getRoomNo());
        }
        auditRecorder.recordRoom(room.getId(), room.getRoomNo(), MeetingConstants.EVENT_ROOM_CREATE,
                null, null, snapshot(room), current, null);
        return room.getId();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void update(long id, MeetingRoomDto.Form form) {
        SysUser current = guard.currentUser();
        guard.requireRoomManage(current);
        MeetingRoom before = requireRoom(id);
        int expectVersion = requireVersion(form.getExpectVersion());

        MeetingRoom after = new MeetingRoom();
        applyForm(after, form);
        after.setStatus(defaultStatus(form.getStatus()));

        LambdaUpdateWrapper<MeetingRoom> update = new LambdaUpdateWrapper<MeetingRoom>()
                .eq(MeetingRoom::getId, id)
                .eq(MeetingRoom::getVersion, expectVersion)
                // 逐列显式 set：规则列允许被"清空回落到全局默认"，实体 null 字段会被 MP 跳过，
                // 不显式 set 就永远清不掉，行政只能改大不能改小
                .set(MeetingRoom::getRoomNo, after.getRoomNo())
                .set(MeetingRoom::getRoomName, after.getRoomName())
                .set(MeetingRoom::getCity, after.getCity())
                .set(MeetingRoom::getCampus, after.getCampus())
                .set(MeetingRoom::getBuilding, after.getBuilding())
                .set(MeetingRoom::getFloorCode, after.getFloorCode())
                .set(MeetingRoom::getLocationDesc, after.getLocationDesc())
                .set(MeetingRoom::getCapacity, after.getCapacity())
                .set(MeetingRoom::getFacilities, after.getFacilities())
                .set(MeetingRoom::getPhotoUrls, after.getPhotoUrls())
                .set(MeetingRoom::getStatus, after.getStatus())
                .set(MeetingRoom::getBookable, after.getBookable())
                .set(MeetingRoom::getBookableStartTime, after.getBookableStartTime())
                .set(MeetingRoom::getBookableEndTime, after.getBookableEndTime())
                .set(MeetingRoom::getMinDuration, after.getMinDuration())
                .set(MeetingRoom::getMaxDuration, after.getMaxDuration())
                .set(MeetingRoom::getCheckinRequired, after.getCheckinRequired())
                .set(MeetingRoom::getReleaseAfterMinutes, after.getReleaseAfterMinutes())
                .set(MeetingRoom::getHideTitle, after.getHideTitle())
                .set(MeetingRoom::getAdminUserIds, after.getAdminUserIds())
                .set(MeetingRoom::getRemark, after.getRemark())
                .set(MeetingRoom::getUpdatedBy, current.getName())
                .setSql("version = version + 1");
        if (roomMapper.update(null, update) == 0) {
            throw new BusinessException(roomNoConflictMessage(id, form.getRoomNo(), "該會議室已被他人修改，請刷新後重試"));
        }
        auditRecorder.recordRoom(id, after.getRoomNo(), MeetingConstants.EVENT_ROOM_UPDATE,
                null, snapshot(before), snapshot(after), current, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void changeStatus(long id, MeetingRoomDto.StatusChange change) {
        SysUser current = guard.currentUser();
        guard.requireRoomManage(current);
        String status = change.getStatus() == null ? "" : change.getStatus().trim();
        if (!ROOM_STATUSES.contains(status)) {
            throw new BusinessException("不支持的會議室狀態：" + status);
        }
        MeetingRoom before = requireRoom(id);
        if (Objects.equals(before.getStatus(), status)) {
            return;
        }
        int affected = roomMapper.update(null, new LambdaUpdateWrapper<MeetingRoom>()
                .eq(MeetingRoom::getId, id)
                .eq(MeetingRoom::getVersion, requireVersion(change.getVersion()))
                .set(MeetingRoom::getStatus, status)
                // 不联动改写 bookable：可预约性的唯一口径是 isBookable()（bookable=1 且 status=active），
                // 预约校验（MeetingRuleService）与忙闲过滤也各自双条件卡住，停用状态天然订不出去。
                // 而在这里顺手清零，等于把「行政原本是否允许预约」这个意愿抹掉：
                // 停用→启用一次就把 bookable 永久留在 0，房间从预约页彻底消失且再也点不回来。
                .set(MeetingRoom::getUpdatedBy, current.getName())
                .setSql("version = version + 1"));
        if (affected == 0) {
            throw new BusinessException("該會議室已被他人修改，請刷新後重試");
        }
        MeetingRoom after = requireRoom(id);
        auditRecorder.recordRoom(id, after.getRoomNo(), MeetingConstants.EVENT_ROOM_UPDATE,
                "狀態變更為 " + status, Map.of("status", before.getStatus()),
                Map.of("status", after.getStatus()), current, null);
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(long id, MeetingRoomDto.DeleteForm form) {
        SysUser current = guard.currentUser();
        guard.requireRoomManage(current);
        MeetingRoom room = requireRoom(id);
        int future = bookingMapper.countFutureOccupyingByRoom(id);
        if (future > 0) {
            throw new BusinessException("該會議室還有 " + future + " 場未結束的會議，請先取消或改期後再刪除");
        }
        if (roomMapper.deleteVersioned(id, requireVersion(form.getVersion()), current.getName()) == 0) {
            throw new BusinessException("該會議室已被他人修改，請刷新後重試");
        }
        auditRecorder.recordRoom(id, room.getRoomNo(), MeetingConstants.EVENT_ROOM_DELETE,
                form.getReason(), snapshot(room), null, current, null);
    }

    /* ==================== 忙闲视图 ==================== */

    @Override
    public List<MeetingRoomDto.Availability> availability(MeetingRoomDto.AvailabilityQuery query) {
        LocalDateTime from = query.getFrom();
        LocalDateTime to = query.getTo();
        if (from == null || to == null || !to.isAfter(from)) {
            throw new BusinessException("請選擇有效的查詢時間範圍");
        }
        if (Duration.between(from, to).toDays() >= MAX_WINDOW_DAYS) {
            throw new BusinessException("一次最多查詢 " + MAX_WINDOW_DAYS + " 天的忙閒情況");
        }

        MeetingRoomDto.Query filter = new MeetingRoomDto.Query();
        filter.setRoomIds(query.getRoomIds());
        filter.setCity(query.getCity());
        filter.setMinCapacity(query.getMinCapacity());
        filter.setFacilities(query.getFacilities());
        filter.setBookableOnly(Boolean.TRUE);
        List<MeetingRoom> rooms = roomMapper.selectList(buildWrapper(filter));
        if (rooms.isEmpty()) {
            return List.of();
        }

        List<Long> roomIds = rooms.stream().map(MeetingRoom::getId).toList();
        Map<Long, List<MeetingBooking>> slotsByRoom = bookingMapper
                .findOccupiedSlots(roomIds, from, to).stream()
                .collect(Collectors.groupingBy(MeetingBooking::getRoomId));

        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        List<MeetingRoomDto.Availability> result = new ArrayList<>(rooms.size());
        for (MeetingRoom room : rooms) {
            MeetingRuleService.Effective eff = ruleService.effectiveFor(room, global);
            MeetingRoomDto.Availability item = new MeetingRoomDto.Availability();
            item.setRoomId(room.getId());
            item.setRoomNo(room.getRoomNo());
            item.setRoomName(room.getRoomName());
            // 城市单独回传字段（预约页蓝色徽章），locationText 只拼园区以下，避免“深圳 · 深圳 · …”双写
            item.setCity(room.getCity());
            item.setLocationText(locationBody(room));
            item.setCapacity(room.getCapacity());
            item.setFacilities(parseFacilities(room.getFacilities()));
            item.setBookable(isBookable(room));
            item.setStatus(room.getStatus());
            item.setBookableStartTime(eff.getBookableStart().format(TIME_FORMAT));
            item.setBookableEndTime(eff.getBookableEnd().format(TIME_FORMAT));
            // 脱敏判定落在取数处：前端不显示不等于后端没发出去
            boolean hideTitle = Objects.requireNonNullElse(room.getHideTitle(), 0) == 1;
            item.setSlots(slotsByRoom.getOrDefault(room.getId(), List.of()).stream()
                    .map(booking -> toSlot(booking, hideTitle)).toList());
            result.add(item);
        }
        return result;
    }

    @Override
    public List<MeetingRoomDto.UpcomingVO> upcoming(long id) {
        MeetingRoom room = requireRoom(id);
        List<MeetingBooking> bookings = bookingMapper.selectList(new LambdaQueryWrapper<MeetingBooking>()
                .eq(MeetingBooking::getRoomId, id)
                .in(MeetingBooking::getStatus, MeetingConstants.OCCUPYING_STATUSES)
                .gt(MeetingBooking::getEndTime, LocalDateTime.now())
                .orderByAsc(MeetingBooking::getStartTime)
                .last("LIMIT " + UPCOMING_LIMIT));
        boolean hideTitle = Objects.requireNonNullElse(room.getHideTitle(), 0) == 1;
        return bookings.stream().map(booking -> {
            MeetingRoomDto.UpcomingVO vo = new MeetingRoomDto.UpcomingVO();
            vo.setBookingId(booking.getId());
            vo.setBookingNo(booking.getBookingNo());
            vo.setTitle(hideTitle ? OCCUPIED_LABEL : booking.getTitle());
            vo.setOrganizerName(hideTitle ? "" : booking.getOrganizerName());
            vo.setStartAt(com.mftb.admin.util.DateTimeUtils.format(booking.getStartTime()));
            vo.setEndAt(com.mftb.admin.util.DateTimeUtils.format(booking.getEndTime()));
            vo.setStatus(booking.getStatus());
            return vo;
        }).toList();
    }

    @Override
    public List<MeetingRoomDto.VO> bookableOptions() {
        MeetingRoomDto.Query query = new MeetingRoomDto.Query();
        query.setBookableOnly(Boolean.TRUE);
        // 房间总量在几百量级：取上限内的一页够用，不做分页循环拉全库
        query.setSize(MAX_OPTION_ROOMS);
        Page<MeetingRoom> page = new Page<>(1, query.getSize());
        List<MeetingRoom> rooms = roomMapper.selectPage(page, buildWrapper(query)).getRecords();
        MeetingRuleService.GlobalRule global = ruleService.globalRule();
        return rooms.stream().map(room -> {
            MeetingRoomDto.VO vo = toVO(room);
            MeetingRuleService.Effective eff = ruleService.effectiveFor(room, global);
            vo.setBookableStartTime(eff.getBookableStart().format(TIME_FORMAT));
            vo.setBookableEndTime(eff.getBookableEnd().format(TIME_FORMAT));
            vo.setMinDuration(eff.getMinDuration());
            vo.setMaxDuration(eff.getMaxDuration());
            vo.setWindowConfigured(eff.isWindowConfigured());
            vo.setDurationConfigured(eff.isDurationConfigured());
            return vo;
        }).toList();
    }

    @Override
    public List<String> cities() {
        return roomMapper.listCities();
    }

    @Override
    public List<String> campuses(String city) {
        return roomMapper.listCampuses(StringUtils.hasText(city) ? city.trim() : null);
    }

    @Override
    public List<String> buildings(String campus) {
        if (!StringUtils.hasText(campus)) {
            return List.of();
        }
        return roomMapper.listBuildings(campus.trim());
    }

    @Override
    public List<String> floors(String campus, String building) {
        if (!StringUtils.hasText(campus) || !StringUtils.hasText(building)) {
            return List.of();
        }
        return roomMapper.listFloors(campus.trim(), building.trim());
    }

    /* ==================== 内部方法 ==================== */

    /** 列表与统计共用的条件构造：每次调用返回新 wrapper，避免分页与统计复用同一个对象互相污染 */
    private LambdaQueryWrapper<MeetingRoom> buildWrapper(MeetingRoomDto.Query query) {
        LambdaQueryWrapper<MeetingRoom> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(query.getKeyword())) {
            String kw = query.getKeyword().trim();
            wrapper.and(w -> w.like(MeetingRoom::getRoomNo, kw)
                    .or().like(MeetingRoom::getRoomName, kw)
                    .or().like(MeetingRoom::getCity, kw)
                    .or().like(MeetingRoom::getLocationDesc, kw));
        }
        if (StringUtils.hasText(query.getCity())) {
            wrapper.eq(MeetingRoom::getCity, query.getCity().trim());
        }
        if (StringUtils.hasText(query.getCampus())) {
            wrapper.eq(MeetingRoom::getCampus, query.getCampus().trim());
        }
        if (StringUtils.hasText(query.getBuilding())) {
            wrapper.eq(MeetingRoom::getBuilding, query.getBuilding().trim());
        }
        if (StringUtils.hasText(query.getFloorCode())) {
            wrapper.eq(MeetingRoom::getFloorCode, query.getFloorCode().trim());
        }
        if (query.getMinCapacity() != null && query.getMinCapacity() > 0) {
            wrapper.ge(MeetingRoom::getCapacity, query.getMinCapacity());
        }
        if (query.getRoomIds() != null && !query.getRoomIds().isEmpty()) {
            wrapper.in(MeetingRoom::getId, query.getRoomIds());
        }
        if (query.getFacilities() != null) {
            // 设备是"且"关系：逗号包裹格式让 LIKE 变成精确代码匹配，不会把 WHITEBOARD 命中到 WHITEBOARD_X
            for (String code : query.getFacilities()) {
                if (StringUtils.hasText(code)) {
                    wrapper.like(MeetingRoom::getFacilities, "," + code.trim() + ",");
                }
            }
        }
        if (StringUtils.hasText(query.getStatus())) {
            wrapper.eq(MeetingRoom::getStatus, query.getStatus().trim());
        }
        if (Boolean.TRUE.equals(query.getBookableOnly())) {
            wrapper.eq(MeetingRoom::getBookable, 1).eq(MeetingRoom::getStatus, MeetingConstants.ROOM_ACTIVE);
        }
        // 排序从城市开始：跨城办公时同一列表里先按城市聚拢，行政不会看串栋
        wrapper.orderByAsc(MeetingRoom::getCity)
                .orderByAsc(MeetingRoom::getCampus).orderByAsc(MeetingRoom::getBuilding)
                .orderByAsc(MeetingRoom::getFloorCode).orderByAsc(MeetingRoom::getRoomNo);
        return wrapper;
    }

    /** 房间数量级在几十到几百，统计直接按同条件取列表后在内存汇总，不为四个数字写四条 count SQL */
    private MeetingRoomDto.Stats buildStats(MeetingRoomDto.Query query) {
        List<MeetingRoom> rooms = roomMapper.selectList(buildWrapper(query));
        MeetingRoomDto.Stats stats = new MeetingRoomDto.Stats();
        stats.setTotal(rooms.size());
        stats.setActive(rooms.stream().filter(r -> MeetingConstants.ROOM_ACTIVE.equals(r.getStatus())).count());
        stats.setBookable(rooms.stream().filter(this::isBookable).count());
        stats.setSeatsTotal(rooms.stream().mapToLong(r -> r.getCapacity() == null ? 0 : r.getCapacity()).sum());
        return stats;
    }

    private boolean isBookable(MeetingRoom room) {
        return Objects.requireNonNullElse(room.getBookable(), 0) == 1
                && MeetingConstants.ROOM_ACTIVE.equals(room.getStatus());
    }

    private MeetingRoomDto.Slot toSlot(MeetingBooking booking, boolean hideTitle) {
        MeetingRoomDto.Slot slot = new MeetingRoomDto.Slot();
        slot.setRoomId(booking.getRoomId());
        slot.setBookingNo(hideTitle ? null : booking.getBookingNo());
        slot.setTitle(hideTitle ? OCCUPIED_LABEL : booking.getTitle());
        slot.setOrganizerName(hideTitle ? "" : booking.getOrganizerName());
        slot.setStartTime(com.mftb.admin.util.DateTimeUtils.format(booking.getStartTime()));
        slot.setEndTime(com.mftb.admin.util.DateTimeUtils.format(booking.getEndTime()));
        return slot;
    }

    private MeetingRoom requireRoom(long id) {
        MeetingRoom room = roomMapper.selectById(id);
        if (room == null) {
            throw new BusinessException("會議室不存在或已刪除");
        }
        return room;
    }

    /**
     * 表单 → 实体：只搬档案与规则列，审计列与预留列由服务端决定。
     *
     * <p>空值口径按列的 DDL 分两类，不能一刀切：
     * <ul>
     *   <li>档案列（园区/楼栋/楼层/位置/设备/管理员）DDL 是 {@code NOT NULL DEFAULT ''}，
     *       而 update 逐列显式 set（见 {@link #update}），实体里留 null 就会被写成 null 撞约束，
     *       表现为「行政什么都没改、点保存就报数据库异常」。这类列一律落空串。</li>
     *   <li>规则列（可预约窗/时长上下限/未签到释放分钟）用 NULL 表达「本房间未单独配置、回落全局」，
     *       是业务语义而不是缺失值，必须保持 null。</li>
     * </ul>
     */
    private void applyForm(MeetingRoom room, MeetingRoomDto.Form form) {
        room.setRoomNo(form.getRoomNo().trim());
        room.setRoomName(form.getRoomName().trim());
        room.setCity(emptyToBlank(form.getCity()));
        room.setCampus(emptyToBlank(form.getCampus()));
        room.setBuilding(emptyToBlank(form.getBuilding()));
        room.setFloorCode(emptyToBlank(form.getFloorCode()));
        room.setLocationDesc(emptyToBlank(form.getLocationDesc()));
        room.setCapacity(form.getCapacity());
        room.setFacilities(wrapCodes(form.getFacilities()));
        room.setPhotoUrls(form.getPhotoUrls() == null || form.getPhotoUrls().isEmpty()
                ? null : JsonUtils.toJson(form.getPhotoUrls()));
        room.setStatus(defaultStatus(form.getStatus()));
        room.setBookable(Boolean.FALSE.equals(form.getBookable()) ? 0 : 1);
        room.setBookableStartTime(parseTime(form.getBookableStartTime(), "每日可預約開始時間"));
        room.setBookableEndTime(parseTime(form.getBookableEndTime(), "每日可預約結束時間"));
        room.setMinDuration(positiveOrEmpty(form.getMinDuration(), "最短會議時長"));
        room.setMaxDuration(positiveOrEmpty(form.getMaxDuration(), "最長會議時長"));
        room.setCheckinRequired(Boolean.TRUE.equals(form.getCheckinRequired()) ? 1 : 0);
        room.setReleaseAfterMinutes(positiveOrEmpty(form.getReleaseAfterMinutes(), "未簽到自動釋放分鐘數"));
        room.setHideTitle(Boolean.TRUE.equals(form.getHideTitle()) ? 1 : 0);
        room.setAdminUserIds(wrapIds(form.getAdminUserIds()));
        room.setRemark(trim(form.getRemark()));
        validateRuleColumns(room);
    }

    /**
     * 规则列自洽校验。
     *
     * <p>DB 的 CHECK 只挡得住"同时提交的两列都非法"，挡不住"上限 30、下限 60 分两次保存"
     * ——每次保存都只改一列，落库时另一列还是旧值。所以两列必须一起比对。
     */
    private void validateRuleColumns(MeetingRoom room) {
        LocalTime start = room.getBookableStartTime();
        LocalTime end = room.getBookableEndTime();
        if (start != null && end != null && !end.isAfter(start)) {
            throw new BusinessException("每日可預約結束時間必須晚於開始時間");
        }
        if ((start == null) != (end == null)) {
            throw new BusinessException("每日可預約起止時間需一起填寫或一起清空");
        }
        Integer min = room.getMinDuration();
        Integer max = room.getMaxDuration();
        if (min != null && max != null && max < min) {
            throw new BusinessException("最長會議時長不得小於最短時長");
        }
    }

    private String defaultStatus(String status) {
        String value = StringUtils.hasText(status) ? status.trim() : MeetingConstants.ROOM_ACTIVE;
        if (!ROOM_STATUSES.contains(value)) {
            throw new BusinessException("不支持的會議室狀態：" + value);
        }
        return value;
    }

    private int requireVersion(Integer version) {
        if (version == null) {
            throw new BusinessException("缺少版本號，請刷新後重試");
        }
        return version;
    }

    /**
     * 编号重复与并发覆盖的区分。
     *
     * <p>更新失败有两种成因：版本对不上（有人先改了）与编号撞上别的房。
     * 一律回"已被他人修改"会让人反复刷新却仍然失败，所以编号撞车要单独说清楚。
     */
    private String roomNoConflictMessage(long id, String roomNo, String fallback) {
        Long duplicated = roomMapper.selectCount(new LambdaQueryWrapper<MeetingRoom>()
                .eq(MeetingRoom::getRoomNo, roomNo == null ? "" : roomNo.trim())
                .ne(MeetingRoom::getId, id));
        return duplicated != null && duplicated > 0
                ? "會議室編號已存在：" + roomNo : fallback;
    }

    private MeetingRoomDto.VO toVO(MeetingRoom room) {
        MeetingRoomDto.VO vo = new MeetingRoomDto.VO();
        vo.setId(room.getId());
        vo.setRoomNo(room.getRoomNo());
        vo.setRoomName(room.getRoomName());
        vo.setCity(room.getCity());
        vo.setCampus(room.getCampus());
        vo.setBuilding(room.getBuilding());
        vo.setFloorCode(room.getFloorCode());
        vo.setLocationDesc(room.getLocationDesc());
        vo.setLocationText(locationText(room));
        vo.setCapacity(room.getCapacity());
        vo.setFacilities(parseFacilities(room.getFacilities()));
        vo.setPhotoUrls(JsonUtils.parseStringList(room.getPhotoUrls()));
        vo.setStatus(room.getStatus());
        vo.setBookable(isBookable(room));
        vo.setBookableStartTime(room.getBookableStartTime() == null ? null : room.getBookableStartTime().format(TIME_FORMAT));
        vo.setBookableEndTime(room.getBookableEndTime() == null ? null : room.getBookableEndTime().format(TIME_FORMAT));
        vo.setMinDuration(room.getMinDuration());
        vo.setMaxDuration(room.getMaxDuration());
        vo.setCheckinRequired(Objects.requireNonNullElse(room.getCheckinRequired(), 0) == 1);
        vo.setReleaseAfterMinutes(room.getReleaseAfterMinutes());
        vo.setHideTitle(Objects.requireNonNullElse(room.getHideTitle(), 0) == 1);
        vo.setAdminUserIds(parseIds(room.getAdminUserIds()));
        vo.setRemark(room.getRemark());
        vo.setVersion(room.getVersion());
        vo.setCreatedBy(room.getCreatedBy());
        vo.setCreatedAt(com.mftb.admin.util.DateTimeUtils.format(room.getCreatedAt()));
        vo.setUpdatedBy(room.getUpdatedBy());
        vo.setUpdatedAt(com.mftb.admin.util.DateTimeUtils.format(room.getUpdatedAt()));
        return vo;
    }

    /** 审计快照：只取会影响预约结果的字段，全量实体进 JSON 会让轨迹页没法读 */
    private Map<String, Object> snapshot(MeetingRoom room) {
        Map<String, Object> map = new java.util.LinkedHashMap<>();
        map.put("roomNo", room.getRoomNo());
        map.put("roomName", room.getRoomName());
        map.put("city", room.getCity());
        map.put("campus", room.getCampus());
        map.put("building", room.getBuilding());
        map.put("floorCode", room.getFloorCode());
        map.put("capacity", room.getCapacity());
        map.put("facilities", parseFacilities(room.getFacilities()));
        map.put("status", room.getStatus());
        map.put("bookable", room.getBookable());
        map.put("bookableStartTime", room.getBookableStartTime() == null ? null : room.getBookableStartTime().format(TIME_FORMAT));
        map.put("bookableEndTime", room.getBookableEndTime() == null ? null : room.getBookableEndTime().format(TIME_FORMAT));
        map.put("minDuration", room.getMinDuration());
        map.put("maxDuration", room.getMaxDuration());
        map.put("checkinRequired", room.getCheckinRequired());
        map.put("releaseAfterMinutes", room.getReleaseAfterMinutes());
        map.put("hideTitle", room.getHideTitle());
        return map;
    }

    /** 批量装填房间管理员姓名：不在循环里逐间查 */
    private void attachAdminUserNames(List<MeetingRoomDto.VO> records) {
        Set<Long> userIds = records.stream()
                .flatMap(vo -> vo.getAdminUserIds().stream())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (userIds.isEmpty()) {
            records.forEach(vo -> vo.setAdminUserNames(""));
            return;
        }
        Map<Long, String> names = userMapper.selectBatchIds(userIds).stream()
                .collect(Collectors.toMap(SysUser::getId,
                        user -> StringUtils.hasText(user.getName()) ? user.getName() : user.getUsername(),
                        (left, right) -> left));
        for (MeetingRoomDto.VO vo : records) {
            vo.setAdminUserNames(vo.getAdminUserIds().stream()
                    .map(id -> names.getOrDefault(id, "已刪除用戶"))
                    .collect(Collectors.joining("、")));
        }
    }

    /** 城市+园区+楼栋+楼层+描述：城市必须在最前，跨城同名会议室靠它区分 */
    private static String locationText(MeetingRoom room) {
        return Stream.of(room.getCity(), room.getCampus(), room.getBuilding(), room.getFloorCode(), room.getLocationDesc())
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.joining(" · "));
    }

    /** 不含城市的位置串：城市单独成字段展示时用，避免与 locationText 里的城市双写 */
    private static String locationBody(MeetingRoom room) {
        return Stream.of(room.getCampus(), room.getBuilding(), room.getFloorCode(), room.getLocationDesc())
                .filter(StringUtils::hasText)
                .map(String::trim)
                .collect(Collectors.joining(" · "));
    }

    /** 设备列格式：,CODE,CODE,；无设备落空串（列是 NOT NULL DEFAULT ''，落 null 会撞约束） */
    private static String wrapCodes(List<String> codes) {
        if (codes == null || codes.isEmpty()) {
            return "";
        }
        String joined = codes.stream().filter(StringUtils::hasText).map(String::trim).distinct()
                .collect(Collectors.joining(","));
        return joined.isEmpty() ? "" : "," + joined + ",";
    }

    private static List<String> parseFacilities(String column) {
        if (!StringUtils.hasText(column)) {
            return List.of();
        }
        return Arrays.stream(column.split(",")).map(String::trim)
                .filter(StringUtils::hasText)
                .filter(MeetingConstants.FACILITY_CODES::contains)
                .distinct()
                .toList();
    }

    /** 管理员列格式：,ID,ID,；无人管理落空串（同上：列 NOT NULL，且清空管理员是正当操作，不能变成保存失败） */
    private static String wrapIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return "";
        }
        String joined = ids.stream().filter(Objects::nonNull).distinct()
                .map(String::valueOf).collect(Collectors.joining(","));
        return joined.isEmpty() ? "" : "," + joined + ",";
    }

    private static List<Long> parseIds(String column) {
        if (!StringUtils.hasText(column)) {
            return List.of();
        }
        List<Long> ids = new ArrayList<>();
        for (String part : column.split(",")) {
            String value = part.trim();
            if (value.isEmpty()) {
                continue;
            }
            try {
                ids.add(Long.parseLong(value));
            } catch (NumberFormatException e) {
                // 脏数据只跳过不抛异常：档案页因为一个历史脏 ID 打不开是不成比例的后果
                log.warn("会议室管理员 ID 解析失败，已跳过: value={}", value);
            }
        }
        return ids.stream().distinct().toList();
    }

    private static LocalTime parseTime(String value, String label) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            return LocalTime.parse(value.trim());
        } catch (RuntimeException e) {
            throw new BusinessException(label + "格式不正確，應為 HH:mm");
        }
    }

    private static Integer positiveOrEmpty(Integer value, String label) {
        if (value == null) {
            return null;
        }
        if (value <= 0) {
            throw new BusinessException(label + "必須大於 0");
        }
        return value;
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    /** 档案列专用：null 与空串一律归一成空串，与 DDL 的 {@code NOT NULL DEFAULT ''} 对齐 */
    private static String emptyToBlank(String value) {
        return value == null ? "" : value.trim();
    }
}
