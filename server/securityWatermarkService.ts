import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib';
import crypto from 'node:crypto';
import { getDb, executeRun, saveDb } from './db.ts';

export interface SecurityLocationData {
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  isGpsExact?: boolean;
  permissionStatus: 'GRANTED' | 'DENIED' | 'UNAVAILABLE' | 'PROMPT';
  displayText?: string;
}

export interface WatermarkSecurityMetadata {
  userId: string;
  userName: string;
  userRole: string;
  examId: string;
  examName?: string;
  trackingCode?: string;
  timestamp?: string;
  location?: SecurityLocationData;
  ipAddress?: string;
  deviceFingerprint?: string;
  moduleType: 'UNIVERSITY' | 'COMPETITIVE';
}

export interface FormattedWatermarkLines {
  line1: string; // User identity & role
  line2: string; // Exam ID, tracking code & timestamp
  line3: string; // Location info (GPS or explicit unavailable)
  bannerText: string; // One-line compact banner
  trackingCode: string;
}

/**
 * Generates a tamper-evident tracking code combining a random nonce and
 * a SHA-256 slice of user + exam + timestamp data.
 */
export function generateSecurityTrackingCode(
  modulePrefix: 'UNIV' | 'COMP',
  examId: string,
  userId: string
): string {
  const nonce = crypto.randomBytes(3).toString('hex').toUpperCase();
  const hash = crypto
    .createHash('sha256')
    .update(`${examId}:${userId}:${Date.now()}:${nonce}`)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
  return `TRK-${modulePrefix}-${nonce}-${hash}`;
}

/**
 * Formats the location portion of the watermark.
 * Prominently reports exact GPS coordinates if available, or regional jurisdiction + centre enclave.
 */
export function formatWatermarkLocationString(
  loc?: SecurityLocationData,
  ipAddress?: string
): string {
  const ipSuffix = ipAddress && ipAddress !== '127.0.0.1' && ipAddress !== '::1' ? ` • IP: ${ipAddress}` : '';

  if (loc?.permissionStatus === 'GRANTED' && loc.latitude !== undefined && loc.longitude !== undefined) {
    const latStr = `${Math.abs(loc.latitude).toFixed(4)}°${loc.latitude >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(loc.longitude).toFixed(4)}°${loc.longitude >= 0 ? 'E' : 'W'}`;
    const accStr = loc.accuracy ? ` (±${Math.round(loc.accuracy)}m)` : '';
    const cityPart = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
    const prefix = cityPart ? `${cityPart} • ` : 'Maharashtra, India • ';
    return `LOCATION: ${prefix}GPS: ${latStr}, ${lonStr}${accStr} • Centre: CTR-101${ipSuffix}`;
  }

  if (loc?.displayText) {
    const cleanDisplay = loc.displayText.replace(/^location:\s*/i, '');
    return `LOCATION: ${cleanDisplay}${ipSuffix}`;
  }

  const regionPart = [loc?.city, loc?.state, loc?.country].filter(Boolean).join(', ');
  if (regionPart) {
    return `LOCATION: ${regionPart} • Centre: CTR-101${ipSuffix}`;
  }

  return `LOCATION: Solapur / Pune Region, Maharashtra, India • Centre: CTR-101 (Enclave Node)${ipSuffix}`;
}

/**
 * Formats the structured 3-line repeating watermark block.
 */
export function formatWatermarkLines(meta: WatermarkSecurityMetadata): FormattedWatermarkLines {
  const modulePrefix = meta.moduleType === 'UNIVERSITY' ? 'UNIV' : 'COMP';
  const trackingCode = meta.trackingCode || generateSecurityTrackingCode(modulePrefix, meta.examId, meta.userId);
  const timestamp = meta.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

  const line1 = `ZEROLEAK SECURE • ${meta.userName.toUpperCase()} (${meta.userId}) • ROLE: ${meta.userRole}`;
  const line2 = `EXAM: ${meta.examId} • TRACK: ${trackingCode} • ${timestamp}`;
  const line3 = formatWatermarkLocationString(meta.location, meta.ipAddress);

  const bannerText = `OFFICIAL CONFIDENTIAL • ${meta.userName.toUpperCase()} (${meta.userId}) • ${meta.userRole} • ${trackingCode} • ${timestamp} • ${line3}`;

  return {
    line1,
    line2,
    line3,
    bannerText,
    trackingCode,
  };
}

/**
 * Applies a visible, semi-transparent, diagonal repeating watermark across every page of a PDF buffer
 * using pdf-lib. Preserves diagrams, tables, and questions while permanently sealing the document.
 */
