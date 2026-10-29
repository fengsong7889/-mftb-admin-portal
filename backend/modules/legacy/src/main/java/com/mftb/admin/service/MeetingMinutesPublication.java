package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.dto.MeetingMinutesDocument;
import com.mftb.admin.dto.MeetingMinutesDto;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesItem;
import com.mftb.admin.entity.MeetingMinutesRevision;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesItemMapper;
import com.mftb.admin.mapper.MeetingMinutesLinkMapper;
import com.mftb.admin.mapper.MeetingMinutesMapper;
import com.mftb.admin.mapper.MeetingMinutesRevisionMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 新版文档的规范化与发布事务步骤。调用者必须先鉴权并持有纪要主行锁。
 * 草稿不写跟进台账，只有发布把稳定事项身份和完整文档一起提交。
 */
@Component
@RequiredArgsConstructor
public class MeetingMinutesPublication {
    private final MeetingMinutesMapper minutesMapper;
    private final MeetingMinutesRevisionMapper revisionMapper;
    private final MeetingMinutesItemMapper itemMapper;
    private final MeetingMinutesLinkMapper linkMapper;
    private final SysUserMapper userMapper;
    private final MeetingAuditRecorder audit;

    /** 先校结构再解引用，避免空数组成员造成 500；客户端署名和确认凭据不采信。 */
    public void normalize(MeetingMinutesContent content, MeetingMinutesContent previous, SysUser operator) {
        content.validate();
        if (!content.versioned()) return;
        Set<Long> ids = new HashSet<>();
        if (content.getChairUserId() != null) ids.add(content.getChairUserId());
        for (var action : list(content.getActions())) if (action.getOwnerUserId() != null) ids.add(action.getOwnerUserId());
        for (var issue : list(content.getOpenIssues())) if (issue.getOwnerUserId() != null) ids.add(issue.getOwnerUserId());
        for (var person : list(content.getAttendance())) if (person.getUserId() != null) ids.add(person.getUserId());
        for (var person : list(content.getAbsentees())) if (person.getUserId() != null) ids.add(person.getUserId());
        Map<Long, SysUser> people = ids.isEmpty() ? new HashMap<>() : userMapper.selectBatchIds(ids).stream()
                .collect(Collectors.toMap(SysUser::getId, Function.identity()));
        for (Long id : ids) {
            SysUser user = people.get(id);
            if (user == null || !Integer.valueOf(1).equals(user.getStatus())) {
                throw new BusinessException("紀要中的員工不存在、已停用或離職，請重新選擇");
            }
        }
        SysUser chair = people.get(content.getChairUserId());
        content.setChairName(chair == null ? null : chair.getName());
        content.setChairEmpNo(chair == null ? null : chair.getEmpId());
        for (var topic : list(content.getItems())) {
            if (!StringUtils.hasText(topic.getTopicKey())) topic.setTopicKey(UUID.randomUUID().toString());
        }
        for (var action : list(content.getActions())) {
            SysUser owner = people.get(action.getOwnerUserId());
            action.setOwnerName(owner == null ? null : owner.getName());
            action.setOwnerEmpNo(owner == null ? null : owner.getEmpId());
        }
        for (var issue : list(content.getOpenIssues())) {
            SysUser owner = people.get(issue.getOwnerUserId());
            issue.setOwnerName(owner == null ? null : owner.getName());
            issue.setOwnerEmpNo(owner == null ? null : owner.getEmpId());
            issue.setNeedDecisionBy(null);
        }
        Map<String, MeetingMinutesContent.Attendance> old = new HashMap<>();
        if (previous != null) for (var person : list(previous.getAttendance())) old.put(attendanceKey(person), person);
        for (var person : list(content.getAttendance())) {
            SysUser user = people.get(person.getUserId());
            if (user != null) person.setName(user.getName());
            person.setEmpNo(user == null ? null : user.getEmpId());
            var former = old.get(attendanceKey(person));
            boolean unchanged = former != null && Objects.equals(former.getStatus(), person.getStatus())
                    && Objects.equals(former.getReason(), person.getReason());
            person.setSource("manual_confirmation");
            person.setConfirmedByName(unchanged ? former.getConfirmedByName() : operator.getName());
            person.setConfirmedAt(unchanged ? former.getConfirmedAt() : DateTimeUtils.format(LocalDateTime.now()));
        }
        for (var person : list(content.getAbsentees())) {
            SysUser user = people.get(person.getUserId());
            if (user != null) person.setName(user.getName());
            person.setEmpNo(user == null ? null : user.getEmpId());
        }
        content.validate();
    }

    private static String attendanceKey(MeetingMinutesContent.Attendance person) {
        return person.getUserId() == null ? "external:" + person.getName().trim() : "user:" + person.getUserId();
    }

