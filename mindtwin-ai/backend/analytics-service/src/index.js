const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
require('dotenv').config();

process.env.SERVICE_NAME = 'analytics-service';
const logger         = require('../../../shared/logger');
const requestLogger  = require('../../../shared/middleware/requestLogger');
const globalErrorHandler = require('../../../shared/middleware/errorHandler');
const { metricsMiddleware } = require('../../../shared/metrics');\n
const analyticsRoutes = require('./routes/analyticsRoutes');
const { startWeeklyDigestCron } = require('./cron/weeklyDigestCron');

const app = express();

app.use(compression({ threshold: 1024, level: 6 }));
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(requestLogger);
metricsMiddleware(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'analytics-service' });
});

app.use('/api/analytics', analyticsRoutes);

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3008;
app.listen(PORT, () => {
  logger.info(`Analytics service running on port ${PORT}`);
  startWeeklyDigestCron();
});
