var Windshaft = require("windshaft"),
    _ = require("underscore"),
    one = require("onecolor"),
    squel = require("squel"),
    conf = require("../config"),
    Step = require("step"),
    pg = require("pg"),
    cachedMaxCounts = { },
    inaturalist = { pgClient: null };

var debug = conf.application.debug_function,
    error = conf.application.error_function;

var pgConfig = {
  user: conf.database.user,
  password: conf.database.password,
  host: conf.database.host,
  port: conf.database.port,
  database: conf.database.database_name,
  ssl: conf.database.ssl
};

var iconicTaxonColors = {
  1: "#1E90FF",
  3: "#1E90FF",
  20978: "#1E90FF",
  26036: "#1E90FF",
  40151: "#1E90FF",
  47115: "#FF4500",
  47119: "#FF4500",
  47126: "#73AC13",
  47158: "#FF4500",
  47170: "#FF1493",
  47178: "#1E90FF",
  47686: "#8B008B",
  48222: "#993300"
};

var defaultPlaceColor = "#DAA520";
var defaultPlaceConfirmedColor = "#73AC13";
var defaultPlaceUnconfirmedColor = "#DAA520";
var defaultTaxonRangeColor = "#FF5EB0";

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

var gridQuery = squel.select()
  .field("count")
  .field(
    "ST_Envelope(" +
      "ST_GEOMETRYFROMTEXT('LINESTRING('||(st_xmax(the_geom)-({{seed}}/2))||' '||(st_ymax(the_geom)-({{seed}}/2))||','||(st_xmax(the_geom)+({{seed}}/2))||' '||(st_ymax(the_geom)+({{seed}}/2))||')',4326)"+
    ") AS geom");

var gridSnapQuery = squel.select()
  .field("count(*) as count")
  .field("ST_SnapToGrid(o.geom, 0+({{seed}}/2), 75+({{seed}}/2), {{seed}}, {{seed}}) AS the_geom")
  .from("observations o")
  .where("o.mappable = true")
  .where("o.private_latitude IS NULL")
  .where("o.private_longitude IS NULL")
  .group("ST_SnapToGrid(o.geom, 0+({{seed}}/2), 75+({{seed}}/2), {{seed}}, {{seed}})");

var placeQuery = squel.select()
  .field("geom")
  .from("place_geometries");

var statesQuery = squel.select()
  .field("geom")
  .from("places p")
  .join("place_geometries pg", null, "p.id=pg.place_id")
  .where("p.ancestry = '9853/1' and p.place_type='8'");

var taxonRangeQuery = squel.select()
  .field("geom")
  .from("taxon_ranges");

