var Windshaft = require('windshaft')
var _         = require('underscore')
var one       = require('onecolor')
var squel     = require('squel')
var conf      = require('./config')
var Step       = require('step')
var pg = require('pg')
var pgConnString = 
  "postgres://"+conf.database.user+
  "@"+conf.database.host+
  ":"+conf.database.port+
  "/"+conf.database.database_name

squel.useFlavour('postgres')

var pointQuery = squel.select()
  .field('o.id')
  .field('o.species_guess')
  .field('o.iconic_taxon_id')
  .field('o.taxon_id')
  .field('o.latitude')
  .field('o.longitude')
  .field('ST_SetSrid(o.geom, 4326) AS geom')
  .field('o.positional_accuracy')
  .field('o.captive')
  .field('o.quality_grade')
  .from('observations o')

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
  "[quality_grade='research'] {marker-line-color: white;} " +
  "[captive=true] {marker-opacity: 0.2;}" +
  "[taxon_id=2] { marker-fill: #1E90FF; } " +
  "[taxon_id=3] { marker-fill: #1E90FF; } " +
  "[taxon_id=5] { marker-fill: #1E90FF; } " +
  "[taxon_id=6] { marker-fill: #1E90FF; } " +
  "[taxon_id=7] { marker-fill: #1E90FF; } " +
  "[taxon_id=8] { marker-fill: #1E90FF; } " +
  "[taxon_id=9] { marker-fill: #FF4500; } " +
  "[taxon_id=11] { marker-fill: #FF4500; } " +
  "[taxon_id=12] { marker-fill: #73AC13; } " +
  "[taxon_id=13] { marker-fill: #FF1493; } " +
  "[taxon_id=14] { marker-fill: #8B008B; } " +
  "[taxon_id=15] { marker-fill: #FF4500; } " +
  "[taxon_id=16] { marker-fill: #993300; } " +
  "}"

var pointPrecisionQuery = squel.select()
  .field('o.id')
  .field('o.quality_grade')
  .field('o.taxon_id')
  .field('o.positional_accuracy')
  .field('ST_Buffer(ST_SetSrid(o.geom, 4326)::geography, positional_accuracy)::geometry AS geom')
  .from('observations o')
  .where('o.positional_accuracy > 0')

var pointPrecisionStyle =
  "#observations {" +
    "polygon-fill: transparent;" +
    "polygon-smooth: 1;" +
    "line-dasharray: 2, 2;" +
    "line-width: 1;" +
    "line-color: {{color}};" +
  "}"

var gridQuery = squel.select()
  .field('cnt')
  .field(
    "ST_Envelope(" +
      "ST_GEOMETRYFROMTEXT('LINESTRING('||(st_xmax(the_geom)-({{seed}}/2))||' '||(st_ymax(the_geom)-({{seed}}/2))||','||(st_xmax(the_geom)+({{seed}}/2))||' '||(st_ymax(the_geom)+({{seed}}/2))||')',4326)"+
    ") AS geom"
  )
var gridSnapQuery = squel.select()
  .field("count(*) as cnt")
  .field("ST_SnapToGrid(geom, 0+({{seed}}/2), 75+({{seed}}/2), {{seed}}, {{seed}}) AS the_geom")
  .from('observations o')
  .group('ST_SnapToGrid(geom, 0+({{seed}}/2), 75+({{seed}}/2), {{seed}}, {{seed}})')

var gridSnapQueryZooms = squel.select()
  .field("count as cnt")
  .field("geom AS the_geom")
  .from("observation_zooms_{{1000seed}}")

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
  "[cnt>=25] { polygon-fill: {{color}}; polygon-opacity:1.0;  } " +
  "[cnt<25]  { polygon-fill: {{color}}; polygon-opacity:0.9;  } " +
  "[cnt<15]  { polygon-fill: {{color}}; polygon-opacity:0.8;  } " +
  "[cnt<10]  { polygon-fill: {{color}}; polygon-opacity:0.7;  } " +
  "[cnt<5]  { polygon-fill: {{color}}; polygon-opacity:0.6;  } }";

