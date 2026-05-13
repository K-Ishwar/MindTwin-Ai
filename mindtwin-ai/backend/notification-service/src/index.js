const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
require('dotenv').config();

process.env.SERVICE_NAME = 'notification-service';
const logger         = require('../../../shared/logger');
const requestLogger  = require('../../../shared/middleware/requestLogger');
const globalErrorHandler = require('../../../shared/middleware/errorHandler');
const { metricsMiddleware } = require('../../../shared/metrics');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
app.use(compression({ threshold: 1024, level: 6 }));
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(requestLogger);
metricsMiddleware(app);

app.use('/api/notifications', notificationRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service' });
});

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3007;
app.listen(PORT, () => {
  logger.info(`Notification service running on port ${PORT}`);
});
