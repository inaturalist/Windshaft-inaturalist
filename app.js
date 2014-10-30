var Windshaft = require("windshaft");
var _         = require("underscore");
var one       = require("onecolor");
var squel     = require("squel");
var conf      = require("./config");
var Step      = require("step");
var pg        = require("pg");
var cluster   = require("cluster");

var pgConfig = {
  user: conf.database.user,
  password: conf.database.password,
  host: conf.database.host,
  port: conf.database.port,
  database: conf.database.database_name
};

squel.useFlavour("postgres");

var pointQuery = squel.select()
  .field("o.id")
  .field("o.species_guess")
  .field("o.iconic_taxon_id")
  .field("o.taxon_id")
  .field("o.latitude")
  .field("o.longitude")
  .field("ST_SetSrid(o.geom, 4326) AS geom")
  .field("o.positional_accuracy")
  .field("o.captive")
  .field("o.quality_grade")
  .from("observations o")
  .where("o.mappable = true");

var defaultStylePoints =
  "#observations {" +
  "marker-fill: {{color}}; " +
  "marker-opacity: 1;" +
  "marker-width: 8;" +
  "marker-line-color: {{outline_color}};" +
  "marker-line-width: 2;" +
  "marker-line-opacity: 0.9;" +
  "marker-placement: point;" +
  "marker-type: ellipse;" +
  "marker-allow-overlap: true; " +
  "[quality_grade='research'] { marker-line-color: white; } " +
  "[captive=true] { marker-opacity: 0.2; }" +
  "[iconic_taxon_id=1] { marker-fill: #1E90FF; } " +
  "[iconic_taxon_id=3] { marker-fill: #1E90FF; } " +
  "[iconic_taxon_id=20978] { marker-fill: #1E90FF; } " +
  "[iconic_taxon_id=26036] { marker-fill: #1E90FF; } " +
  "[iconic_taxon_id=40151] { marker-fill: #1E90FF; } " +
  "[iconic_taxon_id=47115] { marker-fill: #FF4500; } " +
  "[iconic_taxon_id=47119] { marker-fill: #FF4500; } " +
  "[iconic_taxon_id=47126] { marker-fill: #73AC13; } " +
  "[iconic_taxon_id=47158] { marker-fill: #FF4500; } " +
  "[iconic_taxon_id=47170] { marker-fill: #FF1493; } " +
  "[iconic_taxon_id=47178] { marker-fill: #1E90FF; } " +
  "[iconic_taxon_id=47686] { marker-fill: #8B008B; } " +
  "[iconic_taxon_id=48222] { marker-fill: #993300; } " +
  "}";

// var pointPrecisionQuery = squel.select()
//   .field("o.id")
//   .field("o.quality_grade")
//   .field("o.taxon_id")
//   .field("o.positional_accuracy")
//   .field("ST_Buffer(ST_SetSrid(o.geom, 4326)::geography, positional_accuracy)::geometry AS geom")
//   .from("observations o")
//   .where("o.positional_accuracy > 0")
//   .where("o.mappable = true");
// 
// var pointPrecisionStyle =
//   "#observations {" +
//     "polygon-fill: transparent;" +
//     "polygon-smooth: 1;" +
//     "line-dasharray: 2, 2;" +
//     "line-width: 1;" +
//     "line-color: {{color}};" +
//   "}";

var gridQuery = squel.select()
  .field("cnt")
  .field(
    "ST_Envelope(" +
      "ST_GEOMETRYFROMTEXT('LINESTRING('||(st_xmax(the_geom)-({{seed}}/2))||' '||(st_ymax(the_geom)-({{seed}}/2))||','||(st_xmax(the_geom)+({{seed}}/2))||' '||(st_ymax(the_geom)+({{seed}}/2))||')',4326)"+
    ") AS geom"
  );

var gridSnapQueryDenormalized = squel.select()
  .field("count as cnt")
  .field("geom AS the_geom")
  .from("observation_zooms_{{zoom_table_suffix}}");

var defaultStyleGrid =
  "#observations {" +
  "polygon-fill:#000000; " +
  "polygon-opacity:0.6; " +
  "line-opacity:1; " +
  "line-color:#FFFFFF; " +
  //Labels test
