require('dotenv').config();
const lti = require('ltijs').Provider;

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8000';
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://mongo:27017/lti';
const LTI_KEY = process.env.LTI_KEY || 'EDUAGENT_LTI_KEY';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://frontend:3001';

// Setup ltijs
lti.setup(LTI_KEY,
  { url: MONGODB_URL },
  {
    appRoute: '/',
    loginRoute: '/login',
    keysetRoute: '/keys',
    cookies: { secure: false, sameSite: 'Lax' },
    devMode: true  // Allow HTTP in development
  }
);

// On successful LTI launch
lti.onConnect(async (token, req, res) => {
  try {
    // Forward identity to FastAPI backend
    const axios = require('axios');
    const result = await axios.post(`${BACKEND_URL}/api/platform/lti-launch`, {
      user_id: token.user,
      course_id: token.platformContext?.context?.id || 'unknown',
      roles: token.platformContext?.roles || [],
      name: token.userInfo?.name || 'Unknown',
      email: token.userInfo?.email || '',
      platform_info: token.platformInfo || {}
    });

    // Redirect to frontend with JWT
    const jwt = result.data.token;
    const role = result.data.role;
    const redirectPath = role === 'teacher' ? '/teacher/dashboard' : '/student/courses';
    res.redirect(`${FRONTEND_URL}${redirectPath}?token=${jwt}`);
  } catch (err) {
    console.error('LTI launch error:', err.message);
    res.status(500).send('Launch failed: ' + err.message);
  }
});

// Deep Linking handler
lti.onDeepLinking(async (token, req, res) => {
  const items = [
    {
      type: 'ltiResourceLink',
      title: 'EduAgent AI 助教',
      url: `${FRONTEND_URL}/embed/popup`
    }
  ];
  const form = await lti.DeepLinking.createDeepLinkingForm(token, items, {
    message: 'AI 助教已嵌入课程'
  });
  res.send(form);
});

// Grade passback endpoint
lti.app.post('/grade', async (req, res) => {
  try {
    const token = res.locals.token;
    const { score, comment } = req.body;

    const lineItems = await lti.Grade.getLineItems(token, { resourceLinkId: true });
    let lineItemId;

    if (lineItems.lineItems.length === 0) {
      const created = await lti.Grade.createLineItem(token, {
        scoreMaximum: 100,
        label: 'AI Assessment',
        tag: 'grade',
        resourceLinkId: token.platformContext.resource.id
      });
      lineItemId = created.id;
    } else {
      lineItemId = lineItems.lineItems[0].id;
    }

    await lti.Grade.submitScore(token, lineItemId, {
      userId: token.user,
      scoreGiven: score,
      scoreMaximum: 100,
      comment: comment || 'AI graded',
      activityProgress: 'Completed',
      gradingProgress: 'FullyGraded'
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
lti.app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'lti-provider' });
});

// Deploy
const setup = async () => {
  await lti.deploy({ port: 3000 });

  // Register platform (超星 example — update with real values)
  const platform = await lti.registerPlatform({
    url: process.env.LTI_PLATFORM_URL || 'https://mooc1.chaoxing.com',
    name: '超星学习通',
    clientId: process.env.LTI_CLIENT_ID || 'CHAOXING_CLIENT_ID',
    authenticationEndpoint: process.env.LTI_AUTH_ENDPOINT || 'https://mooc1.chaoxing.com/auth',
    accesstokenEndpoint: process.env.LTI_TOKEN_ENDPOINT || 'https://mooc1.chaoxing.com/token',
    authConfig: {
      method: 'JWK_SET',
      key: process.env.LTI_KEYSET_URL || 'https://mooc1.chaoxing.com/.well-known/jwks.json'
    }
  });

  console.log('LTI Provider running on port 3000');
  console.log('Keyset URL: http://localhost:3000/keys');
};

setup();
