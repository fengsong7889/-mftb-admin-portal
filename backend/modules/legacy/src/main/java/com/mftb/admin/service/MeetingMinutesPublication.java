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
import com.mftb.admin.entity.MeetingMinutesItemOwner;
import com.mftb.admin.entity.MeetingMinutesRevision;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesItemMapper;
import com.mftb.admin.mapper.MeetingMinutesItemOwnerMapper;
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
 *
 * <p>负责人以 {@code biz_meeting_minutes_item_owner} 为唯一真源：一条事项可以有多个负责人
 * （主办 + 协办），事项行上的三个 owner 列只是 owners[0] 的缓存，两处写入在同一事务内完成。
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
    private final MeetingMinutesAttachmentService attachmentService;
    private final MeetingMinutesItemOwnerMapper ownerMapper;

    /** 先校结构再解引用，避免空数组成员造成 500；客户端署名和确认凭据不采信。 */
    public void normalize(MeetingMinutesContent content, MeetingMinutesContent previous, SysUser operator) {
        content.validate();
        if (!content.versioned()) return;
        Set<Long> ids = new HashSet<>();
        if (content.getChairUserId() != null) ids.add(content.getChairUserId());
        for (var action : list(content.getActions())) ids.addAll(action.ownerUserIdList());
        for (var issue : list(content.getOpenIssues())) ids.addAll(issue.ownerUserIdList());
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
            Owners owners = resolveOwners(action.ownerUserIdList(), people);
            action.setOwnerIds(owners.ids());
            action.setOwnerNames(owners.names());
            action.setOwnerEmpNos(owners.empNos());
            action.setOwnerUserId(owners.headId());
            action.setOwnerName(owners.headName());
            action.setOwnerEmpNo(owners.headEmpNo());
        }
        for (var issue : list(content.getOpenIssues())) {
            Owners owners = resolveOwners(issue.ownerUserIdList(), people);
            issue.setOwnerIds(owners.ids());
            issue.setOwnerNames(owners.names());
            issue.setOwnerEmpNos(owners.empNos());
            issue.setOwnerUserId(owners.headId());
            issue.setOwnerName(owners.headName());
            issue.setOwnerEmpNo(owners.headEmpNo());
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
        // 发布定格：正文引用的绑定附件进入不可物理删除状态，历史版本永不缺文件
        attachmentService.markPublished(minutes, content, current);
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
        for (var action : list(content.getActions())) ids.addAll(action.ownerUserIdList());
        for (var issue : list(content.getOpenIssues())) ids.addAll(issue.ownerUserIdList());
        Map<Long, SysUser> users = userMapper.selectBatchIds(ids).stream().collect(Collectors.toMap(SysUser::getId, Function.identity()));
        for (Long id : ids) if (users.get(id) == null || !Integer.valueOf(1).equals(users.get(id).getStatus())) {
            throw new BusinessException("主持人或事項負責人已停用，請編輯草稿後重新發布");
        }
    }

    /**
     * 一組负责人：id 与两份快照按下标对齐。
     * <p>head* 就是事项行上 owner_user_id/owner_name/owner_emp_no 三列缓存的来源，
     * 顺序由提交时的选择顺序决定（主办在前），所以下标不能交给数据库去定。
     */
    record Owners(List<Long> ids, List<String> names, List<String> empNos) {
        Long headId() {
            return ids.isEmpty() ? null : ids.get(0);
        }

        String headName() {
            return ids.isEmpty() ? null : snapshotAt(names, 0);
        }

        String headEmpNo() {
            return ids.isEmpty() ? null : snapshotAt(empNos, 0);
        }
    }

    /**
     * 读取归一：数组缺失（旧 jar 写的草稿只有单值字段）时按一人处理，姓名与工号回退单值缓存。
     * <p>不做这层归一，“旧草稿零迁移可读”就是空话：新 jar 拿到旧草稿会把负责人姓名发空，
     * 而事项行的 owner_name 是 NOT NULL 列，直接写坏台账。
     */
    private static Owners ownersOf(List<Long> ids, List<String> names, List<String> empNos,
                                   Long legacyId, String legacyName, String legacyEmpNo) {
        if (ids != null && !ids.isEmpty()) {
            return new Owners(ids, orEmpty(names), orEmpty(empNos));
        }
        if (legacyId == null) {
            return new Owners(List.of(), List.of(), List.of());
        }
        return new Owners(List.of(legacyId), List.of(Objects.toString(legacyName, "")),
                List.of(Objects.toString(legacyEmpNo, "")));
    }

    /**
     * 负责人快照一律按 id 回查 sys_user 重建。
     * <p>旧草稿正文里只有单值字段，归一为一人生效；前端传来的姓名与工号一律不采信，
     * 它们只能当读取线索——允许自报姓名等于允许在纪要里写任意“负责人”。
     */
    private static Owners resolveOwners(List<Long> ids, Map<Long, SysUser> people) {
        List<String> names = new ArrayList<>(ids.size());
        List<String> empNos = new ArrayList<>(ids.size());
        for (Long id : ids) {
            SysUser user = people.get(id);
            names.add(user == null ? null : user.getName());
            empNos.add(user == null ? null : user.getEmpId());
        }
        return new Owners(List.copyOf(ids), List.copyOf(names), List.copyOf(empNos));
    }

    private List<Long> synchronizeItems(MeetingMinutes minutes, MeetingMinutesContent content) {
        Map<Long, MeetingMinutesItem> rows = itemMapper.findByMinutes(minutes.getId()).stream()
                .collect(Collectors.toMap(MeetingMinutesItem::getId, Function.identity()));
        // 旧负责人集合只取一次：已办结事项要比较“换了人没有”，逐条查会变成 N+1
        Map<Long, List<Long>> previousOwners = ownerMapper.findByMinutesIds(List.of(minutes.getId())).stream()
                .collect(Collectors.groupingBy(MeetingMinutesItemOwner::getItemId,
                        Collectors.mapping(MeetingMinutesItemOwner::getUserId, Collectors.toList())));
        List<Long> retained = new ArrayList<>();
        int order = 0;
        int actionSeq = itemMapper.nextStableSeq(minutes.getId(), MeetingMinutesItem.KIND_ACTION);
        for (var action : list(content.getActions())) {
            Owners owners = ownersOf(action.getOwnerIds(), action.getOwnerNames(), action.getOwnerEmpNos(),
                    action.getOwnerUserId(), action.getOwnerName(), action.getOwnerEmpNo());
            MeetingMinutesItem item = definition(minutes, rows, action.getItemId(), MeetingMinutesItem.KIND_ACTION,
                    action.getContent(), owners, previousOwners.getOrDefault(action.getItemId(), List.of()),
                    action.getDueDate(), action.getTopicKey(), action.getDeliverable(), ++order);
            persistDefinition(item, actionSeq++);
            action.setItemId(item.getId());
            replaceOwners(item.getId(), owners);
            retained.add(item.getId());
        }
        order = 0;
        int followSeq = itemMapper.nextStableSeq(minutes.getId(), MeetingMinutesItem.KIND_FOLLOW);
        for (var issue : list(content.getOpenIssues())) {
            Owners owners = ownersOf(issue.getOwnerIds(), issue.getOwnerNames(), issue.getOwnerEmpNos(),
                    issue.getOwnerUserId(), issue.getOwnerName(), issue.getOwnerEmpNo());
            MeetingMinutesItem item = definition(minutes, rows, issue.getItemId(), MeetingMinutesItem.KIND_FOLLOW,
                    issue.getContent(), owners, previousOwners.getOrDefault(issue.getItemId(), List.of()),
                    issue.getDueDate(), issue.getTopicKey(), "", ++order);
            persistDefinition(item, followSeq++);
            issue.setItemId(item.getId());
            replaceOwners(item.getId(), owners);
            retained.add(item.getId());
        }
        for (MeetingMinutesItem row : rows.values()) if (!retained.contains(row.getId())) {
            if (itemMapper.retire(minutes.getId(), row.getId(), row.getVersion()) != 1) throw new BusinessException("事項已變更，請刷新後重試");
        }
        return retained;
    }

    private MeetingMinutesItem definition(MeetingMinutes minutes, Map<Long, MeetingMinutesItem> rows, Long id,
                                          String kind, String text, Owners owners, List<Long> beforeOwners,
                                          String due, String topic, String deliverable, int order) {
        requireItem(rows, id, kind);
        MeetingMinutesItem old = id == null ? null : rows.get(id);
        // 真源行缺失（没跑过 334 回填的库）时，事项行的首负责人缓存就是当时唯一的负责人事实；
        // 拿空集合去比较会把“重发同一版纪要”误判成换了人，已办结事项反而再也发不出去
        List<Long> before = beforeOwners.isEmpty() && old != null && old.getOwnerUserId() != null
                ? List.of(old.getOwnerUserId()) : beforeOwners;
        // 已办理事项不能改成另一份责任约定后继承完成事实；可保留原项或删除后新增。
        // 负责人比较的是全量集合而不是首负责人：换了协办同样是一份新约定。
        if (old != null && MeetingMinutesItem.STATUS_DONE.equals(old.getStatus())
                && (!Objects.equals(old.getContent(), text) || !sameOwners(owners.ids(), before)
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
        item.setOwnerUserId(owners.headId());
        item.setOwnerName(owners.headName());
        item.setOwnerEmpNo(Objects.toString(owners.headEmpNo(), ""));
        item.setDueDate(LocalDate.parse(due));
        item.setTopicKey(topic);
        item.setDeliverable(Objects.toString(deliverable, ""));
        item.setDisplayOrder(order);
        item.setVersion(old == null ? 0 : old.getVersion());
        return item;
    }

    /** 集合语义比较：顺序只决定展示与缓存取谁，不构成一份新的责任约定 */
    private static boolean sameOwners(List<Long> current, List<Long> previous) {
        return new HashSet<>(orEmpty(current)).equals(new HashSet<>(orEmpty(previous)));
    }

    /**
     * 整体替换一条事项的负责人：先删后插，且与事项行写入处于同一个发布事务。
     * <p>不逐条 diff：中间态下这条事项会“谁都不是负责人”，而逾期扫描与办理权限都读这张表。
     */
    private void replaceOwners(Long itemId, Owners owners) {
        if (itemId == null) throw new IllegalStateException("事項主鍵未回填，負責人無法登記");
        replaceOwners(itemId.longValue(), owners);
    }

    private void replaceOwners(long itemId, Owners owners) {
        ownerMapper.deleteByItem(itemId);
        if (owners.ids().isEmpty()) {
            return;
        }
        List<MeetingMinutesItemOwner> rows = new ArrayList<>(owners.ids().size());
        for (int index = 0; index < owners.ids().size(); index++) {
            MeetingMinutesItemOwner row = new MeetingMinutesItemOwner();
            row.setItemId(itemId);
            row.setUserId(owners.ids().get(index));
            row.setUserName(Objects.toString(snapshotAt(owners.names(), index), ""));
            row.setEmpNo(Objects.toString(snapshotAt(owners.empNos(), index), ""));
            row.setSeq(index + 1);
            rows.add(row);
        }
        ownerMapper.insertBatch(rows);
    }

    private static String snapshotAt(List<String> values, int index) {
        return index < values.size() ? values.get(index) : null;
    }

    private static <T> List<T> orEmpty(List<T> value) {
        return value == null ? List.of() : value;
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
        // 附件元数据随发布定格：历史版本能说明"当时发的是哪几个文件、叫什么名、多大"，
        // 后续草稿解绑/改名都不会改写已发布快照的阅读口径
        document.setAttachments(attachmentService.resolve(content.getAttachments()).stream().map(row -> {
            MeetingMinutesDocument.AttachmentRef ref = new MeetingMinutesDocument.AttachmentRef();
            ref.setAttachmentNo(row.getAttachmentNo());
            ref.setFileName(row.getFileName());
            ref.setMimeType(row.getMimeType());
            ref.setSizeBytes(row.getSizeBytes());
            ref.setPreviewKind(row.getPreviewKind());
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