function gridRequest(req, callback) {
  var seed = 16/Math.pow(2,parseInt(req.params.z));
  if (seed > 4) {
    seed = 4;
  } else if (seed == 1){
    seed = 0.99;
  }
  var gq = gridQuery.clone(),
      sq;
  if(seed >= 0.125 && (!req.inat || !req.inat.taxon)) sq = gridSnapQueryZooms.clone();
  else sq = gridSnapQuery.clone();
  if (req.inat && req.inat.taxon) {
    gq.field('taxon_id')
    sq.field('o.taxon_id')
    sq
      .join('taxa t', null, 't.id = o.taxon_id')
      .where(
        't.id = '+req.inat.taxon.id+ 
        " OR t.ancestry = '" + req.inat.taxon.child_ancestry + "'" +
        " OR t.ancestry LIKE '" + req.inat.taxon.descendant_ancestry + "'")
    sq.group('o.taxon_id')
  }
  gq.from('('+sq.toString()+') AS snap_grid')
  req.params.sql = '('+gq.toString()+') AS obs_grid'
  req.params.sql = req.params.sql.replace(/\{\{seed\}\}/g, seed);
  req.params.sql = req.params.sql.replace(/\{\{1000seed\}\}/g, seed * 1000);
  if (!req.params.style) {
    req.params.style = defaultStyleGrid;
  }
  if (req.params.color && req.params.color != 'undefined') {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g,req.params.color)
  } else {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g,'#333333')
  }
  callback(null, req)
}

function pointsRequest(req, callback) {
  if (!req.params.style) {
    req.params.style = defaultStylePoints;
  }
  req = commonPointRequest(req, pointQuery.clone(), callback)
}

function pointPrecisionsRequest(req, callback) {
  if (!req.params.style) {
    req.params.style = pointPrecisionStyle;
  }
  req = commonPointRequest(req, pointPrecisionQuery.clone(), callback)
}

function commonPointRequest(req, query, callback) {
  if (req.inat && req.inat.taxon) {
    query
      .join('taxa t', null, 't.id = o.taxon_id')
      .where(
        't.id = '+req.inat.taxon.id+ 
        " OR t.ancestry = '" + req.inat.taxon.child_ancestry + "'" +
        " OR t.ancestry LIKE '" + req.inat.taxon.descendant_ancestry + "'")
  }
  if (req.params.obs_id) {
    query.where("o.id != "+req.params.obs_id)
  }
  req.params.sql = '('+query.toString()+') AS points'
  if (req.params.color && req.params.color != 'undefined') {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g, req.params.color)
    var c = one(req.params.color),
        outlineColor = c.lightness() > 0.6 ? c.lightness(0.4).hex() : c.lightness(0.8).hex()
    req.params.style = req.params.style.replace(/\{\{outline_color\}\}/g, outlineColor)
  } else {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g,'#333333');
    req.params.style = req.params.style.replace(/\{\{outline_color\}\}/g,'#AAAAAA')
  }
  callback(null, req)
}

function timelineRequest(req, callback) {
  /*req.params.sql = "(SELECT id, observed_on, species_guess, iconic_taxon_id, taxon_id, latitude, longitude, geom, " +
    "positional_accuracy, captive, quality_grade FROM " +
    "observations o WHERE observed_on <= TO_DATE('{{date_up}}','YYYY-MM-DD')) as observations";*/
  req.params.sql = "(SELECT id, observed_on, species_guess, iconic_taxon_id, taxon_id, latitude, longitude, geom, " +
    "positional_accuracy, captive, quality_grade FROM " +
    "observations o WHERE TO_CHAR(observed_on,'YYYY-MM') = '{{date_up}}') as observations";
  if (typeof(req.params.date_up) == 'undefined') {
    req.params.date_up = '2010-01-01';
  }
  req.params.sql = req.params.sql.replace(/\{\{date_up\}\}/g,req.params.date_up);
  req.params.style =  "#observations {" +
    "marker-fill: {{color}}; " +
    "marker-opacity: 1;" +
    "marker-width: 8;" +
    "marker-line-color: white;" +
    "marker-line-width: 2;" +
    "marker-line-opacity: 0.9;" +
    "marker-placement: point;" +
    "marker-type: ellipse;" +
    "marker-allow-overlap: true; " +  
    "}";
  if (typeof(req.params.color) == 'undefined') {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g,'#1E90FF');
  } else {
    req.params.style = req.params.style.replace(/\{\{color\}\}/g,req.params.color);
  }
  req.params.interactivity="id";
  callback(null, req)
}

