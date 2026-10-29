package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.dto.MeetingMinutesContent;
import com.mftb.admin.dto.MeetingMinutesDto;
import com.mftb.admin.entity.MeetingMinutes;
import com.mftb.admin.entity.MeetingMinutesAttachment;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.MeetingMinutesAttachmentMapper;
import com.mftb.admin.service.doc.DocAssetValidator;
import com.mftb.admin.service.doc.DocObjectStorage;
import com.mftb.admin.service.doc.DocOfficeConverter;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.MinutesAttachmentTokenUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * 纪要附件的存储与状态机（上传校验、绑定/解绑、发布定格、受控读取、过期回收）。
 *
 * <p>权限判定不在这里：本组件只回答"这份文件是什么、处于哪个状态、能不能流转"，
 * "这个人能不能读/能不能写这份纪要"由 {@code MeetingMinutesService} 用同一套
 * guard 判定后再调进来——否则免登票据兑换与站内详情会各写一份权限口径并逐渐漂移。
 *
 * <p>安全边界全部在服务端：扩展名白名单、magic bytes、真实字节数、Content-Length
 * 一致性、对象键服务端生成。前端的类型/大小限制只是 UX。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MeetingMinutesAttachmentService {

    /** 单份纪要最多 5 个附件：与需求确认的界面口径一致 */
    public static final int MAX_FILES = 5;
    /** 单文件上限 10 MiB：DB 不落内容，限的是对象存储与带宽 */
    public static final long MAX_BYTES = 10L * 1024 * 1024;
    /** 未绑定附件保留期：超过后由清理任务回收（解绑会刷新 updated_at，刚移除的不会被误删） */
    static final int UNBOUND_RETENTION_HOURS = 24;
    private static final java.util.regex.Pattern NO_PATTERN = java.util.regex.Pattern.compile("[0-9a-f]{32}");
    private static final java.util.regex.Pattern REQUEST_KEY_PATTERN =
            java.util.regex.Pattern.compile("[A-Za-z0-9_-]{1,64}");

    /** 扩展名 → 规范化 MIME：MIME 由服务端按扩展名落库，不采信客户端自报值 */
    private static final Map<String, String> EXTENSION_MIME = Map.ofEntries(
            Map.entry("doc", "application/msword"),
            Map.entry("docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            Map.entry("pdf", "application/pdf"),
            Map.entry("png", "image/png"),
            Map.entry("jpg", "image/jpeg"),
            Map.entry("jpeg", "image/jpeg"),
            Map.entry("gif", "image/gif"),
            Map.entry("webp", "image/webp"));

    private final MeetingMinutesAttachmentMapper attachmentMapper;
    private final DocObjectStorage storage;
    private final DocOfficeConverter officeConverter;

    /* ==================== 上传 ==================== */

    /**
     * 原始字节流上传：先落临时文件并流式计算 SHA-256，校验通过才移动进对象存储并登记。
     *
     * <p>幂等键撞车且内容一致时返回已存在的附件（重试不重复占存储）；
     * 同键不同内容直接拒绝——那说明客户端把一次操作识别码用串了。
     */
    public MeetingMinutesAttachment upload(long bookingId, String fileName, long contentLength,
                                           InputStream input, String requestKey, SysUser current) {
        if (contentLength <= 0) throw new BusinessException("上傳必須提供文件內容");
        if (contentLength > MAX_BYTES) throw new BusinessException("附件不能超過 10 MB");
        if (requestKey == null || !REQUEST_KEY_PATTERN.matcher(requestKey).matches()) {
            throw new BusinessException("請提供有效的本次上傳識別碼");
        }
        String originalName = DocAssetValidator.safeName(fileName);
        int dot = originalName.lastIndexOf('.');
        String extension = dot >= 0 && dot < originalName.length() - 1
                ? originalName.substring(dot + 1).toLowerCase(java.util.Locale.ROOT) : "";
        String mime = EXTENSION_MIME.get(extension);
        if (mime == null) throw new BusinessException("僅支援 Word、PDF 與圖片附件");
        if (attachmentMapper.countUnbound(bookingId, current.getId()) >= MAX_FILES) {
            throw new BusinessException("本场会议已有 " + MAX_FILES + " 個待綁定附件，請先移除或隨紀要保存");
        }

        Path temp = storage.newTempFile();
        String sha;
        long total;
        byte[] head = new byte[16];
        int headLen = 0;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (OutputStream out = Files.newOutputStream(temp)) {
                byte[] buffer = new byte[8192];
                int read;
                long counted = 0;
                while ((read = input.read(buffer)) != -1) {
                    counted += read;
                    if (counted > MAX_BYTES) throw new BusinessException("附件不能超過 10 MB");
                    if (headLen < head.length) {
                        int copied = Math.min(read, head.length - headLen);
                        System.arraycopy(buffer, 0, head, headLen, copied);
                        headLen += copied;
                    }
                    digest.update(buffer, 0, read);
                    out.write(buffer, 0, read);
                }
                total = counted;
            }
            if (total != contentLength) throw new BusinessException("上傳長度與聲明不一致，請重試");
            requireMagic(extension, head, headLen);
            sha = HexFormat.of().formatHex(digest.digest());
        } catch (BusinessException e) {
            deleteQuietly(temp);
            throw e;
        } catch (Exception e) {
            deleteQuietly(temp);
            log.warn("纪要附件读取失败: {}", e.getClass().getSimpleName());
            throw new BusinessException("附件讀取失敗，請重試");
        }

        String requestHash = hashOf(sha, originalName, total);
        MeetingMinutesAttachment replay = attachmentMapper.findByRequest(bookingId, requestKey);
        if (replay != null) {
            deleteQuietly(temp);
            if (!requestHash.equals(replay.getRequestHash())) {
                throw new BusinessException("同一上傳識別碼不可用於不同文件，請重試");
            }
            return replay;
        }

        String attachmentNo = UUID.randomUUID().toString().replace("-", "");
        String objectKey = "meeting-minutes/attachments/" + YearMonth.now() + "/" + attachmentNo + "." + extension;
        try {
            storage.put(objectKey, temp);
        } catch (RuntimeException e) {
            deleteQuietly(temp);
            log.warn("纪要附件写入对象存储失败: {}", e.getClass().getSimpleName());
            throw new BusinessException("附件保存失敗，請重試");
        }
        MeetingMinutesAttachment row = new MeetingMinutesAttachment();
        row.setAttachmentNo(attachmentNo);
        row.setBookingId(bookingId);
        row.setRequestKey(requestKey);
        row.setRequestHash(requestHash);
        row.setUploadUserId(current.getId());
        row.setUploadName(Objects.toString(current.getName(), ""));
        row.setOriginalName(originalName);
        row.setMime(mime);
        row.setSizeBytes(total);
        row.setSha256(sha);
        row.setStorageProvider(storage.provider());
        row.setObjectKey(objectKey);
        row.setStatus(MeetingMinutesAttachment.STATUS_UNBOUND);
        row.setCreatedBy(current.getName());
        row.setUpdatedBy(current.getName());
        try {
            attachmentMapper.insert(row);
        } catch (org.springframework.dao.DuplicateKeyException e) {
            // 撞幂等键=并发重试已先落库：回读那一行，对象存储里的重复键交给清理任务
            MeetingMinutesAttachment existing = attachmentMapper.findByRequest(bookingId, requestKey);
            if (existing == null) throw new BusinessException("附件保存失敗，請重試");
            return existing;
        }
        return row;
    }

    /* ==================== 绑定状态机 ==================== */

    /**
     * 保存纪要时同步附件绑定，返回要写进正文的规范化附件号列表。
     *
     * <p>两种口径必须分清（旧客户端兼容的硬边界）：
     * {@code requested == null} 表示调用方根本不带附件字段（旧页面/旧接口），
     * 此时保留既有绑定不动；带数组（哪怕是空数组）表示"正文就该是这一组"。
     */
    public List<String> applyBindings(MeetingMinutes minutes, long bookingId, MeetingMinutesContent content,
                                       List<String> previousNos, SysUser current) {
        List<String> requested = content.getAttachments();
        if (requested == null) {
            List<String> kept = previousNos == null ? List.of() : dedupe(previousNos);
            content.setAttachments(kept.isEmpty() ? null : kept);
            return kept;
        }
        LinkedHashSet<String> keep = new LinkedHashSet<>(dedupe(requested));
        if (keep.size() > MAX_FILES) throw new BusinessException("附件最多 " + MAX_FILES + " 個");
        for (String no : keep) {
            if (!NO_PATTERN.matcher(no).matches()) throw new BusinessException("附件標識不正確，請重新上傳");
        }
        if (!keep.isEmpty()) {
            Map<String, MeetingMinutesAttachment> rows = attachmentMapper.findByNos(keep).stream()
                    .collect(java.util.stream.Collectors.toMap(MeetingMinutesAttachment::getAttachmentNo, r -> r));
            for (String no : keep) {
                MeetingMinutesAttachment row = rows.get(no);
                // 不存在/属于别的会议统一一句：自增维度不泄露"别人的附件存在吗"
                if (row == null || !Objects.equals(row.getBookingId(), bookingId)) {
                    throw new BusinessException("附件不存在或已失效，請重新上傳");
                }
                if (Objects.equals(row.getStatus(), MeetingMinutesAttachment.STATUS_UNBOUND)) {
                    if (!Objects.equals(row.getUploadUserId(), current.getId())) {
                        throw new BusinessException("只能綁定本人上傳的附件");
                    }
                    if (attachmentMapper.bind(no, minutes.getId(), bookingId, current.getId(), current.getName()) != 1) {
                        throw new BusinessException("附件已變更，請刷新後重試");
                    }
                } else if (!Objects.equals(row.getMinutesId(), minutes.getId())) {
                    throw new BusinessException("附件不存在或已失效，請重新上傳");
                }
                // 已绑定在本纪要(2/3)的行：保持原状态，3 不可回退
            }
        }
        for (String old : (previousNos == null ? List.<String>of() : dedupe(previousNos))) {
            if (!keep.contains(old)) {
                attachmentMapper.unbind(old, minutes.getId(), current.getName());
            }
        }
        content.setAttachments(new ArrayList<>(keep));
        return new ArrayList<>(keep);
    }

    /** 发布定格：正文引用的绑定附件全部进入不可删状态，历史快照永不缺文件。 */
    public void markPublished(MeetingMinutes minutes, MeetingMinutesContent content, SysUser publisher) {
        for (String no : dedupe(content.getAttachments())) {
            attachmentMapper.markPublished(no, minutes.getId(), publisher.getName());
        }
    }

    /* ==================== 读取与删除 ==================== */

    public MeetingMinutesAttachment requireRow(String attachmentNo) {
        if (attachmentNo == null || !NO_PATTERN.matcher(attachmentNo).matches()) {
            throw new BusinessException("附件不存在或已刪除");
        }
        MeetingMinutesAttachment row = attachmentMapper.findByNo(attachmentNo);
        if (row == null) throw new BusinessException("附件不存在或已刪除");
        return row;
    }

    /** 删除未绑定附件（仅上传人）：先删行再删对象，行删 0 说明状态已变或不是本人。 */
    public void deleteUnbound(String attachmentNo, SysUser current) {
        MeetingMinutesAttachment row = requireRow(attachmentNo);
        if (attachmentMapper.deleteUnbound(attachmentNo, current.getId()) != 1) {
            throw new BusinessException("僅上傳人可刪除尚未綁定的附件");
        }
        try {
            storage.delete(row.getObjectKey());
        } catch (RuntimeException e) {
            // 行已删除，对象成为孤儿；清理任务按对象键兜底回收，不让用户看到"删除失败"
            log.warn("纪要附件对象删除失败（行已删除，交由清理兜底）: {}", e.getClass().getSimpleName());
        }
    }

    /** 附件元数据列表（按引用顺序）；查不到的跳过——展示面缺一个比整页报错好，访问面仍逐行鉴权。 */
    public List<MeetingMinutesDto.AttachmentVO> resolve(Collection<String> attachmentNos) {
        List<String> nos = dedupe(attachmentNos);
        if (nos.isEmpty()) return List.of();
        Map<String, MeetingMinutesAttachment> rows = attachmentMapper.findByNos(nos).stream()
                .collect(java.util.stream.Collectors.toMap(MeetingMinutesAttachment::getAttachmentNo, r -> r));
        List<MeetingMinutesDto.AttachmentVO> out = new ArrayList<>();
        for (String no : nos) {
            MeetingMinutesAttachment row = rows.get(no);
            if (row != null) out.add(toVO(row));
        }
        return out;
    }

    /**
     * 受控文件响应：view=内联（Office 先转 PDF），download=原件附件下载。
     *
     * <p>调用方必须先完成鉴权（站内票据复核 / 免登令牌批次校验），这里只负责字节与响应头。
     */
    public ResponseEntity<InputStreamResource> file(MeetingMinutesAttachment row, String purpose) {
        boolean inline = MinutesAttachmentTokenUtil.PURPOSE_VIEW.equals(purpose);
        if (inline && isOffice(row.getMime())) {
            String base = row.getOriginalName().replaceAll("\\.[^.]+$", "");
            byte[] pdf;
            try (InputStream input = storage.open(row.getObjectKey())) {
                pdf = officeConverter.toPdf(input, row.getOriginalName());
            } catch (BusinessException e) {
                throw e;
            } catch (Exception e) {
                log.warn("纪要附件 Office 预览读取失败: {}", e.getClass().getSimpleName());
                throw new BusinessException("Office 文件讀取失敗，請下載後查看");
            }
            return documentResponse(pdf, base + ".pdf", MediaType.APPLICATION_PDF, true);
        }
        InputStream stream;
        try {
            stream = storage.open(row.getObjectKey());
        } catch (RuntimeException e) {
            log.warn("纪要附件对象读取失败: {}", e.getClass().getSimpleName());
            throw new BusinessException("附件讀取失敗，請稍後重試");
        }
        ContentDisposition disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(row.getOriginalName(), StandardCharsets.UTF_8).build();
        return withFileSecurityHeaders(ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(row.getMime()))
                .contentLength(row.getSizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString()))
                .body(new InputStreamResource(stream));
    }

    private ResponseEntity<InputStreamResource> documentResponse(byte[] pdf, String name, MediaType type, boolean inline) {
        ContentDisposition disposition = (inline ? ContentDisposition.inline() : ContentDisposition.attachment())
                .filename(name, StandardCharsets.UTF_8).build();
        return withFileSecurityHeaders(ResponseEntity.ok()
                .contentType(type)
                .contentLength(pdf.length)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString()))
                .body(new InputStreamResource(new java.io.ByteArrayInputStream(pdf)));
    }

    /**
     * 文件响应统一安全头：不缓存、不嗅探、不留来源、不被索引；
     * 头部名用字面量（本版本 HttpHeaders 没有对应常量）。
     */
    private static ResponseEntity.BodyBuilder withFileSecurityHeaders(ResponseEntity.BodyBuilder builder) {
        return builder
                .cacheControl(CacheControl.noStore().cachePrivate())
                .header("X-Content-Type-Options", "nosniff")
                .header("Referrer-Policy", "no-referrer")
                .header("Content-Security-Policy", "default-src 'none'")
                .header("X-Robots-Tag", "noindex, nofollow");
    }

    /* ==================== 过期回收 ==================== */

    /** 回收超期未绑定的附件；返回处理条数。对象删除失败只留日志，行已删除即视为回收完成。 */
    public int cleanupStaleUnbound() {
        List<MeetingMinutesAttachment> stale = attachmentMapper.findStaleUnbound(
                LocalDateTime.now().minusHours(UNBOUND_RETENTION_HOURS));
        int removed = 0;
        for (MeetingMinutesAttachment row : stale) {
            if (attachmentMapper.deleteUnbound(row.getAttachmentNo(), row.getUploadUserId()) == 1) {
                removed++;
                try {
                    storage.delete(row.getObjectKey());
                } catch (RuntimeException e) {
                    log.warn("過期附件對象刪除失敗: no={}, error={}", row.getAttachmentNo(), e.getClass().getSimpleName());
                }
            }
        }
        return removed;
    }

    /* ==================== 工具 ==================== */

    public MeetingMinutesDto.AttachmentVO toVO(MeetingMinutesAttachment row) {
        MeetingMinutesDto.AttachmentVO vo = new MeetingMinutesDto.AttachmentVO();
        vo.setAttachmentNo(row.getAttachmentNo());
        vo.setFileName(row.getOriginalName());
        vo.setMimeType(row.getMime());
        vo.setSizeBytes(row.getSizeBytes());
        vo.setPreviewKind(previewKind(row.getMime()));
        vo.setUploaderName(row.getUploadName());
        vo.setUploadedAt(DateTimeUtils.format(row.getCreatedAt()));
        return vo;
    }

    /** 预览形态由服务端判定：三处展示（站内/预览/免登页）不再各写一份 mime 猜测 */
    public static String previewKind(String mime) {
        if (mime == null) return "none";
        if (mime.startsWith("image/")) return "image";
        if (mime.equals("application/pdf")) return "pdf";
        if (isOffice(mime)) return "office";
        return "none";
    }

    private static boolean isOffice(String mime) {
        return mime != null && (mime.contains("word") || mime.contains("msword"));
    }

    /** magic bytes 校验：白名单之外的伪装文件（HTML 改名 .doc 等）一律拒绝。 */
    static void requireMagic(String extension, byte[] head, int length) {
        String error = switch (extension) {
            case "pdf" -> startsWithAscii(head, length, "%PDF-") ? null : "PDF 文件頭不匹配";
            case "png" -> length >= 4 && (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G'
                    ? null : "PNG 文件頭不匹配";
            case "jpg", "jpeg" -> length >= 3 && (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF
                    ? null : "JPEG 文件頭不匹配";
            case "gif" -> startsWithAscii(head, length, "GIF8") ? null : "GIF 文件頭不匹配";
            case "webp" -> length >= 12 && startsWithAscii(head, 4, "RIFF")
                    && new String(head, 8, 4, StandardCharsets.US_ASCII).equals("WEBP") ? null : "WEBP 文件頭不匹配";
            case "docx" -> length >= 4 && head[0] == 'P' && head[1] == 'K' && head[2] == 0x03 && head[3] == 0x04
                    ? null : "Word(docx) 文件頭不匹配";
            case "doc" -> length >= 8 && (head[0] & 0xFF) == 0xD0 && (head[1] & 0xFF) == 0xCF
                    && (head[2] & 0xFF) == 0x11 && (head[3] & 0xFF) == 0xE0
                    && (head[4] & 0xFF) == 0xA1 && (head[5] & 0xFF) == 0xB1
                    && (head[6] & 0xFF) == 0x1A && (head[7] & 0xFF) == 0xE1
                    ? null : "Word(doc) 文件頭不匹配";
            default -> "不支援的文件類型";
        };
        if (error != null) throw new BusinessException(error + "，請上傳真實的 " + extension.toUpperCase(java.util.Locale.ROOT) + " 文件");
    }

    private static boolean startsWithAscii(byte[] head, int length, String magic) {
        byte[] bytes = magic.getBytes(StandardCharsets.US_ASCII);
        if (length < bytes.length) return false;
        for (int i = 0; i < bytes.length; i++) if (head[i] != bytes[i]) return false;
        return true;
    }

    private static List<String> dedupe(Collection<String> nos) {
        List<String> out = new ArrayList<>();
        if (nos == null) return out;
        LinkedHashSet<String> seen = new LinkedHashSet<>();
        for (String no : nos) {
            String trimmed = no == null ? "" : no.trim();
            if (!trimmed.isEmpty()) seen.add(trimmed);
        }
        out.addAll(seen);
        return out;
    }

    /** 幂等请求摘要：同一内容 + 同一文件名视为同一次上传（重试/双击不重复占存储）。 */
    public static String hashOf(String sha256, String fileName, long size) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(
                    (sha256 + "|" + fileName + "|" + size).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("摘要算法不可用", e);
        }
    }

    private static void deleteQuietly(Path path) {
        try {
            Files.deleteIfExists(path);
        } catch (Exception e) {
            log.warn("清理上传临时文件失败: {}", path);
        }
    }
}
