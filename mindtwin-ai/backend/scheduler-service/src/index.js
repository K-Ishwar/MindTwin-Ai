const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const schedulerRoutes = require('./routes/schedulerRoutes');

const app = express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'scheduler-service' });
});

app.use('/api/scheduler', schedulerRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.response?.status || err.status || 500;
  const message = err.response?.data?.error || err.message || 'Internal Server Error';
  res.status(status).json({ success: false, error: message });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`Scheduler service running on port ${PORT}`);
});
