# nodeMongoRedis_CacheExample

A basic example on how to implement a cache with redis. The index.js file tries to load a students database from nodeRedisCacheExample.Students, and load it into a redis Cache. Then it compares the running times of two queries.

## Usage

```bash
npm install
npm init
npm start
```

## Requirements

It assumes servers running for Mongo and Redis on localhost and the default ports 27017 and 6379 respectively. To set custom ports you can set the environment variables

```
export MONGO_URL="mongodb://localhost:27017"
export REDIS_URL="redis://localhost:6379"
```