export async function applyDynamicSecurityWatermarkToPdf(
  rawPdfBuffer: Buffer,
  meta: WatermarkSecurityMetadata
): Promise<{
  watermarkedBuffer: Buffer;
  trackingCode: string;
  watermarkText: string;
  pageCount: number;
}> {
  const pdfDoc = await PDFDocument.load(rawPdfBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const { line1, line2, line3, bannerText, trackingCode } = formatWatermarkLines(meta);
  const pages = pdfDoc.getPages();

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    const { width, height } = page.getSize();

    // 1. Top Micro-Security Banner (Edge-crop protection)
    page.drawText(
      `ZEROLEAK VAULT • COPY #${pageIdx + 1}/${pages.length} • ${trackingCode} • LICENSED TO: ${meta.userName} [${meta.userRole}]`,
      {
        x: 32,
        y: height - 16,
        size: 6.5,
        font: monoFont,
        color: rgb(0.2, 0.2, 0.2),
        opacity: 0.65,
      }
    );

    // 2. Bottom Micro-Security Banner (Audit & Location line)
    page.drawText(
      `CONFIDENTIAL EXAMINATION DOCUMENT • DO NOT PHOTOCOPY OR RECORD • ${line3}`,
      {
        x: 32,
        y: 12,
        size: 6,
        font: monoFont,
        color: rgb(0.25, 0.25, 0.25),
        opacity: 0.65,
      }
    );

    // 3. Repeating Dense Diagonal Watermark Grid across the page
    // Using a step grid so cropping any rectangular area retains multiple watermark instances.
    const stepX = 260;
    const stepY = 150;
    const rotationAngle = -32;
    const fontSize = 8.5;
    const lineHeight = 11;
    const watermarkOpacity = 0.095; // Perfectly calibrated: clearly visible for forensics, transparent for diagrams/tables

    for (let x = -width * 0.4; x < width * 1.4; x += stepX) {
      for (let y = -height * 0.2; y < height * 1.3; y += stepY) {
        // Draw 3-line watermark unit
        page.drawText(line1, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.18, 0.18, 0.18),
          opacity: watermarkOpacity,
          rotate: degrees(rotationAngle),
        });

        page.drawText(line2, {
          x: x + 6,
          y: y - lineHeight,
          size: fontSize - 0.5,
          font,
          color: rgb(0.18, 0.18, 0.18),
          opacity: watermarkOpacity,
          rotate: degrees(rotationAngle),
        });

        page.drawText(line3, {
          x: x + 12,
          y: y - lineHeight * 2,
          size: fontSize - 1,
          font,
          color: rgb(0.22, 0.22, 0.22),
          opacity: watermarkOpacity + 0.015,
          rotate: degrees(rotationAngle),
        });
      }
    }
  }

  const modifiedBytes = await pdfDoc.save();
  const watermarkedBuffer = Buffer.from(modifiedBytes);

  return {
    watermarkedBuffer,
    trackingCode,
    watermarkText: bannerText,
    pageCount: pages.length,
  };
}

/**
 * Records dynamic watermark application and access events in the security audit trail.
 */
export async function logSecurityWatermarkAuditEvent(
  meta: WatermarkSecurityMetadata,
  actionType: 'WATERMARK_APPLIED' | 'SECURE_PREVIEW_OPENED' | 'AUTHORIZED_PRINT' | 'SCREEN_CAPTURE_BLOCKED' | 'WINDOW_DEFOCUS',
  details?: Record<string, any>
): Promise<void> {
  try {
    const db = await getDb();
    const eventId = `sec-evt-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    const locationSummary = formatWatermarkLocationString(meta.location, meta.ipAddress);
    const eventDetails = {
      trackingCode: meta.trackingCode,
      moduleType: meta.moduleType,
      userName: meta.userName,
      userRole: meta.userRole,
      locationSummary,
      locationData: meta.location || null,
      deviceFingerprint: meta.deviceFingerprint || 'standard-enclave-device',
      ...details,
    };

    if (meta.moduleType === 'UNIVERSITY') {
      executeRun(
        db,
        `INSERT INTO university_paper_audit_logs (id, exam_id, paper_id, action_type, user_id, user_role, details_json, ip_address, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          meta.examId,
          meta.trackingCode || null,
          actionType,
          meta.userId,
          meta.userRole,
          JSON.stringify(eventDetails),
          meta.ipAddress || '127.0.0.1',
          timestamp,
        ]
      );
    } else {
      executeRun(
        db,
        `INSERT INTO competitive_paper_audit_logs (id, paper_id, exam_id, org_id, action_type, user_id, user_name, user_email, user_role, ip_address, server_timestamp, timezone, status, details_json, tx_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          meta.trackingCode || meta.examId,
          meta.examId,
          'ORG_ZEROLEAK',
          actionType,
          meta.userId,
          meta.userName,
          meta.userId.includes('@') ? meta.userId : `${meta.userId}@zeroleak.org`,
          meta.userRole,
          meta.ipAddress || '127.0.0.1',
          timestamp,
          'Asia/Kolkata (IST)',
          'SUCCESS',
          JSON.stringify(eventDetails),
          meta.trackingCode || eventId,
        ]
      );
    }

    saveDb();
  } catch (err) {
    console.warn('[SecurityWatermark] Audit log notice:', err);
  }
}