/*  "::labels{" +
  " text-name: '[cnt]';" +
  " text-face-name:'Arial Bold';" +
  " text-allow-overlap: false;" +
  "}" +*/
  "[cnt>=45] { polygon-fill: {{color}}; polygon-opacity:1.0;  } " +
  "[cnt<45] { polygon-fill: {{color}}; polygon-opacity:0.95;  } " +
  "[cnt<35]  { polygon-fill: {{color}}; polygon-opacity:0.87;  } " +
  "[cnt<25]  { polygon-fill: {{color}}; polygon-opacity:0.8;  } " +
  "[cnt<15]  { polygon-fill: {{color}}; polygon-opacity:0.7;  } " +
  "[cnt<8]  { polygon-fill: {{color}}; polygon-opacity:0.6;  } " +
  "[cnt<3]  { polygon-fill: {{color}}; polygon-opacity:0.5;  } }";

function gridRequest(req, callback) {
  if (req && parseInt(req.params.z) > conf.application.max_zoom_level_for_grids) {
    return callback("Unable to process grid requests for this zoom level");
  }
  var z = parseInt(req.params.z);
  var seed = 16 / Math.pow(2, z);
  if (seed > 4) {
    seed = 4;
    z = 2;
  } else if (seed === 1) {
    seed = 0.99;
  }
  var gq = gridQuery.clone(),
      sq;
  if (req.inat && req.inat.taxon) {
    sq = gridSnapQueryDenormalized.clone().where("taxon_id = " + req.inat.taxon.id);
  } else {
    sq = gridSnapQueryDenormalized.clone().where("taxon_id IS NULL");
  }
  gq.from("(" + sq.toString() + ") AS snap_grid");
  req.params.sql = "(" + gq.toString() + ") AS obs_grid";
  req.params.sql = req.params.sql.replace(/\{\{seed\}\}/g, seed);
  req.params.sql = req.params.sql.replace(/\{\{zoom_table_suffix\}\}/g, z);
  if (!req.params.style) {
    req.params.style = defaultStyleGrid;
  }
  if (req.params.color && req.params.color !== "undefined") {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g, req.params.color);
  } else {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g, "#333333");
  }
  callback(null, req);
}

function pointsRequest(req, callback) {
  if (!req.params.style) {
    req.params.style = defaultStylePoints;
  }
  req = commonPointRequest(req, pointQuery.clone(), callback);
}

// function pointPrecisionsRequest(req, callback) {
//   if (!req.params.style) {
//     req.params.style = pointPrecisionStyle;
//   }
//   req = commonPointRequest(req, pointPrecisionQuery.clone(), callback);
// }

function commonPointRequest(req, query, callback) {
  if (req && parseInt(req.params.z) < conf.application.min_zoom_level_for_points) {
    return callback("Unable to process point requests for this zoom level");
  }
  if (req.inat && req.inat.taxon) {
    query
      .join("taxon_ancestors ta", null, "ta.taxon_id = o.taxon_id")
      .where(
        "ta.ancestor_taxon_id = " + req.inat.taxon.id);
  }
  if (req.params.obs_id) {
    query.where("o.id != " + req.params.obs_id);
  }
  req.params.sql = "(" + query.toString() + ") AS points";
  if (req.params.color && req.params.color !== "undefined") {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g, req.params.color);
    var c = one(req.params.color),
        outlineColor = c.lightness() > 0.6 ? c.lightness(0.4).hex() : c.lightness(0.8).hex();
    req.params.style = req.params.style.replace(/\{\{outline_color\}\}/g, outlineColor);
  } else {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g, "#333333");
    req.params.style = req.params.style.replace(/\{\{outline_color\}\}/g, "#AAAAAA");
  }
  callback(null, req);
}

// function timelineRequest(req, callback) {
//   req.params.sql = "(SELECT id, observed_on, species_guess, iconic_taxon_id, taxon_id, latitude, longitude, geom, " +
//     "positional_accuracy, captive, quality_grade FROM " +
//     "observations o WHERE TO_CHAR(observed_on,'YYYY-MM') = '{{date_up}}') as observations";
//   if (req.params.date_up === "undefined") {
//     req.params.date_up = "2010-01-01";
//   }
//   req.params.sql = req.params.sql.replace(/\{\{date_up\}\}/g, req.params.date_up);
//   req.params.style =  "#observations {" +
//     "marker-fill: {{color}}; " +
//     "marker-opacity: 1;" +
//     "marker-width: 8;" +
//     "marker-line-color: white;" +
//     "marker-line-width: 2;" +
//     "marker-line-opacity: 0.9;" +
//     "marker-placement: point;" +
//     "marker-type: ellipse;" +
//     "marker-allow-overlap: true; " +
//     "}";
//   if (req.params.color === "undefined") {
//     req.params.style = req.params.style.replace(/\{\{color\}\}/g, "#1E90FF");
//   } else {
//     req.params.style = req.params.style.replace(/\{\{color\}\}/g, req.params.color);
//   }
//   req.params.interactivity="id";
//   callback(null, req);
// }