var defaultStylePoints =
  "#observations {" +
  "marker-fill: #585858; " +
  "marker-opacity: {{opacity}};" +
  "marker-width: 4;" +
  "marker-line-color: #D8D8D8;" +
  "marker-line-width: 1.5;" +
  "marker-line-opacity: {{border_opacity}};" +
  "marker-placement: point;" +
  "marker-type: ellipse;" +
  "marker-allow-overlap: true; " +
  "marker-comp-op: src; " +
  "[captive=true] { marker-opacity: 0.2; }" +
  "[iconic_taxon_id=1] { marker-fill: " + iconicTaxonColors[1] + "; } " +
  "[iconic_taxon_id=3] { marker-fill: " + iconicTaxonColors[3] + "; } " +
  "[iconic_taxon_id=20978] { marker-fill: " + iconicTaxonColors[20978] + "; } " +
  "[iconic_taxon_id=26036] { marker-fill: " + iconicTaxonColors[26036] + "; } " +
  "[iconic_taxon_id=40151] { marker-fill: " + iconicTaxonColors[40151] + "; } " +
  "[iconic_taxon_id=47115] { marker-fill: " + iconicTaxonColors[47115] + "; } " +
  "[iconic_taxon_id=47119] { marker-fill: " + iconicTaxonColors[47119] + "; } " +
  "[iconic_taxon_id=47126] { marker-fill: " + iconicTaxonColors[47126] + "; } " +
  "[iconic_taxon_id=47158] { marker-fill: " + iconicTaxonColors[47158] + "; } " +
  "[iconic_taxon_id=47170] { marker-fill: " + iconicTaxonColors[47170] + "; } " +
  "[iconic_taxon_id=47178] { marker-fill: " + iconicTaxonColors[47178] + "; } " +
  "[iconic_taxon_id=47686] { marker-fill: " + iconicTaxonColors[47686] + "; } " +
  "[iconic_taxon_id=48222] { marker-fill: " + iconicTaxonColors[48222] + "; } " +
  "[zoom >= 16] { marker-width: 4.5; marker-line-width: 1.5; } " +
  "[zoom >= 17] { marker-width: 5; marker-line-width: 1.5; } " +
  "[zoom >= 18] { marker-width: 6; marker-line-width: 2; } " +
  "[zoom >= 19] { marker-width: 8; marker-line-width: 2; } " +
  "[zoom >= 20] { marker-width: 10; marker-line-width: 2.5; } " +
  "[quality_grade='research'] { marker-line-color: white; } " +
  "{{overrideColor}}" +
  "}";

var defaultStyleGrid =
  "#observations {" +
  "polygon-fill:#6E6E6E; " +
  "polygon-opacity:{{opacity}}; " +
  "line-opacity:{{border_opacity}}; " +
  "line-color:#FFFFFF; " +
  "{{styleCounts}}";

var defaultStyleCounts =
  "[count>=45] { polygon-fill: {{color}}; polygon-opacity:1.0; } " +
  "[count<45] { polygon-fill: {{color}}; polygon-opacity:0.95; } " +
  "[count<35] { polygon-fill: {{color}}; polygon-opacity:0.87; } " +
  "[count<25] { polygon-fill: {{color}}; polygon-opacity:0.8; } " +
  "[count<15] { polygon-fill: {{color}}; polygon-opacity:0.7; } " +
  "[count<8] { polygon-fill: {{color}}; polygon-opacity:0.6; } " +
  "[count<3] { polygon-fill: {{color}}; polygon-opacity:0.5; } }";

var defaultStylePlace =
  "#places {" +
  "polygon-fill:{{color}}; " +
  "polygon-opacity:0.3; " +
  "line-width:2; " +
  "line-opacity:0.9; " +
  "line-color:{{color}}; }";

var defaultStyleTaxonPlace =
  "#taxon_places {" +
  "polygon-fill:{{unconfirmed-color}}; " +
  "polygon-opacity:0.3; " +
  "line-width:1; " +
  "line-opacity:0.9; " +
  "line-color:{{unconfirmed-color}}; " +
  "[last_observation_id > 0] { "+
  "  line-color:{{confirmed-color}}; "+
  "  polygon-fill:{{confirmed-color}}; } " +
  "[occurrence_status_level=10] { polygon-fill:#2E2E2E; line-color: #2E2E2E; } " +
  "[establishment_means='introduced'] { line-dasharray: 10, 6; } }";

var defaultStyleTaxonRange =
  "#taxon_ranges {" +
  "polygon-fill:{{color}}; " +
  "polygon-opacity:0.4; " +
  "line-opacity:0.9; " +
  "line-color:{{color}}; }";

