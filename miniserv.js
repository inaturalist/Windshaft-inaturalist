var Windshaft = require('windshaft');
var _         = require('underscore');
var conf      = require('./config');


var config = {
  // base_url: '/database/:dbname/table/:table',
  base_url: '/',
  base_url_notable: '/',
  grainstore: {
    datasource: {
      user: conf.database.user, 
      host: conf.database.host,
      port: conf.database.port,
      geometry_field: conf.database.geometry_field,
      srid: conf.database.srid
    }
  }, //see grainstore npm for other options
  redis: {host: conf.redis.host, port: conf.redis.port},
  enable_cors: true,
  req2params: function(req, callback){
    // this is in case you want to test sql parameters eg ...png?sql=select * from my_table limit 10
    req.params =  _.extend({}, req.params);
    _.extend(req.params, req.query);
    console.log("[REQ2PARAMS] - " + req.params.param);
    //callback(null,req);
  }
};

// Initialize tile server on port 4000
var ws = new Windshaft.Server(config);

ws.get(config.base_url + 'test',function(req,res){
  console.log("[TEST ENDPOINT] - Hit test endpoint");
  config.req2params(req);
  res.send("Hit test sendpoint");
});

ws.listen(4000);


console.log("map tiles are now being served out of: http://localhost:4000" + config.base_url + '/:z/:x/:y');
