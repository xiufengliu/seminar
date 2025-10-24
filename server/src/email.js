import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import ical from 'ical-generator';

dotenv.config();

const {
  SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_REQUIRE_TLS, SMTP_USER, SMTP_PASS,
  SMTP_FROM_NAME,
  COORDINATOR_EMAIL, COORDINATOR_NAME
} = process.env;

export function buildTransport() {
  const service = process.env.SMTP_SERVICE;
  const debug = String(process.env.SMTP_DEBUG || 'false') === 'true';
  // If explicitly using Gmail basic auth (no OAuth2/app password), nodemailer can use service shortcut.
  if (service && service.toLowerCase() === 'gmail') {
    // Force IPv4 and sane timeouts; Gmail basic auth over 587 STARTTLS is most reliable
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      family: 4,
      connectionTimeout: 10000,
      greetingTimeout: 8000,
      socketTimeout: 12000,
      tls: { servername: 'smtp.gmail.com' },
      logger: debug,
      debug,
    });
  }
  const secure = String(SMTP_SECURE || 'false') === 'true';
  return nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port: Number(SMTP_PORT || (secure ? 465 : 587)),
    secure,
    requireTLS: String(SMTP_REQUIRE_TLS || 'true') === 'true',
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
    tls: { servername: SMTP_HOST || 'smtp.gmail.com' },
    logger: debug,
    debug,
  });
}

export async function verifySmtp() {
  const transporter = buildTransport();
  const p = transporter.verify();
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('SMTP verify timeout')), 12000));
  return Promise.race([p, timeout]);
}

export async function notifyRequestCoordinator({ speaker_name, speaker_email, topic, date, start_time, end_time, room }) {
  if (!COORDINATOR_EMAIL) return { ok: false, error: 'COORDINATOR_EMAIL not set' };
  const transporter = buildTransport();
  const subject = 'New Seminar Request for Approval';
  const text = `Dear ${COORDINATOR_NAME || 'Coordinator'},\n\nA new seminar request has been submitted for your approval.\n\nSeminar Details:\n- Speaker: ${speaker_name} (${speaker_email})\n- Topic: ${topic}\n- Date: ${date}\n- Time: ${start_time} - ${end_time}\n- Room: ${room}\n\nPlease review and approve the request.\n\nBest regards,\nSeminar Organizer`;
  await transporter.sendMail({ from: `${SMTP_FROM_NAME || 'Seminar Organizer'} <${SMTP_USER}>`, to: COORDINATOR_EMAIL, subject, text });
  return { ok: true };
}

export async function notifySubmitter({ submitter_name, submitter_email, topic, status }) {
  if (!submitter_email) return { ok: false, error: 'submitter_email not provided' };
  const transporter = buildTransport();
  const subject = `Seminar Request Update: ${topic}`;
  const text = `Dear ${submitter_name},\n\nYour seminar request '${topic}' has been ${status}.\n\nBest regards,\nSeminar Organizer`;
  await transporter.sendMail({ from: `${SMTP_FROM_NAME || 'Seminar Organizer'} <${SMTP_USER}>`, to: submitter_email, subject, text });
  return { ok: true };
}

export async function notifyAdmins(recipients, { speaker_name, speaker_email, topic, date, start_time, end_time, room }) {
  if (!Array.isArray(recipients) || recipients.length === 0) return { ok: false, error: 'no admin recipients' };
  const transporter = buildTransport();
  const subject = 'New Seminar Request Submitted';
  const text = `A new seminar request has been submitted.\n\n` +
    `Seminar Details:\n` +
    `- Speaker: ${speaker_name || ''} (${speaker_email || ''})\n` +
    `- Topic: ${topic}\n` +
    `- Date: ${date}\n` +
    `- Time: ${start_time} - ${end_time}\n` +
    `- Room: ${room}\n\n` +
    `Please review and approve/reject the request in the admin panel.`;
  try {
    await transporter.sendMail({ from: `${SMTP_FROM_NAME || 'Seminar Organizer'} <${SMTP_USER}>`, to: recipients.join(', '), subject, text });
    return { ok: true };
  } catch (e) {
    console.error('notifyAdmins sendMail error:', e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function sendSeminarInvitation({ recipients, seminar }) {
  const transporter = buildTransport();
  // Build iCalendar with Outlook-friendly fields
  const cal = ical({ name: 'Seminar Invitation' });
  cal.method('REQUEST');

  const start = new Date(`${seminar.date}T${seminar.start_time}Z`);
  const end = new Date(`${seminar.date}T${seminar.end_time}Z`);

  const event = cal.createEvent({
    start,
    end,
    summary: seminar.topic,
    description: seminar.abstract || '',
    location: seminar.room,
    organizer: { name: SMTP_FROM_NAME || 'Seminar Organizer', email: SMTP_USER },
    url: ''
  });

  // Add attendees to improve Outlook compatibility
  (recipients || []).forEach((email) => {
    if (email) {
      try { event.createAttendee({ email, rsvp: true, role: 'REQ-PARTICIPANT' }); } catch {}
    }
  });

  const ics = cal.toString();
  const subject = `Invitation: ${seminar.topic}`;
  const text = `You are invited to the following seminar:\n\nTopic: ${seminar.topic}\nSpeaker: ${seminar.speaker_name}\nDate: ${seminar.date}\nTime: ${seminar.start_time} - ${seminar.end_time}\nRoom: ${seminar.room}`;
  await transporter.sendMail({
    from: `${SMTP_FROM_NAME || 'Seminar Organizer'} <${SMTP_USER}>`,
    to: recipients.join(', '),
    subject,
    text,
    html: text.replaceAll('\n', '<br/>'),
    // Provide calendar in both alternative body and as attachment for Outlook
    alternatives: [
      {
        content: ics,
        contentType: 'text/calendar; charset="utf-8"; method=REQUEST; name="invitation.ics"',
      },
    ],
    attachments: [
      {
        filename: 'invitation.ics',
        content: ics,
        contentType: 'text/calendar; charset="utf-8"; method=REQUEST',
      },
    ],
    headers: {
      'Content-Class': 'urn:content-classes:calendarmessage',
    },
  });
  return { ok: true };
}
