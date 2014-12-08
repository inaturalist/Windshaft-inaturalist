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
place_id||integer|grid data is restricted to observations in this project
project_id||integer|grid data is restricted to observations in this project
color||integer|HTML-escaped HEX color code (e.g. %23000000 for black). By default, colors will be [based on the taxon](http://www.inaturalist.org/pages/help#mapsymbols).

---
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
z|**true**|integer|Z value in XYZ tiling scheme (the zoom level)
taxon_id||integer|points are restricted to observations of this taxon or taxonomic group
user_id||integer|points are restricted to observations by this user
place_id||integer|points are restricted to observations in this project
project_id||integer|points are restricted to observations in this project

---
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
z|**true**|integer|Z value in XYZ tiling scheme (the zoom level)
interactivity|**true**|integer|count is currently the only accepted value
taxon_id||integer|points are restricted to observations of this taxon or taxonomic group
user_id||integer|points are restricted to observations by this user
place_id||integer|points are restricted to observations in this project
project_id||integer|points are restricted to observations in this project




