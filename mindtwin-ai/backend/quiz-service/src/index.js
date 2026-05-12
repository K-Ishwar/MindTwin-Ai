const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
require('dotenv').config();

process.env.SERVICE_NAME = 'quiz-service';
const logger         = require('../../../shared/logger');
const requestLogger  = require('../../../shared/middleware/requestLogger');
const globalErrorHandler = require('../../../shared/middleware/errorHandler');
const { metricsMiddleware } = require('../../../shared/metrics');\n
const quizRoutes = require('./routes/quizRoutes');

const app = express();

app.use(compression({ threshold: 1024, level: 6 }));
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(requestLogger);
metricsMiddleware(app);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'quiz-service' });
});

app.use('/api/quiz', quizRoutes);

app.use(globalErrorHandler);

const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  logger.info(`Quiz service running on port ${PORT}`);
});