inaturalist.gridRequest = function(req, callback) {
  if (req && parseInt(req.params.z) > conf.application.max_zoom_level_for_grids) {
    return callback("Unable to process grid requests for this zoom level");
  }
  if (req.params.user_id || req.params.place_id || req.params.project_id) {
    var outerQuery = gridQuery.clone(),
      innerQuery = gridSnapQuery.clone();
    inaturalist.addTaxonFilter(innerQuery, req);
    inaturalist.addUserFilter(innerQuery, req);
    inaturalist.addPlaceFilter(innerQuery, req);
    inaturalist.addProjectFilter(innerQuery, req);
    outerQuery.from("(" + innerQuery.toString() + ") AS snap_grid");
    req.params.sql = "(" + outerQuery.toString() + ") AS obs_grid";
    req.params.sql = req.params.sql.replace(/\{\{seed\}\}/g, inaturalist.requestSeed(req));
  } else {
    var denormalizedQuery = gridSnapQueryDenormalized.clone();
    inaturalist.addTaxonCondition(denormalizedQuery, req);
    req.params.sql = "(" + denormalizedQuery.toString() + ") AS snap_grid";
    req.params.sql = req.params.sql.replace(/\{\{cacheTable\}\}/g, req.inat.cacheTable);
  }
  req.params.style = defaultStyleGrid;
  if (req.inat.maximumCount) {
    req.params.style = req.params.style.replace(/\{\{styleCounts\}\}/g,
      inaturalist.stylesFromMaxCount(req.inat.maximumCount, req.params.opacity) + "}");
  } else {
    req.params.style = req.params.style.replace(/\{\{styleCounts\}\}/g, defaultStyleCounts);
  }
  if (req.params.color && req.params.color !== "undefined") {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g, req.params.color);
  } else if( req.inat.taxon && req.inat.taxon.iconicTaxonID && iconicTaxonColors[req.inat.taxon.iconicTaxonID] ) {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g, iconicTaxonColors[req.inat.taxon.iconicTaxonID]);
  } else {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g, "#6E6E6E");
  }
  inaturalist.addOpacityParameters(req);
  callback(null, req);
};

inaturalist.pointsRequest = function(req, callback) {
  if (req && parseInt(req.params.z) < conf.application.min_zoom_level_for_points) {
    return callback("Unable to process point requests for this zoom level");
  }
  req.params.style = defaultStylePoints;

  var query = pointQuery.clone( );
  inaturalist.addTaxonFilter(query, req);
  inaturalist.addUserFilter(query, req);
  inaturalist.addPlaceFilter(query, req);
  inaturalist.addProjectFilter(query, req);
  if( req.params.observation_id ) {
    var observationIDs = _.reject(
      _.map( req.params.observation_id.split(","), function( id ) {
        return parseInt( id );
      }), function( id ) {
        return _.isNaN( id );
      });
    query.where( "o.id NOT IN (" + observationIDs.join(",") + ")" );
  }
  req.params.sql = "(" + query.toString() + ") AS points";
  req.params.style = req.params.style.replace(/\{\{color\}\}/g, "#333333");
  req.params.style = req.params.style.replace(/\{\{outline_color\}\}/g, "#AAAAAA");
  inaturalist.addOpacityParameters(req);
  // this allows us to override all other conditions. Make some
  // simple condition that will always be true
  var overrideColor = "";
  if( req.params.color && req.params.color !== "undefined" ) {
    overrideColor = "[zoom >= 0] { marker-fill: " + req.params.color + "; } ";
  }
  req.params.style = req.params.style.replace(/\{\{overrideColor\}\}/g, overrideColor);
  callback(null, req);
};

inaturalist.placeRequest = function(req, callback) {
  req.params.style = defaultStylePlace;
  req.params.endpoint_or_id = parseInt( req.params.endpoint_or_id );
  var query = placeQuery.clone( ).where("place_id=" + req.params.endpoint_or_id);
  req.params.sql = "(" + query.toString() + ") AS places";
  var color = req.params.color ? req.params.color : defaultPlaceColor;
  req.params.style = req.params.style.replace(/\{\{color\}\}/g, color);
  callback(null, req);
};

