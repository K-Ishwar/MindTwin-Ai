const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
require('dotenv').config();

process.env.SERVICE_NAME = 'scheduler-service';
const logger         = require('../../../shared/logger');
const requestLogger  = require('../../../shared/middleware/requestLogger');
const globalErrorHandler = require('../../../shared/middleware/errorHandler');
const { metricsMiddleware } = require('../../../shared/metrics');
const schedulerRoutes = require('./routes/schedulerRoutes');

const app = express();

app.use(compression({ threshold: 1024, level: 6 }));
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(requestLogger);
metricsMiddleware(app);

app.get('/health', (req, res) => {
  const { circuitBreakerRegistry } = require('./utils/serviceClients');
  res.json({
    status:           'ok',
    service:          'scheduler-service',
    circuit_breakers: circuitBreakerRegistry.getAllStatus(),
  });
});

app.use('/api/scheduler', schedulerRoutes);

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  logger.info(`Scheduler service running on port ${PORT}`);
});
