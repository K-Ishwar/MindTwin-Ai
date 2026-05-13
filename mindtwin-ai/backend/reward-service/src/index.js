const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
require('dotenv').config();

process.env.SERVICE_NAME = 'reward-service';
const logger         = require('../../../shared/logger');
const requestLogger  = require('../../../shared/middleware/requestLogger');
const globalErrorHandler = require('../../../shared/middleware/errorHandler');
const { metricsMiddleware } = require('../../../shared/metrics');
const rewardRoutes = require('./routes/rewardRoutes');

const app = express();

app.use(compression({ threshold: 1024, level: 6 }));
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(requestLogger);
metricsMiddleware(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'reward-service' });
});

app.use('/api/reward', rewardRoutes);

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3006;
app.listen(PORT, () => {
  logger.info(`Reward service running on port ${PORT}`);
});