var loadTaxon = function(req, callback) {
  var taxonId = req.params.taxon_id
  Step(
    function() {
      pg.connect(pgConnString, this)
    },
    function handleConnection(err, client, done) {
      if (err) {
        console.error('could not connect to postgres', err)
        callback(null, req)
        return null
      }
      client.query('SELECT id, name, ancestry, rank, rank_level FROM taxa WHERE id = '+taxonId, this)
      done()
    },
    function handleResult(err, result) {
      if (err) console.error('error running query', err)
      if (result.rows.length > 0) {
        var ancestry = result.rows[0].ancestry
        req.inat = req.inat || {}
        req.inat.taxon = {
          id: result.rows[0].id,
          name: result.rows[0].name,
          rank: result.rows[0].rank,
          rankLevel: result.rows[0].rank_level,
          ancestry: ancestry,
          child_ancestry: ancestry + '/' + taxonId,
          descendant_ancestry: ancestry + '/' + taxonId + '/%'
        }
      }
      callback(null, req)
    }
  )
}

var config = {
  base_url: '/:table/:endpoint',
  base_url_notable: '/:endpoint',
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

    req.params.dbname = conf.database.database_name;

    Step(
      function loadTaxonForTaxonFilter() {
        if (req.params.taxon_id) {
          loadTaxon(req, this)
        } else {
          return req
        }
      },
      function processRequestForEndpoint(err, req) {
        if (err) {
          console.log("[DEBUG] failed to get ancestries")
        }
        // in lieu of a proper router
        if (req.params.endpoint == 'grid') {    //Grid endpoint
          gridRequest(req, this)
        } else if (req.params.endpoint == 'points') { // Points endpoint
          pointsRequest(req, this)
        } else if (req.params.endpoint == 'precisions') {
          pointPrecisionsRequest(req, this)
        } else if (req.params.endpoint == 'timeline') {
          timelineRequest(req, this)
        } else {
          // just a precaution to try and prevent sql injection
          req.params.sql = "(SELECT geom FROM observations WHERE 1 = 2) AS foo"
          return req
        }
      },
      function finalize(err, req) {
        if (err) {
          console.log("[DEBUG] failed to process request for endpoint, err: " + err)
        }
        // send the finished req object on
        var x = parseInt(req.params.x),
            y = parseInt(req.params.y),
            z = parseInt(req.params.z),
            numTiles = Math.pow(2,z),
            maxCoord = numTiles - 1
        
        x = x >= 0 ? x : maxCoord + x
        y = y >= 0 ? y : maxCoord + y
        if (x > maxCoord) {x = x % numTiles}
        if (y > maxCoord) {y = y % numTiles}
        if (x < -1*maxCoord) {x = Math.abs(x) % numTiles}
        if (y < -1*maxCoord) {y = Math.abs(y) % numTiles}
        req.params.x = ''+x
        req.params.y = ''+y
        req.params.z = ''+z

        if (conf.debug) {
          console.log("[DEBUG] req.params.sql: ", req.params.sql)
        }

        callback(null,req);
      }
    )
  },
  beforeTileRender: function(req, res, callback) {
    callback(null);
  }
}

// Initialize tile server on port 4000
var ws = new Windshaft.Server(config)
ws.listen(4000)
console.log("map tiles are now being served out of: http://localhost:4000" + config.base_url + '/:z/:x/:y');