inaturalist.taxonRangeRequest = function(req, callback) {
  req.params.style = defaultStyleTaxonRange;
  var query = taxonRangeQuery.clone( ).where("taxon_id=" + req.params.endpoint_or_id);
  req.params.sql = "(" + query.toString() + ") AS taxon_range";
  var color = req.params.color ? req.params.color : defaultTaxonRangeColor;
  req.params.style = req.params.style.replace(/\{\{color\}\}/g, color);
  callback(null, req);
};

inaturalist.taxonPlacesRequest = function(req, callback) {
  req.params.style = defaultStyleTaxonPlace;
  var admin_level = 0;
  // admin_level corresponds to specificity of location. As the user zooms in,
  // we want more specific locations (e.g. Country -> State -> County...)
  if( req.params.z >= 11 ) {
    admin_level = 3;
  } else if( req.params.z >= 6 ) {
    admin_level = 2;
  } else if( req.params.z >= 4 ) {
    admin_level = 1;
  }
  var query = squel.select()
    .field("geom")
    // to determine if the taxon has been observed in this geom
    .field("MAX(lt.last_observation_id) as last_observation_id")
    // to determine if the taxon is confirmed absent in this geom
    .field("MAX(lt.occurrence_status_level) as occurrence_status_level")
    // to determine if the taxon was introduced into this geom
    .field("MAX(lt.establishment_means) as establishment_means")
    .from("listed_taxa lt")
    .join("places p", null, "lt.place_id = p.id")
    .join("place_geometries pg", null, "p.id = pg.place_id")
    .where("lt.taxon_id = " + req.params.endpoint_or_id + " and p.admin_level = " + admin_level +"")
    .group("geom")
  req.params.sql = "(" + query.toString() + ") AS places";
  var unconfirmedColor = req.params.unconfirmed_color ? req.params.unconfirmed_color : defaultPlaceUnconfirmedColor;
  req.params.style = req.params.style.replace(/\{\{unconfirmed-color\}\}/g, unconfirmedColor);
  var confirmedColor = req.params.confirmed_color ? req.params.confirmed_color : defaultPlaceConfirmedColor;
  req.params.style = req.params.style.replace(/\{\{confirmed-color\}\}/g, confirmedColor);
  callback(null, req);
};

inaturalist.lookupMaxCountForGrid = function(req, callback) {
  var cacheKey = [
    req.params.taxon_id,
    req.params.user_id,
    req.params.place_id,
    req.params.project_id,
    req.inat.cacheTable
  ].toString();
  // If we have looked up the max cell count for these parameters, return it
  if (cachedMaxCounts[cacheKey]) {
    req.inat.maximumCount = cachedMaxCounts[cacheKey];
    return callback(null, req);
  }
  Step(
    function() {
      var countQuery = squel.select();
      if (req.params.user_id || req.params.place_id || req.params.project_id) {
        var outerQuery = gridQuery.clone(),
          innerQuery = gridSnapQuery.clone();
        inaturalist.addTaxonFilter(innerQuery, req);
        inaturalist.addUserFilter(innerQuery, req);
        inaturalist.addPlaceFilter(innerQuery, req);
        inaturalist.addProjectFilter(innerQuery, req);
        outerQuery.from("(" + innerQuery.toString() + ") AS snap_grid");
        var wrapperQuery = "("+ outerQuery.toString() +") AS obs_grid";
        wrapperQuery = wrapperQuery.replace(/\{\{seed\}\}/g, inaturalist.requestSeed(req));
        countQuery.field("MAX(count) as max")
          .from(wrapperQuery);
      } else {
        countQuery.field("MAX(count) as max")
         .from(req.inat.cacheTable);
        inaturalist.addTaxonCondition(countQuery, req);
      }
      inaturalist.pgClient.query(countQuery.toString(), this);
    },
    function handleResult(err, result) {
      if (err) { error("[ERROR] error running query", err); }
      if (result && result.rows.length > 0) {
        req.inat.maximumCount = result.rows[0].max;
        cachedMaxCounts[cacheKey] = result.rows[0].max;
      }
      callback(null, req);
    }
  );
};

