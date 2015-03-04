# Windshaft-inaturalist

Wrapper around Windshaft to provide a map tiler for iNaturalist. Lots of
inspiration from https://github.com/CartoDB/Windshaft-cartodb

## OS X Installation

```bash
# assuming you use homebrew
brew install mapnik
brew install redis
brew install postgis
npm install
```

## Run
node app.js

## Run Tests
npm test

## API

### Render Grid Tile
Render a PNG tile summarizing the total number of observations matching the request parameters. Represented as a grid with opacity representing observation density. Cell sizes are fixed and based on the zoom level.
```
/observations/grid/:z/:x/:y.png
```
**Parameters**

Name | Required | Type | Description
-----|----------|------|-------------
x|**true**|integer|X value in XYZ tiling scheme
y|**true**|integer|Y value in XYZ tiling scheme
z|**true**|integer|Z value in XYZ tiling scheme (the zoom level)
taxon_id||integer|grid data is restricted to observations of this taxon or taxonomic group
user_id||integer|grid data is restricted to observations by this user
place_id||integer|grid data is restricted to observations in this place
project_id||integer|grid data is restricted to observations in this project
color||string|HTML-escaped HEX color code (e.g. %23000000 for black). By default, colors will be [based on the taxon](http://www.inaturalist.org/pages/help#mapsymbols)
opacity||float|maximum opacity of the cell contents. Cell opacities will still change based on the count of observations represented, but this value will define the high end of the range. Defaults to 1
border_opacity||float|opacity of the cell borders. Defaults to 1
ttl||integer|number of seconds to assign to the HTML header Cache-Control option max-age. Defaults to 86400 (1 day)

### Grid Tile Counts
Return a JSON file listing the counts of each cell from the grid tile method. Format is based on [UTFGrid](https://github.com/mapbox/utfgrid-spec), as used by [MapBox](https://www.mapbox.com/foundations/an-open-platform/#utfgrid)
```
/observations/grid/:z/:x/:y.grid.json?interactivity=count
```
**Parameters**

Name | Required | Type | Description
-----|----------|------|-------------
x|**true**|integer|X value in XYZ tiling scheme
y|**true**|integer|Y value in XYZ tiling scheme
z|**true**|integer|Z value in XYZ tiling scheme
interactivity|**true**|string|count is currently the only accepted value
taxon_id||integer|grid data is restricted to observations of this taxon or taxonomic group
user_id||integer|grid data is restricted to observations by this user
place_id||integer|grid data is restricted to observations in this place
project_id||integer|grid data is restricted to observations in this project
ttl||integer|number of seconds to assign to the HTML header Cache-Control option max-age. Defaults to 86400 (1 day)

### Render Point Tile
Render a PNG tile with points showing every observation matching the request parameters. Colors are [based on the taxon represented](http://www.inaturalist.org/pages/help#mapsymbols).
```
/observations/points/:z/:x/:y.png
```
**Parameters**

Name | Required | Type | Description
-----|----------|------|-------------
x|**true**|integer|X value in XYZ tiling scheme
y|**true**|integer|Y value in XYZ tiling scheme
z|**true**|integer|Z value in XYZ tiling scheme
taxon_id||integer|points are restricted to observations of this taxon or taxonomic group
user_id||integer|points are restricted to observations by this user
place_id||integer|points are restricted to observations in this place
project_id||integer|points are restricted to observations in this project
color||string|HTML-escaped HEX color code (e.g. %23000000 for black). By default, colors will be [based on the taxon](http://www.inaturalist.org/pages/help#mapsymbols)
opacity||float|opacity of the points. Defaults to 1
border_opacity||float|opacity of the point borders. Defaults to 1
ttl||integer|number of seconds to assign to the HTML header Cache-Control option max-age. Defaults to 3600 (1 hour)

### Render Place Tile
Render a PNG tile representing a place.
```
/places/:place_id/:z/:x/:y.png
```
**Parameters**

Name | Required | Type | Description
-----|----------|------|-------------
place_id|**true**|integer|ID of the place to render
x|**true**|integer|X value in XYZ tiling scheme
y|**true**|integer|Y value in XYZ tiling scheme
z|**true**|integer|Z value in XYZ tiling scheme
color||string|HTML-escaped HEX color code (defaults to %23DAA520)
ttl||integer|number of seconds to assign to the HTML header Cache-Control option max-age. Defaults to 604800 (1 week)

### Render Taxon Range Tile
Render a PNG tile representing a taxon's range, if available.
```
/taxon_ranges/:taxon_id/:z/:x/:y.png
```
**Parameters**

Name | Required | Type | Description
-----|----------|------|-------------
taxon_id|**true**|integer|ID of the taxon whose range is to be rendered
x|**true**|integer|X value in XYZ tiling scheme
y|**true**|integer|Y value in XYZ tiling scheme
z|**true**|integer|Z value in XYZ tiling scheme
color||string|HTML-escaped HEX color code (defaults to %23FF5EB0)
ttl||integer|number of seconds to assign to the HTML header Cache-Control option max-age. Defaults to 604800 (1 week)

### Render Taxon Range Tile
Render a PNG tile representing the places a taxon is known and presumed to occur. The places rendered are based on the zoom level, showing more general places at higher zooms (e.g. countries) and more specific locations at lower zooms (e.g. counties).
```
/taxon_places/:taxon_id/:z/:x/:y.png
```
**Parameters**

Name | Required | Type | Description
-----|----------|------|-------------
taxon_id|**true**|integer|ID of the taxon whose range is to be rendered
x|**true**|integer|X value in XYZ tiling scheme
y|**true**|integer|Y value in XYZ tiling scheme
z|**true**|integer|Z value in XYZ tiling scheme
confirmedColor||string|HTML-escaped HEX color code (defaults to %23FF5EB0)
unconfirmedColor||string|HTML-escaped HEX color code (defaults to %23FF5EB0)
ttl||integer|number of seconds to assign to the HTML header Cache-Control option max-age. Defaults to 604800 (1 week)
