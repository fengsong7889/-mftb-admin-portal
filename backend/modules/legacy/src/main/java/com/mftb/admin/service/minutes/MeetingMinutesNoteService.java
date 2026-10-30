package com.mftb.admin.service.minutes;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MeetingMinutesAiDto;
import com.mftb.admin.entity.MeetingBooking;
import com.mftb.admin.entity.MeetingMinutesAiExtraction;
import com.mftb.admin.entity.MeetingMinutesNote;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesAiExtractionMapper;
import com.mftb.admin.mapper.MeetingMinutesNoteMapper;
import com.mftb.admin.service.MeetingAccessGuard;
import com.mftb.admin.service.MeetingMinutesPublication;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * 个人会议笔记读写（自由文本录入的原始来源，与正式纪要隔离）。
 *
 * <p>保存不触发模型、不生成纪要编号、不动正式草稿版本；按「会议 + 当前用户」唯一，
 * 用笔记自己的 {@code version} 做乐观锁，多设备并发不 last-write-wins。
 */
@Service
@RequiredArgsConstructor
public class MeetingMinutesNoteService {

    static final int MAX_CHARS = MinutesAiPrompt.MAX_INPUT_CHARS;

    private final MeetingMinutesNoteMapper noteMapper;
    private final MeetingMinutesAiExtractionMapper extractionMapper;
    private final MeetingAccessGuard guard;
    private final MeetingMinutesAuthorizer authorizer;

    public MeetingMinutesAiDto.NoteVO read(long bookingId) {
        SysUser current = guard.currentUser();
        MeetingBooking booking = authorizer.requireBooking(bookingId);
        authorizer.requireBookingReadable(booking, current);
        MeetingMinutesAiDto.NoteVO vo = new MeetingMinutesAiDto.NoteVO();
        vo.setMaxChars(MAX_CHARS);
        MeetingMinutesNote note = noteMapper.findByOwner(bookingId, current.getId());
        MeetingMinutesAiExtraction latest = extractionMapper.findLatest(bookingId, current.getId());
        vo.setLastExtractionRequestKey(latest == null ? null : latest.getRequestKey());
        if (note == null) {
            vo.setExists(false);
            vo.setNoteVersion(0);
            vo.setRawText("");
            vo.setMentions(List.of());
            return vo;
        }
        vo.setExists(true);
        vo.setRawText(note.getRawText());
        vo.setMentions(JsonUtils.parseList(note.getMentionsJson(), MeetingMinutesAiDto.Mention.class));
        vo.setNoteVersion(note.getVersion());
        vo.setUpdatedAt(DateTimeUtils.format(note.getUpdatedAt()));
        return vo;
    }

    /**
     * 自动保存：新建（noteVersion=0）或带版本更新。同 requestKey + 同内容重放返回当前态不重复长版本。
     * 冲突（版本落后）抛业务异常，让界面保留本地并提示核对，不静默覆盖。
     */
    @Transactional(rollbackFor = Exception.class)
    public MeetingMinutesAiDto.NoteVO save(MeetingMinutesAiDto.NoteForm form) {
        SysUser current = guard.currentUser();
        if (form.getBookingId() == null) {
            throw new BusinessException("缺少會議編號");
        }
        String rawText = form.getRawText() == null ? "" : form.getRawText();
        if (rawText.length() > MAX_CHARS) {
            throw new BusinessException("筆記超過 " + MAX_CHARS + " 字上限，請分段處理");
        }
        String requestKey = requireKey(form.getRequestKey());
        // 尚无纪要走「可录入」，有纪要走「可编辑」——与 AI 提取同一把权限锚
        authorizer.requireEditableForBooking(form.getBookingId(), current);

        List<MeetingMinutesAiDto.Mention> mentions = sanitizeMentions(form.getMentions(), rawText);
        String mentionsJson = JsonUtils.toJson(mentions);
        String contentHash = sha256(rawText + "\u0000" + mentionsJson);
        int expectVersion = form.getNoteVersion() == null ? 0 : form.getNoteVersion();

        MeetingMinutesNote existing = noteMapper.findByOwner(form.getBookingId(), current.getId());
        if (existing == null) {
            if (expectVersion != 0) {
                throw new BusinessException("筆記版本不匹配，請刷新後重試");
            }
            MeetingMinutesNote note = new MeetingMinutesNote();
            note.setBookingId(form.getBookingId());
            note.setOwnerUserId(current.getId());
            note.setRawText(rawText);
            note.setMentionsJson(mentionsJson);
            note.setVersion(1);
            note.setContentHash(contentHash);
            note.setLastRequestKey(requestKey);
            note.setLastRequestHash(requestHash(requestKey, contentHash));
            note.setCreatedBy(current.getName());
            note.setUpdatedBy(current.getName());
            try {
                noteMapper.insert(note);
            } catch (DuplicateKeyException e) {
                // 并发首次保存：回读已存在的那条，不报系统异常
                return read(form.getBookingId());
            }
            return read(form.getBookingId());
        }
        // 同 requestKey 重放：命中已有幂等记录直接回当前态
        if (requestKey.equals(existing.getLastRequestKey())
                && requestHash(requestKey, existing.getContentHash()).equals(existing.getLastRequestHash())) {
            return read(form.getBookingId());
        }
        if (existing.getVersion() != expectVersion) {
            throw new BusinessException("筆記已在其他裝置更新，請核對後重試");
        }
        int updated = noteMapper.updateWithVersion(existing.getId(), current.getId(), expectVersion,
                rawText, mentionsJson, contentHash, requestKey, requestHash(requestKey, contentHash), current.getName());
        if (updated == 0) {
            throw new BusinessException("筆記已在其他裝置更新，請核對後重試");
        }
        return read(form.getBookingId());
    }

    /** mention 只有在当前文本里仍能对上姓名、且服务端能解析为在职员工时才保留绑定，否则退化为纯文本。 */
    private List<MeetingMinutesAiDto.Mention> sanitizeMentions(List<MeetingMinutesAiDto.Mention> mentions, String rawText) {
        if (mentions == null || mentions.isEmpty()) {
            return List.of();
        }
        return mentions.stream().filter(m -> m != null && StringUtils.hasText(m.getName())
                && rawText.contains("@" + m.getName())).toList();
    }

    private static String requireKey(String key) {
        if (key == null || !key.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new BusinessException("請提供有效的本次操作識別碼");
        }
        return key;
    }

    private static String requestHash(String requestKey, String contentHash) {
        return MeetingMinutesPublication.hash(Map.of("k", requestKey, "h", contentHash));
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("摘要算法不可用", e);
        }
    }
}
