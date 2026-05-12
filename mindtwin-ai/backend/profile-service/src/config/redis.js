'use strict';

const redis = require('redis');

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379',
});

redisClient.on('error', (err) => console.error('[profile-service] Redis error:', err.message));

(async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log('[profile-service] Connected to Redis');
  }
})();

module.exports = redisClient;