inaturalist.loadTaxon = function(req, callback) {
  var taxonID = req.params.taxon_id;
  Step(
    function() {
      inaturalist.pgClient.query("SELECT id, name, rank, rank_level, iconic_taxon_id FROM taxa WHERE id = " + taxonID, this);
    },
    function handleResult(err, result) {
      if (err) { error("[ERROR] error running query", err); }
      if (result && result.rows.length > 0) {
        req.inat.taxon = {
          id: result.rows[0].id,
          name: result.rows[0].name,
          rank: result.rows[0].rank,
          rankLevel: result.rows[0].rank_level,
          iconicTaxonID: result.rows[0].iconic_taxon_id
        };
      }
      callback(null, req);
    }
  );
};

inaturalist.requestSeed = function(req) {
  var seed = 16 / Math.pow(2, parseInt(req.params.z));
  if (seed > 4) seed = 4;
  else if (seed == 1) seed = 0.99;
  return seed;
};

inaturalist.addTaxonFilter = function(query, req) {
  if (req.inat.taxon) {
    query.join("taxon_ancestors ta", null, "ta.taxon_id = o.taxon_id")
         .where("ta.ancestor_taxon_id = " + req.inat.taxon.id);
  }
};

inaturalist.addTaxonCondition = function(query, req) {
  var taxonIDClause = req.params.taxon_id ? "= " +
    parseInt( req.params.taxon_id ) : "IS NULL";
  query.where("taxon_id " + taxonIDClause);
};

inaturalist.addUserFilter = function(query, req) {
  if (req.params.user_id) {
    query.join("users u", null, "o.user_id = u.id")
      .where("u.id = " + parseInt( req.params.user_id ));
  }
};

inaturalist.addPlaceFilter = function(query, req) {
  if (req.params.place_id) {
    query.join("place_geometries pg", null, "(ST_Intersects(pg.geom, o.private_geom))")
      .where("pg.place_id = " + parseInt( req.params.place_id ));
  }
};

inaturalist.addProjectFilter = function(query, req) {
  if (req.params.project_id) {
    query.join("project_observations po", null, "o.id = po.observation_id")
      .where("po.project_id = " + parseInt( req.params.project_id ));
  }
};

inaturalist.addOpacityParameters = function( req ) {
  req.params.opacity = req.params.opacity || 1.0;
  req.params.style = req.params.style.replace(/\{\{opacity\}\}/g,
    parseFloat( req.params.opacity ));
  req.params.border_opacity = req.params.border_opacity || 1.0;
  req.params.style = req.params.style.replace(/\{\{border_opacity\}\}/g,
    parseFloat( req.params.border_opacity ));
};

inaturalist.stylesFromMaxCount = function(maximumCount, maximumOpacity) {
  var i, logTransformedCount, opacity;
  var numberOfStyles = 10;
  var minOpacity = 0.2;
  maximumOpacity = maximumOpacity || 1.0;
  // Set the upper value twice as high in case the counts grow and the
  // lower value remains cached. That would create cells in the default color
  var styles = "[count<=" + (maximumCount * 2) + "] " +
    "{ polygon-fill: {{color}}; polygon-opacity:" + maximumOpacity + "; } ";
  // add more styles based on a log transform of the maximum count
  var maxLoggedCount = Math.log(maximumCount);
  for (i = (numberOfStyles - 1) ; i > 0 ; i--) {
    logTransformedCount = Math.round(Math.pow(Math.E, (maxLoggedCount/numberOfStyles) * i));
    opacity = (((i/numberOfStyles) * (1 - minOpacity)) + minOpacity).toFixed(2);
    opacity *= maximumOpacity;
    styles += "[count<" + logTransformedCount + "] { polygon-fill: " +
      "{{color}}; polygon-opacity:" + opacity + "; } ";
  }
  return styles;
};

