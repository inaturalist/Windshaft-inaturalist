var inaturalist = { };

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
}

inaturalist.addTaxonCondition = function(query, req) {
  taxonIDClause = req.params.taxon_id ? "= " + req.params.taxon_id : "IS NULL";
  query.where("taxon_id " + taxonIDClause);
}

inaturalist.addUserFilter = function(query, req) {
  if (req.params.user_id) {
    query.join("users u", null, "o.user_id = u.id")
      .where("u.id = " + req.params.user_id);
  }
}

inaturalist.addPlaceFilter = function(query, req) {
  if (req.params.place_id) {
    query.join("place_geometries pg", null, "(ST_Intersects(pg.geom, o.private_geom))")
      .where("pg.place_id = " + req.params.place_id);
  }
}

inaturalist.addProjectFilter = function(query, req) {
  if (req.params.project_id) {
    query.join("project_observations po", null, "o.id = po.observation_id")
      .where("po.project_id = " + req.params.project_id);
  }
}

inaturalist.stylesFromMaxCount = function(maximumCount) {
  var i, logTransformedCount, opacity;
  var numberOfStyles = 10;
  var minOpacity = 0.2;
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

module.exports = inaturalist;
