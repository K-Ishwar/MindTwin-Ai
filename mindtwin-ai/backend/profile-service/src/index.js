'use strict';

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
require('dotenv').config();

process.env.SERVICE_NAME = 'profile-service';

const { validateSecrets } = require('../../../shared/config/secrets');
validateSecrets();

const logger             = require('../../../shared/logger');
const requestLogger      = require('../../../shared/middleware/requestLogger');
const globalErrorHandler = require('../../../shared/middleware/errorHandler');
const { metricsMiddleware } = require('../../../shared/metrics');
const { sanitizeBody }   = require('../../../shared/middleware/sanitize');

const profileRoutes  = require('./routes/profileRoutes');
const guardianRoutes = require('./routes/guardianRoutes');
const adminRoutes    = require('./routes/adminRoutes');

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://mindtwin.ai', 'https://www.mindtwin.ai', 'https://app.mindtwin.ai']
    : ['http://localhost:3000', 'http://localhost:19000', 'http://localhost:5173'],
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Internal-API-Key'],
  maxAge:         86400,
};

const app = express();

app.use(compression({ threshold: 1024, level: 6 }));
app.use(express.json());
app.use(cors(corsOptions));
app.use(helmet());
app.use(sanitizeBody);
app.use(requestLogger);
metricsMiddleware(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'profile-service' });
});

app.use('/api/profile',          profileRoutes);
app.use('/api/profile/guardian', guardianRoutes);
app.use('/api/profile/admin',    adminRoutes);

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  logger.info(`Profile service running on port ${PORT}`);
});
