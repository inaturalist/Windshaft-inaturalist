var squel = require("squel"),
    expect = require("chai").expect,
    inaturalist = require("../lib/inaturalist"),
    req, query,
    emptyRequest = { inat: { }, params: { } };

describe( "inaturalist", function( ) {

  beforeEach( function( ) {
    req = {
      inat: {
        taxon: { id: 1 }
      },
      params: {
        taxon_id: 1,
        user_id: 1,
        project_id: 1,
        place_id: 1
      }
    };
    query = squel.select( ).from( "observations o" );
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

  describe( "addTaxonFilter", function( ) {
    it( "adds a filter when there is a taxon", function( ) {
      inaturalist.addTaxonFilter( query, req );
      expect( query.toString( ) ).to.include(
        "INNER JOIN taxon_ancestors ta ON (ta.taxon_id = o.taxon_id) WHERE (ta.ancestor_taxon_id = 1)" );
    });

    it( "does not add a filter filter when there is no taxon", function( ) {
      inaturalist.addTaxonFilter( query, emptyRequest );
      expect( query.toString( ) ).to.not.include(
        "INNER JOIN taxon_ancestors ta ON (ta.taxon_id = o.taxon_id) WHERE (ta.ancestor_taxon_id = 1)" );
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
        "INNER JOIN place_geometries pg ON ((ST_Intersects(pg.geom, o.private_geom))) WHERE (pg.place_id = 1)" );
    });

    it( "does not add a filter filter when there is no place", function( ) {
      inaturalist.addPlaceFilter( query, emptyRequest );
      expect( query.toString( ) ).to.not.include(
        "INNER JOIN place_geometries pg ON ((ST_Intersects(pg.geom, o.private_geom))) WHERE (pg.place_id = 1)" );
    });
  });

  describe( "addProjectFilter", function( ) {
    it( "adds a filter when there is a project", function( ) {
      inaturalist.addProjectFilter( query, req );
      expect( query.toString( ) ).to.include(
        "INNER JOIN project_observations po ON (o.id = po.observation_id) WHERE (po.project_id = 1)" );
    });

    it( "does not add a filter filter when there is no project", function( ) {
      inaturalist.addProjectFilter( query, emptyRequest );
      expect( query.toString( ) ).to.not.include(
        "INNER JOIN project_observations po ON (o.id = po.observation_id) WHERE (po.project_id = 1)" );
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

  describe( "stylesFromMaxCount", function( ) {
    it( "creates the right styles for a maximum value", function( ) {
      var styles = inaturalist.stylesFromMaxCount( "10000" );
      expect( styles ).to.equal(
        "[count<=20000] { polygon-fill: {{color}}; polygon-opacity:1.0; } " +
        "[count<3981] { polygon-fill: {{color}}; polygon-opacity:0.92; } " +
        "[count<1585] { polygon-fill: {{color}}; polygon-opacity:0.84; } " +
        "[count<631] { polygon-fill: {{color}}; polygon-opacity:0.76; } " +
        "[count<251] { polygon-fill: {{color}}; polygon-opacity:0.68; } " +
        "[count<100] { polygon-fill: {{color}}; polygon-opacity:0.60; } " +
        "[count<40] { polygon-fill: {{color}}; polygon-opacity:0.52; } " +
        "[count<16] { polygon-fill: {{color}}; polygon-opacity:0.44; } " +
        "[count<6] { polygon-fill: {{color}}; polygon-opacity:0.36; } " +
        "[count<3] { polygon-fill: {{color}}; polygon-opacity:0.28; } " );
    });
  });

});
