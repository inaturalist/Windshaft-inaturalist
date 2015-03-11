var conf = require( "./config" );
var fs = require( "fs" );
// require and configure nodetime if configured to do so
// Nodetime is a application stats and performance monitor
if( conf.nodetime && conf.nodetime.accountKey ) {
  require( "nodetime" ).profile({
    accountKey: conf.nodetime.accountKey,
    appName: conf.nodetime.appName
  });
}
// NewRelic is another stats module, which needs newrelic.js in the app root
if( fs.existsSync("newrelic.js") ) {
  var newrelic = require( "newrelic" );
}
var inaturalist = require( "./lib/inaturalist" );

var startServer = function( ) {
  inaturalist.startServer( function( ) {
    console.log( "map tiles are now being served out of: http://localhost:" +
      conf.application.listen_port + inaturalist.config.base_url + "/:z/:x/:y" );
  });
};

inaturalist.connect( startServer );