    /** 仅校验身份，不在保存草稿时改变事项定义、办理状态或提醒。 */
    public void validateItemIds(MeetingMinutes minutes, MeetingMinutesContent content) {
        Map<Long, MeetingMinutesItem> current = minutes == null ? Map.of() : itemMapper.findByMinutes(minutes.getId())
                .stream().collect(Collectors.toMap(MeetingMinutesItem::getId, Function.identity()));
        for (var action : list(content.getActions())) requireItem(current, action.getItemId(), MeetingMinutesItem.KIND_ACTION);
        for (var issue : list(content.getOpenIssues())) requireItem(current, issue.getItemId(), MeetingMinutesItem.KIND_FOLLOW);
    }

    private static void requireItem(Map<Long, MeetingMinutesItem> current, Long id, String kind) {
        if (id == null) return;
        MeetingMinutesItem item = current.get(id);
        if (item == null || !kind.equals(item.getKind())) throw new BusinessException("事項不存在或不屬於此紀要，請刷新後重試");
    }

    /** 引用与正文一起决定是否存在未发布修改，办理和通知不会改变此摘要。 */
    public String draftHash(MeetingMinutesContent content, List<Long> references) {
        return hash(List.of(content, list(references).stream().sorted().toList()));
    }

    public List<Long> referenceIds(long minutesId) {
        return linkMapper.findByMinutes(minutesId).stream().map(link -> link.getLinkedMinutesId()).sorted().toList();
    }

    public MeetingMinutesRevision publish(MeetingMinutes minutes, MeetingBooking booking, SysUser current,
                                           MeetingMinutesDto.PublishForm form) {
        String key = requestKey(form == null ? null : form.getRequestKey());
        if (form.getVersion() == null || form.getVersion() < 0) throw new BusinessException("缺少草稿版本");
        String note = Objects.toString(form.getChangeNote(), "").trim();
        if (note.length() > 200) throw new BusinessException("修訂說明最多 200 字");
        String requestHash = hash(List.of(form.getVersion(), note, current.getId()));
        MeetingMinutesRevision replay = revisionMapper.findByRequest(minutes.getId(), key);
        if (replay != null) {
            if (!requestHash.equals(replay.getRequestHash())) throw new BusinessException("同一發布識別碼不可用於不同請求");
            return replay;
        }
        if (!Objects.equals(minutes.getVersion(), form.getVersion())) throw new BusinessException("紀要已被他人修改，請刷新後重試");
        MeetingMinutesContent content = JsonUtils.parse(minutes.getContentJson(), MeetingMinutesContent.class);
        if (content == null) throw new BusinessException("紀要正文無法解析，請重新保存");
        content.validateForPublication();
        validateItemIds(minutes, content);
        MeetingMinutesRevision previous = current(minutes);
        String beforeHash = draftHash(content, referenceIds(minutes.getId()));
        if (previous != null && beforeHash.equals(previous.getDraftHash())) throw new BusinessException("草稿沒有變更，無需重複發布");
        if (previous != null && note.isEmpty()) throw new BusinessException("再次發布必須填寫修訂說明");
        // 保存与发布之间员工可能停用，重验可用性；已经保存的姓名和出席确认仍按草稿冻结。
        validatePeopleForPublish(content);
        List<Long> itemIds = synchronizeItems(minutes, content);
        String draftHash = draftHash(content, referenceIds(minutes.getId()));
        int number = revisionMapper.nextRevisionNo(minutes.getId());
        MeetingMinutesDocument document = document(minutes, booking, content);
        document.setRevisionNo(number);
        document.setPublisherName(current.getName());
        document.setPublisherEmpNo(current.getEmpId());
        LocalDateTime now = LocalDateTime.now().withNano(0);
        document.setPublishedAt(DateTimeUtils.format(now));
        document.setChangeNote(note);
        MeetingMinutesRevision revision = new MeetingMinutesRevision();
        revision.setMinutesId(minutes.getId());
        revision.setRevisionNo(number);
        revision.setSchemaVersion(MeetingMinutesContent.DOCUMENT_SCHEMA);
        revision.setDocumentSnapshot(JsonUtils.toJson(document));
        revision.setDigest(content.digest());
        revision.setChangeNote(note);
        revision.setPublisherUserId(current.getId());
        revision.setPublisherName(current.getName());
        revision.setPublisherEmpNo(Objects.toString(current.getEmpId(), ""));
        revision.setPublishedAt(now);
        revision.setDraftVersion(form.getVersion());
        revision.setDraftHash(draftHash);
        revision.setRequestKey(key);
        revision.setRequestHash(requestHash);
        revision.setCreatedBy(current.getName());
        revision.setUpdatedBy(current.getName());
        revisionMapper.insert(revision);
        if (!itemIds.isEmpty()) itemMapper.bindPublication(minutes.getId(), itemIds, revision.getId());
        if (minutesMapper.update(null, new LambdaUpdateWrapper<MeetingMinutes>()
                .eq(MeetingMinutes::getId, minutes.getId()).eq(MeetingMinutes::getVersion, form.getVersion())
                .set(MeetingMinutes::getPublishedRevisionId, revision.getId())
                .set(MeetingMinutes::getContentJson, JsonUtils.toJson(content))
                .set(MeetingMinutes::getDraftHash, draftHash).set(MeetingMinutes::getVersion, form.getVersion() + 1)
                .set(MeetingMinutes::getUpdatedBy, current.getName()).set(MeetingMinutes::getUpdatedAt, now)) != 1) {
            throw new BusinessException("紀要已被他人修改，請刷新後重試");
        }
        audit.recordBooking(booking.getId(), booking.getRoomId(), booking.getBookingNo(),
                MeetingConstants.EVENT_MINUTES_PUBLISH, "發布紀要 " + minutes.getMinutesNo() + " V" + number,
                null, Map.of("revisionId", revision.getId(), "revisionNo", number, "changeNote", note), current, key);
        return revision;
    }