var loadTaxon = function(req, callback) {
  var taxonId = req.params.taxon_id;
  var client;
  Step(
    function() {
      client = new pg.Client(pgConfig);
      client.connect(this);
    },
    function handleConnection(err, client, done) {
      if (err) {
        console.error("could not connect to postgres", err);
        callback(null, req);
        return null;
      }
      client.query("SELECT id, name, ancestry, rank, rank_level FROM taxa WHERE id = " + taxonId, this);
    },
    function handleResult(err, result) {
      if (err) {
        console.error("error running query", err);
      }
      if (result && result.rows.length > 0) {
        var ancestry = result.rows[0].ancestry;
        req.inat = req.inat || { };
        req.inat.taxon = {
          id: result.rows[0].id,
          name: result.rows[0].name,
          rank: result.rows[0].rank,
          rankLevel: result.rows[0].rank_level,
          ancestry: ancestry,
          child_ancestry: ancestry + "/" + taxonId,
          descendant_ancestry: ancestry + "/" + taxonId + "/%"
        };
      }
      client.end();
      callback(null, req);
    }
  );
};

var config = {
  base_url: "/:table/:endpoint",
  base_url_notable: "/:endpoint",
  grainstore: {
    datasource: {
      user: conf.database.user,
      host: conf.database.host,
      port: conf.database.port,
      geometry_field: conf.database.geometry_field,
      password: conf.database.password,
      srid: conf.database.srid
    }
  }, //see grainstore npm for other options
  redis: { host: conf.redis.host, port: conf.redis.port },
  enable_cors: true,
  req2params: function(req, callback) {
    // this is in case you want to test sql parameters eg ...png?sql=select * from my_table limit 10
    req.params =  _.extend({}, req.params);
    _.extend(req.params, req.query);

    req.params.dbname = conf.database.database_name;

    Step(
      function loadTaxonForTaxonFilter() {
        if (req.params.taxon_id) {
          loadTaxon(req, this);
        } else {
          return req;
        }
      },
      function processRequestForEndpoint(err, req) {
        if (err) {
          console.log("[DEBUG] failed to get ancestries");
        }
        // in lieu of a proper router
        if (req.params.endpoint === "grid") { // Grid endpoint
          gridRequest(req, this);
        } else if (req.params.endpoint === "points") { // Points endpoint
          pointsRequest(req, this);
        // } else if (req.params.endpoint === "precisions") {
        //   pointPrecisionsRequest(req, this);
        // } else if (req.params.endpoint === "timeline") {
        //   timelineRequest(req, this);
        } else {
          // just a precaution to try and prevent sql injection
          req.params.sql = "(SELECT geom FROM observations WHERE 1 = 2) AS foo";
          return req;
        }
      },
      function finalize(err, req) {
        if (err) {
          console.log("[DEBUG] failed to process request for endpoint, err: " + err);
        } else {
          // send the finished req object on
          var x = parseInt(req.params.x),
              y = parseInt(req.params.y),
              z = parseInt(req.params.z),
              numTiles = Math.pow(2, z),
              maxCoord = numTiles - 1;

          x = x >= 0 ? x : maxCoord + x;
          y = y >= 0 ? y : maxCoord + y;
          if (x > maxCoord) { x = x % numTiles; }
          if (y > maxCoord) { y = y % numTiles; }
          if (x < -1 * maxCoord) { x = Math.abs(x) % numTiles; }
          if (y < -1 * maxCoord) { y = Math.abs(y) % numTiles; }
          req.params.x = x.toString();
          req.params.y = y.toString();
          req.params.z = z.toString();

          if (conf.debug) {
            console.log("[DEBUG] req.params.sql: ", req.params.sql);
          }
        }
        callback(err, req);
      }
    );
  },
  beforeTileRender: function(req, res, callback) {
    callback(null);
  },
  afterTileRender: function(req, res, tile, headers, callback) {
    headers["Cache-Control"] = conf.application.cache_control;
    callback(null, tile, headers);
  }
};

// Initialize tile server on port conf.application.listen_port
var ws = new Windshaft.Server(config);

if (cluster.isMaster && conf.application.number_of_threads) {
  // create as many workers as conf.application.number_of_threads
  for (var i = 0; i < conf.application.number_of_threads; i++) {
    cluster.fork();
  }
  cluster.on("exit", function(worker, code, signal) {
    console.log("worker " + worker.process.pid + " died");
  });
} else {
  var port = Number(process.env.PORT || conf.application.listen_port);
  ws.listen(port, function() {
    console.log("map tiles are now being served out of: http://localhost:" +
      conf.application.listen_port + config.base_url + "/:z/:x/:y");
  });
}
