var squel = require( "squel" ),
    expect = require( "chai" ).expect,
    inaturalist = require( "../lib/inaturalist" ),
    conf = require("../config"),
    req, query,
    emptyRequest = { inat: { }, params: { } };

var assertError = function( err ) {
  expect( err ).to.include( "[ERROR]" );
};

var assertDebug = function( debug ) {
  expect( debug ).to.include( "[DEBUG]" );
};

inaturalist.setErrorCallback( assertError );
inaturalist.setDebugCallback( assertDebug );

describe( "inaturalist", function( ) {

  describe( "connect", function( ) {
    it( "connects to the DB and assigns pgClient", function( done ) {
      expect( inaturalist.pgClient ).to.be.null;
      inaturalist.connect( function( ) {
        expect( inaturalist.pgClient ).to.not.be.null;
        done( );
      });
    });
  });

  describe( "startServer", function( ) {
    it( "starts the server", function( done ) {
      inaturalist.startServer( function( ) {
        done( );
      });
    });
  });

  describe( "loadTaxon", function( ) {
    it( "loads a taxon from the database", function( done ) {
      var req = { inat: { }, params: { taxon_id: 1 } };
      expect( req.inat.taxon ).to.be.undefined;
      inaturalist.loadTaxon( req, function( ) {
        expect( req.inat.taxon ).to.not.be.null;
        expect( req.inat.taxon.id ).to.equal( 1 );
        expect( req.inat.taxon.name ).to.equal( "Animalia" );
        expect( req.inat.taxon.rank ).to.equal( "kingdom" );
        done( );
      });
    });

    it( "throws an error when a query fails", function( done ) {
      var req = { inat: { }, params: { taxon_id: 'abcd' } };
      expect( req.inat.taxon ).to.be.undefined;
      inaturalist.loadTaxon( req, function( ) {
        expect( req.inat.taxon ).to.be.undefined;
        done( );
      });
    });
  });

  describe( "gridRequest", function( ) {
    beforeEach( function( ) {
      req = { inat: { cacheTable: "CT" }, params: { taxon_id: 1 } };
    });

    it( "creates the most basic grid query", function( done ) {
      expect( req.params.sql ).to.be.undefined;
      expect( req.params.style ).to.be.undefined;
      inaturalist.gridRequest( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT count, geom FROM CT WHERE (taxon_id = 1)) AS snap_grid" );
        expect( req.params.style ).to.include( "[count>=45]" );
        done( );
      });
    });

    it( "filters by user", function( done ) {
      req.params.user_id = 1;
      inaturalist.gridRequest( req, function( ) {
        expect( req.params.sql ).to.include(
          "INNER JOIN users u ON (o.user_id = u.id)" );
        expect( req.params.sql ).to.include( "AND (u.id = 1)" );
        done( );
      });
    });

    it( "bases grid opacity on maximum count", function( done ) {
      req.inat.maximumCount = 1000;
      inaturalist.gridRequest( req, function( ) {
        expect( req.params.style ).to.include(
          "[count<=2000] { polygon-fill: #6E6E6E; polygon-opacity:1; }" );
        expect( req.params.style ).to.include(
          "[count<2] { polygon-fill: #6E6E6E; polygon-opacity:0.28; }" );
        done( );
      });
    });

    it( "sets the color based on parameter", function( done ) {
      req.params.color = "#ABCDEF";
      expect( req.params.style ).to.not.include( "#ABCDEF" );
      inaturalist.gridRequest( req, function( ) {
        expect( req.params.style ).to.include( "#ABCDEF" );
        done( );
      });
    });

    it( "fails when Z is out of bounds", function( done ) {
      req.params.z = 13;
      inaturalist.gridRequest( req, function( err ) {
        expect( err ).to.equal( "Unable to process grid requests for this zoom level" );
        done( );
      });
    });
  });

  describe( "pointsRequest", function( ) {
    beforeEach( function( ) {
      req = { inat: { cacheTable: "CT" }, params: { taxon_id: 1 } };
    });

    it( "creates the most basic points query", function( done ) {
      expect( req.params.sql ).to.be.undefined;
      expect( req.params.style ).to.be.undefined;
      inaturalist.pointsRequest( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT o.id, o.species_guess, o.iconic_taxon_id, o.taxon_id, " +
          "o.latitude, o.longitude, o.geom, o.positional_accuracy, " +
          "o.captive, o.quality_grade FROM observations o " +
          "WHERE (o.mappable = true) AND (o.private_latitude IS NULL) " +
          "AND (o.private_longitude IS NULL)) AS points" );
        expect( req.params.style ).to.include(
          "[iconic_taxon_id=47686] { marker-fill: #8B008B; }" );
        done( );
      });
    });

    it( "filters by observation", function( done ) {
      req.params.observation_id = 1;
      inaturalist.pointsRequest( req, function( ) {
        expect( req.params.sql ).to.include( "AND (o.id != 1)" );
        done( );
      });
    });

    it( "fails when Z is out of bounds", function( done ) {
      req.params.z = 8;
      inaturalist.pointsRequest( req, function( err ) {
        expect( err ).to.equal( "Unable to process point requests for this zoom level" );
        done( );
      });
    });

    it( "can set an overriding color", function( done ) {
      req.params.color = "#ABCDEF";
      inaturalist.pointsRequest( req, function( err ) {
        expect( req.params.style ).to.include(
          "[zoom >= 0] { marker-fill: #ABCDEF; }" );
        done( );
      });
    });
  });

  describe( "lookupMaxCountForGrid", function( ) {
    beforeEach( function( ) {
      req = { inat: { cacheTable: "observation_zooms_2" }, params: { z: 1 } };
    });

    it( "looks up max counts with no filters", function( done ) {
      expect( req.inat.maximumCount ).to.be.undefined;
      inaturalist.lookupMaxCountForGrid( req, function( ) {
        expect( req.inat.maximumCount ).to.be.above( 150000 );
        done( );
      });
    });

    // this is a poor test. Hard to test if the value was fetched in
    // real-time or cached. But the code coverage report will show
    // the cache code being called. As long as we get the right value...
    it( "caches max counts", function( done ) {
      expect( req.inat.maximumCount ).to.be.undefined;
      inaturalist.lookupMaxCountForGrid( req, function( ) {
        inaturalist.lookupMaxCountForGrid( req, function( ) {
          expect( req.inat.maximumCount ).to.be.above( 150000 );
          done( );
        });
      });
    });

    it( "looks up max counts with a taxon filter", function( done ) {
      req.params.taxon_id = 1;
      expect( req.inat.maximumCount ).to.be.undefined;
      inaturalist.lookupMaxCountForGrid( req, function( ) {
        expect( req.inat.maximumCount ).to.be.below( 150000 );
        expect( req.inat.maximumCount ).to.be.above( 75000 );
        done( );
      });
    });

    it( "looks up max counts with a user filter", function( done ) {
      req.params.user_id = 1;
      expect( req.inat.maximumCount ).to.be.undefined;
      inaturalist.lookupMaxCountForGrid( req, function( ) {
        expect( req.inat.maximumCount ).to.be.below( 20000 );
        expect( req.inat.maximumCount ).to.be.above( 10000 );
        done( );
      });
    });

    it( "throws an error when the query fails", function( done ) {
      req.inat.cacheTable = "dummy_table";
      expect( req.inat.maximumCount ).to.be.undefined;
      inaturalist.lookupMaxCountForGrid( req, function( ) {
        expect( req.inat.maximumCount ).to.be.undefined;
        done( );
      });
    });
  });

  describe( "req2params", function( ) {
    beforeEach( function( ) {
      req = { params: { x: 1, y: 1, z: 1 } };
    });

    it( "runs a dummy query when there is no endpoint", function( done ) {
      inaturalist.req2params( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT geom FROM observations WHERE 1 = 2) AS foo" );
        done( );
      });
    });

    it( "runs a dummy query when there is a wrong endpoint", function( done ) {
      req.params.table = "observations";
      req.params.endpoint_or_id = "somethingOtherThanGridOrPoints";
      inaturalist.req2params( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT geom FROM observations WHERE 1 = 2) AS foo" );
        done( );
      });
    });

    it( "passes off to the grid endpoint", function( done ) {
      req.params.table = "observations";
      req.params.endpoint_or_id = "grid";
      inaturalist.req2params( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT count, geom FROM observation_zooms_2 WHERE (taxon_id IS NULL)) AS snap_grid" );
        done( );
      });
    });

    it( "filters by taxon", function( done ) {
      req.params.table = "observations";
      req.params.endpoint_or_id = "grid";
      req.params.taxon_id = 1;
      inaturalist.req2params( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT count, geom FROM observation_zooms_2 WHERE (taxon_id = 1)) AS snap_grid" );
        done( );
      });
    });

    it( "passes off to the points endpoint", function( done ) {
      req.params.z = 12;
      req.params.table = "observations";
      req.params.endpoint_or_id = "points";
      inaturalist.req2params( req, function( ) {
        expect( req.params.sql ).to.include( "AS points" );
        done( );
      });
    });

    it( "passes off to the places endpoint", function( done ) {
      req.params.z = 12;
      req.params.table = "places";
      req.params.endpoint_or_id = 1;
      inaturalist.req2params( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT geom FROM place_geometries WHERE (place_id=1)) AS place" );
        done( );
      });
    });

    it( "passes off to the taxon_ranges endpoint", function( done ) {
      req.params.z = 12;
      req.params.table = "taxon_ranges";
      req.params.endpoint_or_id = 1;
      inaturalist.req2params( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT geom FROM taxon_ranges WHERE (taxon_id=1)) AS taxon_range" );
        done( );
      });
    });

    it( "passes off to the taxon_ranges endpoint", function( done ) {
      inaturalist.setDebug( true );
      req.params.table = "observations";
      req.params.endpoint_or_id = "grid";
      req.params.taxon_id = 1;
      inaturalist.req2params( req, function( ) {
        expect( req.params.sql ).to.equal(
          "(SELECT count, geom FROM observation_zooms_2 WHERE (taxon_id = 1)) AS snap_grid" );
        done( );
      });
    });
  });

  describe( "finalizeRequest", function( ) {
    beforeEach( function( ) {
      req = { params: { x: 1, y: 1, z: 3 } };
    });

    it( "only modified coordinates if necessary", function( ) {
      inaturalist.finalizeRequest( null, req );
      expect( req.params.x ).to.equal( "1" );
      expect( req.params.y ).to.equal( "1" );
      expect( req.params.z ).to.equal( "3" );
    });

    it( "mods X coordinate when too high", function( ) {
      req.params.x = 10;
      inaturalist.finalizeRequest( null, req );
      expect( req.params.x ).to.equal( "2" );
    });

    it( "updates X coordinate when too low", function( ) {
      req.params.x = -20;
      inaturalist.finalizeRequest( null, req );
      expect( req.params.x ).to.equal( "5" );
    });

    it( "updates Y coordinate when too low", function( ) {
      req.params.y = -2;
      inaturalist.finalizeRequest( null, req );
      expect( req.params.y ).to.equal( "5" );
    });

    // this isn't a great test. We want to test an error is thrown, which means
    // calling assertDebug. You can really only find out in the code coverage
    // report. We can however confirm the integer 1 doesn't get turned into a string
    it( "throws an error when there is one", function( ) {
      expect( req.params.x ).to.equal( 1 );
      inaturalist.finalizeRequest( "err", req );
      expect( req.params.x ).to.equal( 1 );
    });
  });

  describe( "requestSeed", function( ) {
    it( "creates the right seeds", function( ) {
      expect( inaturalist.requestSeed( { params: { z: 0 } } )).to.equal( 4 );
      expect( inaturalist.requestSeed( { params: { z: 1 } } )).to.equal( 4 );
      expect( inaturalist.requestSeed( { params: { z: 2 } } )).to.equal( 4 );
      expect( inaturalist.requestSeed( { params: { z: 3 } } )).to.equal( 2 );
      // this is really the only tricky one
      expect( inaturalist.requestSeed( { params: { z: 4 } } )).to.equal( 0.99 );
      expect( inaturalist.requestSeed( { params: { z: 5 } } )).to.equal( 0.5 );
      expect( inaturalist.requestSeed( { params: { z: 6 } } )).to.equal( 0.25 );
      expect( inaturalist.requestSeed( { params: { z: 7 } } )).to.equal( 0.125 );
      expect( inaturalist.requestSeed( { params: { z: 8 } } )).to.equal( 0.0625 );
    });
  });

  describe( "filters", function( ) {
    beforeEach( function( ) {
      req = {
        inat: { taxon: { id: 1 } },
        params: { taxon_id: 1, user_id: 1, project_id: 1, place_id: 1 }
      };
      query = squel.select( ).from( "observations o" );
    });

    describe( "addTaxonFilter", function( ) {
      it( "adds a filter when there is a taxon", function( ) {
        inaturalist.addTaxonFilter( query, req );
        expect( query.toString( ) ).to.include(
          "INNER JOIN taxon_ancestors ta ON (ta.taxon_id = o.taxon_id) " +
          "WHERE (ta.ancestor_taxon_id = 1)" );
      });

      it( "does not add a filter filter when there is no taxon", function( ) {
        inaturalist.addTaxonFilter( query, emptyRequest );
        expect( query.toString( ) ).to.not.include(
          "INNER JOIN taxon_ancestors ta ON (ta.taxon_id = o.taxon_id) " +
          "WHERE (ta.ancestor_taxon_id = 1)" );
      });
    });

    describe( "addUserFilter", function( ) {
      it( "adds a filter when there is a user", function( ) {
        inaturalist.addUserFilter( query, req );
        expect( query.toString( ) ).to.include(
          "INNER JOIN users u ON (o.user_id = u.id) WHERE (u.id = 1)" );
      });

      it( "does not add a filter filter when there is no user", function( ) {
        inaturalist.addUserFilter( query, emptyRequest );
        expect( query.toString( ) ).to.not.include(
          "INNER JOIN users u ON (o.user_id = u.id) WHERE (u.id = 1)" );
      });
    });

    describe( "addPlaceFilter", function( ) {
      it( "adds a filter when there is a place", function( ) {
        inaturalist.addPlaceFilter( query, req );
        expect( query.toString( ) ).to.include(
          "INNER JOIN place_geometries pg ON " +
          "((ST_Intersects(pg.geom, o.private_geom))) WHERE (pg.place_id = 1)" );
      });

      it( "does not add a filter filter when there is no place", function( ) {
        inaturalist.addPlaceFilter( query, emptyRequest );
        expect( query.toString( ) ).to.not.include(
          "INNER JOIN place_geometries pg ON " +
          "((ST_Intersects(pg.geom, o.private_geom))) WHERE (pg.place_id = 1)" );
      });
    });

    describe( "addProjectFilter", function( ) {
      it( "adds a filter when there is a project", function( ) {
        inaturalist.addProjectFilter( query, req );
        expect( query.toString( ) ).to.include(
          "INNER JOIN project_observations po ON (o.id = po.observation_id) " +
          "WHERE (po.project_id = 1)" );
      });

      it( "does not add a filter filter when there is no project", function( ) {
        inaturalist.addProjectFilter( query, emptyRequest );
        expect( query.toString( ) ).to.not.include(
          "INNER JOIN project_observations po ON (o.id = po.observation_id) " +
          "WHERE (po.project_id = 1)" );
      });
    });

    describe( "addTaxonCondition", function( ) {
      it( "adds a condition when there is a taxon", function( ) {
        inaturalist.addTaxonCondition( query, req );
        expect( query.toString( ) ).to.include(
          "WHERE (taxon_id = 1)" );
      });

      it( "add a NULL condition when there is no taxon", function( ) {
        inaturalist.addTaxonCondition( query, emptyRequest );
        expect( query.toString( ) ).to.include(
          "WHERE (taxon_id IS NULL)" );
      });
    });
  });

  describe( "stylesFromMaxCount", function( ) {
    it( "creates the right styles for a maximum value", function( ) {
      var styles = inaturalist.stylesFromMaxCount( "10000" );
      expect( styles ).to.equal(
        "[count<=20000] { polygon-fill: {{color}}; polygon-opacity:1; } " +
        "[count<3981] { polygon-fill: {{color}}; polygon-opacity:0.92; } " +
        "[count<1585] { polygon-fill: {{color}}; polygon-opacity:0.84; } " +
        "[count<631] { polygon-fill: {{color}}; polygon-opacity:0.76; } " +
        "[count<251] { polygon-fill: {{color}}; polygon-opacity:0.68; } " +
        "[count<100] { polygon-fill: {{color}}; polygon-opacity:0.6; } " +
        "[count<40] { polygon-fill: {{color}}; polygon-opacity:0.52; } " +
        "[count<16] { polygon-fill: {{color}}; polygon-opacity:0.44; } " +
        "[count<6] { polygon-fill: {{color}}; polygon-opacity:0.36; } " +
        "[count<3] { polygon-fill: {{color}}; polygon-opacity:0.28; } " );
    });

    it( "adjusts styles for other opacities", function( ) {
      var styles = inaturalist.stylesFromMaxCount( "10000", 0.5 );
      expect( styles ).to.equal(
        "[count<=20000] { polygon-fill: {{color}}; polygon-opacity:0.5; } " +
        "[count<3981] { polygon-fill: {{color}}; polygon-opacity:0.46; } " +
        "[count<1585] { polygon-fill: {{color}}; polygon-opacity:0.42; } " +
        "[count<631] { polygon-fill: {{color}}; polygon-opacity:0.38; } " +
        "[count<251] { polygon-fill: {{color}}; polygon-opacity:0.34; } " +
        "[count<100] { polygon-fill: {{color}}; polygon-opacity:0.3; } " +
        "[count<40] { polygon-fill: {{color}}; polygon-opacity:0.26; } " +
        "[count<16] { polygon-fill: {{color}}; polygon-opacity:0.22; } " +
        "[count<6] { polygon-fill: {{color}}; polygon-opacity:0.18; } " +
        "[count<3] { polygon-fill: {{color}}; polygon-opacity:0.14; } " );
    });
  });

  describe( "beforeTileRender", function( ) {
    it( "just calls a callback with null", function( done ) {
      inaturalist.beforeTileRender( { }, " ", function( val ) {
        expect( val ).to.be.null;
        done( );
      });
    });
  });

  describe( "afterTileRender", function( ) {
    it( "sets a default header", function( done ) {
      var req = { params: { } };
      inaturalist.afterTileRender( req, " ", " ", { }, function( val, t, h ) {
        expect( h["Cache-Control"] ).to.equal( "public, max-age=" + (60 * 60) );
        done( );
      });
    });

    it( "sets a default header for each endpoint", function( done ) {
      var req = { params: { endpoint: 'places' } };
      inaturalist.afterTileRender( req, " ", " ", { }, function( val, t, h ) {
        expect( h["Cache-Control"] ).to.equal( "public, max-age=" + (60 * 60 * 24 * 7) );
        done( );
      });
    });

    it( "allows a custom TTL", function( done ) {
      var req = { params: { ttl: 1234 } };
      inaturalist.afterTileRender( req, " ", " ", { }, function( val, t, h ) {
        expect( h["Cache-Control"] ).to.equal( "public, max-age=1234" );
        done( );
      });
    });
  });
});