    private void validatePeopleForPublish(MeetingMinutesContent content) {
        Set<Long> ids = new HashSet<>();
        ids.add(content.getChairUserId());
        for (var action : list(content.getActions())) ids.add(action.getOwnerUserId());
        for (var issue : list(content.getOpenIssues())) ids.add(issue.getOwnerUserId());
        Map<Long, SysUser> users = userMapper.selectBatchIds(ids).stream().collect(Collectors.toMap(SysUser::getId, Function.identity()));
        for (Long id : ids) if (users.get(id) == null || !Integer.valueOf(1).equals(users.get(id).getStatus())) {
            throw new BusinessException("主持人或事項負責人已停用，請編輯草稿後重新發布");
        }
    }

    private List<Long> synchronizeItems(MeetingMinutes minutes, MeetingMinutesContent content) {
        Map<Long, MeetingMinutesItem> rows = itemMapper.findByMinutes(minutes.getId()).stream()
                .collect(Collectors.toMap(MeetingMinutesItem::getId, Function.identity()));
        List<Long> retained = new ArrayList<>();
        int order = 0;
        int actionSeq = itemMapper.nextStableSeq(minutes.getId(), MeetingMinutesItem.KIND_ACTION);
        for (var action : list(content.getActions())) {
            MeetingMinutesItem item = definition(minutes, rows, action.getItemId(), MeetingMinutesItem.KIND_ACTION,
                    action.getContent(), action.getOwnerUserId(), action.getOwnerName(), action.getOwnerEmpNo(),
                    action.getDueDate(), action.getTopicKey(), action.getDeliverable(), ++order);
            persistDefinition(item, actionSeq++);
            action.setItemId(item.getId());
            retained.add(item.getId());
        }
        order = 0;
        int followSeq = itemMapper.nextStableSeq(minutes.getId(), MeetingMinutesItem.KIND_FOLLOW);
        for (var issue : list(content.getOpenIssues())) {
            MeetingMinutesItem item = definition(minutes, rows, issue.getItemId(), MeetingMinutesItem.KIND_FOLLOW,
                    issue.getContent(), issue.getOwnerUserId(), issue.getOwnerName(), issue.getOwnerEmpNo(),
                    issue.getDueDate(), issue.getTopicKey(), "", ++order);
            persistDefinition(item, followSeq++);
            issue.setItemId(item.getId());
            retained.add(item.getId());
        }
        for (MeetingMinutesItem row : rows.values()) if (!retained.contains(row.getId())) {
            if (itemMapper.retire(minutes.getId(), row.getId(), row.getVersion()) != 1) throw new BusinessException("事項已變更，請刷新後重試");
        }
        return retained;
    }

