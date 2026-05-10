const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const stressRoutes = require('./routes/stressRoutes');

app.use('/api/stress', stressRoutes);

app.get('/', (req, res) => {
  res.send('Hello World from stress-service');
});

const PORT = process.env.PORT || 3005;

app.get('/health', (req, res) => {
  res.json({ status: "ok", service: "stress-service" });
});

app.listen(PORT, () => {
  console.log('stress-service listening on port ' + PORT);
});
