import crypto from 'node:crypto';

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload, secret) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest();
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function toSafeId(value, fallback) {
  const source = String(value || fallback);
  return source.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

export function registerVoiceRoutes(app) {
  app.post('/api/voice/livekit-token', (req, res) => {
    const roomId = toSafeId(req.body?.roomId, `room_${Date.now()}`);
    const participantId = toSafeId(req.body?.participantId, `guest_${Date.now()}`);
    const participantName = String(req.body?.participantName || 'Reader').trim().slice(0, 120);

    if (!roomId || !participantId) {
      res.status(400).json({ error: 'roomId and participantId are required.' });
      return;
    }

    const wsUrl = process.env.LIVEKIT_URL || '';
    const apiKey = process.env.LIVEKIT_API_KEY || '';
    const apiSecret = process.env.LIVEKIT_API_SECRET || '';

    if (!wsUrl || !apiKey || !apiSecret) {
      res.json({
        mock: true,
        wsUrl,
        token: '',
        roomName: roomId,
        reason: 'LiveKit not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.'
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: apiKey,
      sub: participantId,
      name: participantName || 'Reader',
      nbf: now - 10,
      exp: now + 60 * 60,
      video: {
        room: roomId,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      }
    };

    const token = signJwt(payload, apiSecret);
    res.json({
      mock: false,
      wsUrl,
      token,
      roomName: roomId
    });
  });
}