    private MeetingMinutesItem definition(MeetingMinutes minutes, Map<Long, MeetingMinutesItem> rows, Long id,
                                          String kind, String text, Long owner, String name, String empNo,
                                          String due, String topic, String deliverable, int order) {
        requireItem(rows, id, kind);
        MeetingMinutesItem old = id == null ? null : rows.get(id);
        // 已办理事项不能改成另一份责任约定后继承完成事实；可保留原项或删除后新增。
        if (old != null && MeetingMinutesItem.STATUS_DONE.equals(old.getStatus())
                && (!Objects.equals(old.getContent(), text) || !Objects.equals(old.getOwnerUserId(), owner)
                || !Objects.equals(old.getDueDate(), LocalDate.parse(due))
                || !Objects.equals(Objects.toString(old.getDeliverable(), ""), Objects.toString(deliverable, "")))) {
            throw new BusinessException("已辦理事項不可更換約定或負責人，請保留原事項並新增一項");
        }
        MeetingMinutesItem item = new MeetingMinutesItem();
        item.setId(id);
        item.setMinutesId(minutes.getId());
        item.setBookingId(minutes.getBookingId());
        item.setKind(kind);
        item.setContent(text);
        item.setOwnerUserId(owner);
        item.setOwnerName(name);
        item.setOwnerEmpNo(Objects.toString(empNo, ""));
        item.setDueDate(LocalDate.parse(due));
        item.setTopicKey(topic);
        item.setDeliverable(Objects.toString(deliverable, ""));
        item.setDisplayOrder(order);
        item.setVersion(old == null ? 0 : old.getVersion());
        return item;
    }

    private void persistDefinition(MeetingMinutesItem item, int seq) {
        if (item.getId() == null) {
            item.setSeq(seq);
            item.setStatus(MeetingMinutesItem.STATUS_PENDING);
            item.setDeleted(0);
            itemMapper.insert(item);
        } else if (itemMapper.updateDefinition(item) != 1) {
            throw new BusinessException("事項已變更，請刷新後重試");
        }
    }

    public MeetingMinutesDocument document(MeetingMinutes minutes, MeetingBooking booking, MeetingMinutesContent content) {
        MeetingMinutesDocument document = new MeetingMinutesDocument();
        document.setMinutesNo(minutes.getMinutesNo());
        document.setBookingNo(minutes.getBookingNo());
        document.setMeetingTitle(minutes.getMeetingTitle());
        document.setMeetingTimeText(minutes.getMeetingTimeText());
        document.setRoomText(minutes.getRoomText());
        document.setMeetingType(booking.getBizType());
        document.setOrganizerName(minutes.getOrganizerName());
        document.setOrganizerEmpNo(booking.getOrganizerEmpNo());
        document.setRecorderName(minutes.getRecorderName());
        document.setRecorderEmpNo(minutes.getRecorderEmpNo());
        document.setExternalAttendees(booking.getExternalAttendees());
        document.setContent(content);
        document.setReferences(linkMapper.findByMinutes(minutes.getId()).stream().map(link -> {
            MeetingMinutesDocument.Reference ref = new MeetingMinutesDocument.Reference();
            ref.setMinutesId(link.getLinkedMinutesId());
            ref.setMinutesNo(link.getLinkedMinutesNo());
            ref.setBookingNo(link.getLinkedBookingNo());
            ref.setTitle(link.getLinkedTitle());
            ref.setTimeText(link.getLinkedTimeText());
            return ref;
        }).toList());
        return document;
    }

    public MeetingMinutesRevision current(MeetingMinutes minutes) {
        return minutes.getPublishedRevisionId() == null ? null : requireRevision(minutes.getId(), minutes.getPublishedRevisionId());
    }

    public MeetingMinutesRevision requireRevision(long minutesId, long revisionId) {
        MeetingMinutesRevision revision = revisionMapper.find(minutesId, revisionId);
        if (revision == null) throw new BusinessException("紀要版本不存在或無權查看");
        return revision;
    }

    public MeetingMinutesDocument decode(MeetingMinutesRevision revision) {
        MeetingMinutesDocument document = JsonUtils.parse(revision.getDocumentSnapshot(), MeetingMinutesDocument.class);
        if (document == null || document.getContent() == null) throw new BusinessException("紀要版本無法讀取");
        return document;
    }

    public MeetingMinutesDto.RevisionVO toVO(MeetingMinutesRevision revision, boolean includeDocument) {
        MeetingMinutesDto.RevisionVO vo = new MeetingMinutesDto.RevisionVO();
        vo.setId(revision.getId());
        vo.setRevisionNo(revision.getRevisionNo());
        vo.setChangeNote(revision.getChangeNote());
        vo.setPublisherName(revision.getPublisherName());
        vo.setPublisherEmpNo(revision.getPublisherEmpNo());
        vo.setPublishedAt(DateTimeUtils.format(revision.getPublishedAt()));
        if (includeDocument) vo.setDocument(decode(revision));
        return vo;
    }

    public List<MeetingMinutesDto.RevisionVO> summaries(long minutesId) {
        return revisionMapper.summaries(minutesId).stream().map(revision -> toVO(revision, false)).toList();
    }

    public static String requestKey(String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) throw new BusinessException("請提供有效的本次操作識別碼");
        return key;
    }

    public static String hash(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(JsonUtils.toJson(value).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("摘要算法不可用", e);
        }
    }

    private static <T> List<T> list(List<T> value) {
        return value == null ? List.of() : value;
    }
}
