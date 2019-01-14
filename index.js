'use strict';

const fetch = require('node-fetch');
const Redis = require('ioredis');

const {
  NODE_ENV,
  REDIS_HOST,
  REDIS_PORT,
  USE_CACHE
} = process.env;

const LOCAL_HOSTS = [{ host: '127.0.0.1', port: 7000 }];
const CACHE_TTL = 1000 * 15;

const TEST_KEY = 'key';
const VALUE = 'value';
const STAMP = 'timestamp';

const clusterHosts = REDIS_HOST ? [{ host: REDIS_HOST, port: REDIS_PORT }] : LOCAL_HOSTS;
const clusterOptions = {
  scaleReads: 'slave'
};

const redis = new Redis.Cluster(clusterHosts, clusterOptions);

async function dataHandler() {
  const res = await fetch('http://time.akamai.com');
  const time = await res.text();
  console.log(`Time: ${time}`);

  return { time };

}

async function cacheHandler() {
  const keyValue = `${TEST_KEY}:${VALUE}`;
  const keyStamp = `${TEST_KEY}:${STAMP}`;

  const now = Date.now();
  const ttl = await redis.get(keyStamp) || 0;

  if (now < ttl) {
    console.log('Use cache: ', (ttl - now));
    return await redis.get(keyValue);
  }

  console.log('--- REFRESH CACHE ---');

  const newValue = await dataHandler();
  await redis.set(keyValue, JSON.stringify(newValue));
  await redis.set(keyStamp, now + CACHE_TTL);

  return newValue;
}

module.exports = {
  async cacheTime(event, context, callback) {
    if (context) {
      context.callbackWaitsForEmptyEventLoop = false;
    }
    const res = USE_CACHE ? await cacheHandler() : await dataHandler();

    console.log('Response:', res);

    return callback(null, (res === 'string') ? JSON.parse(res) : res);
  },
};
