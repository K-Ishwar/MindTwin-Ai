const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const compression = require('compression');
require('dotenv').config();

process.env.SERVICE_NAME = 'stress-service';

const { validateSecrets } = require('../../../shared/config/secrets');
validateSecrets();

const logger             = require('../../../shared/logger');
const requestLogger      = require('../../../shared/middleware/requestLogger');
const globalErrorHandler = require('../../../shared/middleware/errorHandler');
const { metricsMiddleware } = require('../../../shared/metrics');
const { sanitizeBody }   = require('../../../shared/middleware/sanitize');

const stressRoutes = require('./routes/stressRoutes');

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

app.use('/api/stress', stressRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'stress-service' });
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
  logger.info(`Stress service running on port ${PORT}`);
});
