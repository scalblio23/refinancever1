const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8080;

// Environment variables (set in Railway Variables tab — NEVER in code)
const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const TELNYX_VERIFY_PROFILE_ID = process.env.TELNYX_VERIFY_PROFILE_ID;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

if (!TELNYX_API_KEY || !TELNYX_VERIFY_PROFILE_ID) {
  console.error('⚠️  Missing env vars: TELNYX_API_KEY and TELNYX_VERIFY_PROFILE_ID required');
}

// CORS — only allow the Quick Choice domain to call this API
app.use(cors({
  origin: ALLOWED_ORIGIN,
  methods: ['POST', 'OPTIONS'],
  credentials: false,
}));
app.use(express.json({ limit: '50kb' }));

// In-memory rate limit (per-IP, per-minute). Resets on restart — fine for MVP.
const rateLimitMap = new Map();
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip;
  const now = Date.now();
  const windowMs = 60_000; // 1 minute
  const maxRequests = 5;

  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  rateLimitMap.set(ip, record);

  if (record.count > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }
  next();
}

// Validate AU mobile and normalize to E.164 (+614XXXXXXXX)
function normalizeAuMobile(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s|-|\(|\)/g, '');
  // Accept: 04XXXXXXXX, +614XXXXXXXX, 614XXXXXXXX
  if (/^04\d{8}$/.test(cleaned)) return '+61' + cleaned.slice(1);
  if (/^\+614\d{8}$/.test(cleaned)) return cleaned;
  if (/^614\d{8}$/.test(cleaned)) return '+' + cleaned;
  return null;
}

// ===== HEALTH CHECK =====
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'quickchoice-api' });
});

// ===== SEND VERIFICATION CODE =====
app.post('/api/send-code', rateLimit, async (req, res) => {
  try {
    const phone = normalizeAuMobile(req.body.mobile);
    if (!phone) {
      return res.status(400).json({ error: 'Invalid Australian mobile number' });
    }

    const response = await fetch('https://api.telnyx.com/v2/verifications/sms', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: phone,
        verify_profile_id: TELNYX_VERIFY_PROFILE_ID,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx send error:', data);
      return res.status(500).json({ error: 'Could not send verification code. Please try again.' });
    }

    return res.json({ success: true, phone });
  } catch (err) {
    console.error('send-code error:', err);
    return res.status(500).json({ error: 'Server error sending code' });
  }
});

// ===== CHECK VERIFICATION CODE =====
app.post('/api/check-code', rateLimit, async (req, res) => {
  try {
    const phone = normalizeAuMobile(req.body.mobile);
    const code = (req.body.code || '').toString().trim();

    if (!phone) return res.status(400).json({ error: 'Invalid mobile number' });
    if (!/^\d{4,8}$/.test(code)) return res.status(400).json({ error: 'Invalid code format' });

    const response = await fetch(
      `https://api.telnyx.com/v2/verifications/by_phone_number/${encodeURIComponent(phone)}/actions/verify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          verify_profile_id: TELNYX_VERIFY_PROFILE_ID,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error('Telnyx check error:', data);
      return res.status(400).json({ error: 'Code is invalid or expired', verified: false });
    }

    // Telnyx returns response_code: "accepted" on success
    const verified = data?.data?.response_code === 'accepted';

    if (!verified) {
      return res.status(400).json({ error: 'Incorrect code', verified: false });
    }

    return res.json({ success: true, verified: true, phone });
  } catch (err) {
    console.error('check-code error:', err);
    return res.status(500).json({ error: 'Server error checking code' });
  }
});

// ===== SUBMIT LEAD (verified only) =====
const LEAD_WEBHOOK_URL = process.env.LEAD_WEBHOOK_URL;

app.post('/api/submit-lead', rateLimit, async (req, res) => {
  try {
    const lead = req.body;

    // Format the date nicely for the sheet (Sydney local time)
    const submittedAt = new Date(lead.submittedAt || Date.now());
    const formattedDate = submittedAt.toLocaleString('en-AU', {
      timeZone: 'Australia/Sydney',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    }).replace(',', '');

    const payload = {
      date: formattedDate,
      firstName: lead.firstName || '',
      mobile: lead.mobile || '',
      email: lead.email || '',
      assetType: lead.assetType || '',
      purpose: lead.purpose || '',
      abnDuration: lead.abnDuration || '',
      gst: lead.gst || '',
      property: lead.property || '',
      amount: lead.amount || '',
      credit: lead.credit || '',
      residency: lead.residency || '',
      income: lead.income || '',
      state: lead.state || '',
      postcode: lead.postcode || '',
      bestTime: lead.bestTime || '',
      verified: lead.verified ? 'TRUE' : 'FALSE',
      source: lead.source || 'quickchoice-quiz',
    };

    console.log('📥 Lead received:', JSON.stringify(payload, null, 2));

    // Forward to Make webhook (which writes to Google Sheet)
    if (LEAD_WEBHOOK_URL) {
      try {
        const forward = await fetch(LEAD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!forward.ok) {
          console.error('Make webhook returned non-OK:', forward.status, await forward.text());
        } else {
          console.log('✅ Forwarded to Make webhook');
        }
      } catch (fwdErr) {
        // Don't fail the user-facing response if the webhook is down — log it
        console.error('Failed to forward to Make:', fwdErr.message);
      }
    } else {
      console.warn('⚠️  LEAD_WEBHOOK_URL not set — lead not forwarded');
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('submit-lead error:', err);
    return res.status(500).json({ error: 'Server error saving lead' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ quickchoice-api listening on port ${PORT}`);
});
