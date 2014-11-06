var Windshaft = require("windshaft");
var _         = require("underscore");
var one       = require("onecolor");
var squel     = require("squel");
var conf      = require("./config");
var Step      = require("step");
var pg        = require("pg");
var cluster   = require("cluster");

var cachedMaxCounts = { };
var pgClient;

var pgConfig = {
  user: conf.database.user,
  password: conf.database.password,
  host: conf.database.host,
  port: conf.database.port,
  database: conf.database.database_name,
  ssl: conf.database.ssl
};

squel.useFlavour("postgres");

var pointQuery = squel.select()
  .field("o.id")
  .field("o.species_guess")
  .field("o.iconic_taxon_id")
  .field("o.taxon_id")
  .field("o.latitude")
  .field("o.longitude")
  .field("o.geom")
  .field("o.positional_accuracy")
  .field("o.captive")
  .field("o.quality_grade")
  .from("observations o")
  .where("o.mappable = true")
  .where("o.private_latitude IS NULL")
  .where("o.private_longitude IS NULL");

var gridSnapQueryDenormalized = squel.select()
  .field("count")
  .field("geom")
  .from("{{cacheTable}}");

var defaultStylePoints =
  "#observations {" +
  "marker-fill: #585858; " +
  "marker-opacity: 1;" +
  "marker-width: 8;" +
  "marker-line-color: #D8D8D8;" +
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

var defaultStyleGrid =
  "#observations {" +
  "polygon-fill:#000000; " +
  "polygon-opacity:0.6; " +
  "line-opacity:0.2; " +
  "line-color:#FFFFFF; " +
  "{{styleCounts}}"

var defaultStyleCounts =
  "[count>=45] { polygon-fill: {{color}}; polygon-opacity:1.0; } " +
  "[count<45] { polygon-fill: {{color}}; polygon-opacity:0.95; } " +
  "[count<35] { polygon-fill: {{color}}; polygon-opacity:0.87; } " +
  "[count<25] { polygon-fill: {{color}}; polygon-opacity:0.8; } " +
  "[count<15] { polygon-fill: {{color}}; polygon-opacity:0.7; } " +
  "[count<8] { polygon-fill: {{color}}; polygon-opacity:0.6; } " +
  "[count<3] { polygon-fill: {{color}}; polygon-opacity:0.5; } }";

function gridRequest(req, callback) {
  if (req && parseInt(req.params.z) > conf.application.max_zoom_level_for_grids) {
    return callback("Unable to process grid requests for this zoom level");
  }
  var sq;
  if (req.inat && req.inat.taxon) {
    sq = gridSnapQueryDenormalized.clone().where("taxon_id = " + req.inat.taxon.id);
  } else {
    sq = gridSnapQueryDenormalized.clone().where("taxon_id IS NULL");
  }
  req.params.sql = "(" + sq.toString() + ") AS snap_grid";
  req.params.sql = req.params.sql.replace(/\{\{cacheTable\}\}/g, req.inat.cacheTable);
  if (!req.params.style) {
    req.params.style = defaultStyleGrid;
  }
  if (req.inat && req.inat.maximumCount) {
    req.params.style = req.params.style.replace(/\{\{styleCounts\}\}/g,
      stylesFromMaxCount(req.inat.maximumCount) + "}");
  } else {
    req.params.style = req.params.style.replace(/\{\{styleCounts\}\}/g, defaultStyleCounts);
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

var loookupMaxCountForGrid = function(req, callback) {
  var taxonID = req.params.taxon_id;
  var taxonIDClause = taxonID ? "= " + taxonID : "IS NULL";
  cachedMaxCounts[taxonID] = cachedMaxCounts[taxonID] || { }
  // If we have looked up the max cell count for this taxon / zoom, return it
  if (cachedMaxCounts[taxonID][req.inat.cacheTable]) {
    req.inat.maximumCount = cachedMaxCounts[taxonID][req.inat.cacheTable];
    return callback(null, req);
  }
  Step(
    function() {
      pgClient.query("SELECT MAX(count) as max FROM " + req.inat.cacheTable +
        " WHERE taxon_id " + taxonIDClause, this);
    },
    function handleResult(err, result) {
      if (err) { console.error("error running query", err); }
      if (result && result.rows.length > 0) {
        req.inat.maximumCount = result.rows[0].max;
        cachedMaxCounts[taxonID][req.inat.cacheTable] = result.rows[0].max;
      }
      callback(null, req);
    }
  );
}

var loadTaxon = function(req, callback) {
  var taxonID = req.params.taxon_id;
  Step(
    function() {
      pgClient.query("SELECT id, name, ancestry, rank, rank_level FROM taxa WHERE id = " + taxonID, this);
    },
    function handleResult(err, result) {
      if (err) { console.error("error running query", err); }
      if (result && result.rows.length > 0) {
        var ancestry = result.rows[0].ancestry;
        req.inat.taxon = {
          id: result.rows[0].id,
          name: result.rows[0].name,
          rank: result.rows[0].rank,
          rankLevel: result.rows[0].rank_level,
          ancestry: ancestry,
          child_ancestry: ancestry + "/" + taxonID,
          descendant_ancestry: ancestry + "/" + taxonID + "/%"
        };
      }
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
    req.inat = {
      // zooms 0 and 1 use the cached for zoom level 2, just show more cells
      cacheTable: "observation_zooms_" + ((req.params.z < 2) ? 2 : req.params.z)
    };

    Step(
      function loadTaxonForTaxonFilter() {
        if (req.params.taxon_id) {
          loadTaxon(req, this);
        } else {
          return req;
        }
      },
      function loadMaxCountForGrid(err, req) {
        if (req.params.endpoint === "grid") {
          loookupMaxCountForGrid(req, this);
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
          if (x < -1 * maxCoord) { x = Math.abs(x) % numTiles; }
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

function stylesFromMaxCount(maximumCount) {
  var i, logTransformedCount, opacity;
  var numberOfStyles = 10;
  var minOpacity = .2;
  // Set the upper value twice as high in case the counts grow and the
  // lower value remains cached. That would create cells in the default color
  var styles = "[count<=" + (maximumCount * 2) + "] " +
    "{ polygon-fill: {{color}}; polygon-opacity:1.0; } ";
  // add more styles based on a log transform of the maximum count
  var maxLoggedCount = Math.log(maximumCount);
  for (i = (numberOfStyles - 1) ; i > 0 ; i--) {
    logTransformedCount = Math.round(Math.pow(Math.E, (maxLoggedCount/numberOfStyles) * i));
    opacity = (((i/numberOfStyles) * (1 - minOpacity)) + minOpacity).toFixed(2);
    styles += "[count<" + logTransformedCount + "] { polygon-fill: " +
      "{{color}}; polygon-opacity:" + opacity + "; } ";
  }
  return styles;
}

function startServer() {
  var ws = new Windshaft.Server(config);
  // Initialize tile server on port conf.application.listen_port
  var port = Number(process.env.PORT || conf.application.listen_port);
  ws.listen(port, function() {
    console.log("map tiles are now being served out of: http://localhost:" +
      conf.application.listen_port + config.base_url + "/:z/:x/:y");
  });
}

// Initialize the database connection and start the server
pgClient = new pg.Client(pgConfig);
pgClient.connect(function(err, pgClient) {
  startServer();
});
