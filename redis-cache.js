'use strict';
module.exports = function(Model, options) {
  let clientSettings = options.client;
  const app = require('../../server/server.js');
  if (!options.client) {
    clientSettings = app.get('redis');
  }

  const redis = require('redis');
  const client = redis.createClient(clientSettings);

  const redisDeletePattern = require('redis-delete-pattern');

  client.on('error', function(err) {
    console.log(err);
    // try to connect again with server config
    if (err.toString().indexOf('invalid password') !== -1) {
      console.log('Invalid password... reconnecting with server config...');
    }
  });

  Model.beforeRemote('**', function(ctx, res, next) {
    // get all find methods and search first in cache
    if (
      (ctx.method.name.indexOf('find') !== -1 ||
        ctx.method.name.indexOf('__get') !== -1) &&
      client.connected
    ) {
      if (typeof ctx.req.query.cache != 'undefined') {
        const modelName = ctx.method.sharedClass.name;

        // set key name
        const cacheKey =
          modelName +
          '_' +
          new Buffer(JSON.stringify(ctx.req.query)).toString('base64');

        // search for cache
        client.get(cacheKey, function(err, val) {
          if (err) {
            console.log(err);
          }

          if (val !== null) {
            ctx.result = JSON.parse(val);
            ctx.done(function(err) {
              if (err) return next(err);
            });
          } else {
            // return data
            next();
          }
        });
      } else {
        next();
      }
    } else {
      next();
    }
  });

  Model.afterRemote('**', function(ctx, res, next) {
    // get all find methods and search first in cache - if not exist save in cache
    if (
      (ctx.method.name.indexOf('find') !== -1 ||
        ctx.method.name.indexOf('__get') !== -1) &&
      client.connected
    ) {
      if (typeof ctx.req.query.cache != 'undefined') {
        const modelName = ctx.method.sharedClass.name;
        const cachExpire = ctx.req.query.cache;

        // set key name
        const cacheKey =
          modelName +
          '_' +
          new Buffer(JSON.stringify(ctx.req.query)).toString('base64');
        // search for cache
        client.get(cacheKey, function(err, val) {
          if (err) {
            console.log(err);
          }

          if (val == null) {
            // set cache key
            client.set(cacheKey, JSON.stringify(res));
            client.expire(cacheKey, cachExpire);
            next();
          } else {
            next();
          }
        });
      } else {
        next();
      }
    } else {
      next();
    }
  });

  Model.afterRemote('**', function(ctx, res, next) {
    // delete cache on patchOrCreate, create, delete, update, destroy, upsert
    if (
      ctx.method.name.indexOf('find') == -1 &&
      ctx.method.name.indexOf('__get') == -1 &&
      client.connected
    ) {
      const modelName = ctx.method.sharedClass.name;

      // set key name
      const cacheKey = modelName + '_*';

      // delete cache
      redisDeletePattern(
        {
          redis: client,
          pattern: cacheKey,
        },
        function handleError(err) {
          if (err) {
            console.log(err);
          }
          next();
        }
      );
    } else {
      next();
    }
  });
};
