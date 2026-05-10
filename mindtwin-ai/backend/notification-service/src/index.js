const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const notificationRoutes = require('./routes/notificationRoutes');

app.use('/api/notifications', notificationRoutes);

app.get('/', (req, res) => {
  res.send('Hello World from notification-service');
});

const PORT = process.env.PORT || 3007;

app.get('/health', (req, res) => {
  res.json({ status: "ok", service: "notification-service" });
});

app.listen(PORT, () => {
  console.log('notification-service listening on port ' + PORT);
});
