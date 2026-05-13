const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
require('dotenv').config();

process.env.SERVICE_NAME = 'stress-service';
const logger         = require('../../../shared/logger');
const requestLogger  = require('../../../shared/middleware/requestLogger');
const globalErrorHandler = require('../../../shared/middleware/errorHandler');
const { metricsMiddleware } = require('../../../shared/metrics');
const stressRoutes = require('./routes/stressRoutes');

const app = express();
app.use(compression({ threshold: 1024, level: 6 }));
app.use(cors());
app.use(helmet());
app.use(express.json());
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