inaturalist.req2params = function(req, callback) {
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
        inaturalist.loadTaxon(req, this);
      } else {
        return req;
      }
    },
    function loadMaxCountForGrid(err, req) {
      if (req.params.endpoint_or_id === "grid") {
        inaturalist.lookupMaxCountForGrid(req, this);
      } else {
        return req;
      }
    },
    function processRequestForEndpoint(err, req) {
      // in lieu of a proper router
      if (req.params.table === "observations") {
        // GET /observations/grid/
        if (req.params.endpoint_or_id === "grid") {
          req.params.endpoint = "grid";
          inaturalist.gridRequest(req, this);
          return req;
        }
        // GET /observations/points/
        else if (req.params.endpoint_or_id === "points") {
          req.params.endpoint = "points";
          inaturalist.pointsRequest(req, this);
          return req;
        }
      } else {
        // GET /places/
        if (req.params.table === "places") {
          req.params.endpoint = "places";
          inaturalist.placeRequest(req, this);
          return req;
        }
        // GET /taxon_ranges/
        else if (req.params.table === "taxon_ranges") {
          req.params.endpoint_or_id = parseInt( req.params.endpoint_or_id );
          req.params.endpoint = "taxon_ranges";
          inaturalist.taxonRangeRequest(req, this);
          return req;
        }
        // GET /taxon_places/
        else if (req.params.table === "taxon_places") {
          req.params.endpoint_or_id = parseInt( req.params.endpoint_or_id );
          req.params.endpoint = "taxon_places";
          inaturalist.taxonPlacesRequest(req, this);
          return req;
        }
      }
      // just a precaution to try and prevent sql injection
      req.params.sql = "(SELECT geom FROM observations WHERE 1 = 2) AS foo";
      return req;
    },
    inaturalist.finalizeRequest,
    callback
  );
};

inaturalist.beforeTileRender = function( req, res, callback ) {
  callback(null);
};

inaturalist.afterTileRender = function( req, res, tile, headers, callback ) {
  headers["Cache-Control"] = "public, max-age=" +
    (req.params.ttl || conf.application.cache_max_age[ req.params.endpoint ] || "3600");
  callback(null, tile, headers);
};

global.environment = {
  postgres: {
    geometry_field: conf.database.geometry_field,
    srid: conf.database.srid
  },
  millstone: {
    cache_basedir: '/tmp/windshaft-test/millstone'
  }
};

inaturalist.config = {
  base_url: "/:table/:endpoint_or_id",
  base_url_notable: "/:endpoint_or_id",
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
  mapnik: {
    metatile:4,
    bufferSize:64
  },
  redis: { host: conf.redis.host, port: conf.redis.port },
  enable_cors: true,
  req2params: inaturalist.req2params,
  beforeTileRender: inaturalist.beforeTileRender,
  afterTileRender: inaturalist.afterTileRender
};

inaturalist.finalizeRequest = function( err, req ) {
  if (err) {
    error("[ERROR] failed to process request for endpoint, err: " + err);
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
      debug("[DEBUG] req.params.sql: ", req.params.sql);
    }
  }
  return req;
};

inaturalist.startServer = function( callback ) {
  var ws = new Windshaft.Server( inaturalist.config );
  // Initialize tile server on port conf.application.listen_port
  var port = Number( process.env.PORT || conf.application.listen_port );
  ws.listen( port, callback );
};

// Initialize the database connection and start the server
inaturalist.connect = function( callback ) {
  inaturalist.pgClient = new pg.Client( pgConfig );
  inaturalist.pgClient.connect( function( err ) {
    callback( );
  });
};

inaturalist.setErrorCallback = function( callback ) {
  error = callback;
};

inaturalist.setDebugCallback = function( callback ) {
  debug = callback;
};

inaturalist.setDebug = function( debug ) {
  conf.debug = debug;
};

module.exports = inaturalist;
