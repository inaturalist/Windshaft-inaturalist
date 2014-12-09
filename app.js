var inaturalist = require( "./lib/inaturalist" );
var conf = conf = require( "./config" );

var startServer = function( ) {
  inaturalist.startServer( function( ) {
    console.log( "map tiles are now being served out of: http://localhost:" +
      conf.application.listen_port + inaturalist.config.base_url + "/:z/:x/:y" );
  });
};

inaturalist.connect( startServer );
