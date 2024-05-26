var map = L.map('map', { fadeAnimation: false });
var hash = new L.Hash(map);

if (document.location.href.indexOf('#') == -1)
    if (!setViewFromCookie())
        map.setView([51.591, 24.609], 5);

var mapnik = L.tileLayer.grayscale('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
}).addTo(map);

var esri = L.tileLayer('https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: "<a href='https://wiki.openstreetmap.org/wiki/Esri'>Terms & Feedback</a>",
      maxZoom: 19,
      maxNativeZoom: 19,
      ref: "esric"
    })

var baseMaps = {
    "Mapnik": mapnik,
    "Esri Clarity": esri,
};

var layerControl = L.control.layers(baseMaps, null, { position: 'bottomright' });

L.control.locate({ drawCircle: false, drawMarker: true }).addTo(map);

//------------- GitHub control ------------------

L.Control.Link = L.Control.extend({
    onAdd: map => {
        var div = L.DomUtil.create('div', 'leaflet-control-layers control-padding control-bigfont');
        div.innerHTML += '<a target="_blank" href="https://github.com/zlant/nearest-road">GitHub</a>';
        return div;
    }
});

new L.Control.Link({ position: 'bottomright' }).addTo(map);

//------------- OsmLink analyze control --------------------

L.Control.OsmId = L.Control.extend({
    onAdd: map => {
        var div = L.DomUtil.create('div', 'leaflet-control-layers control-padding control-bigfont');
        var buttonBbox = $('<button class="control-button" id="btn-bbox">Analyze bbox</button>')
        buttonBbox.click(analyzeBbox)
        $(div).append(buttonBbox)
        div.onmousedown = div.ondblclick = div.onpointerdown = L.DomEvent.stopPropagation;
        //div.oninput = setDate;
        return div;
    }
});

new L.Control.OsmId({ position: 'topright' }).addTo(map);

//------------- LaneInfo control --------------------

L.Control.LaneInfo = L.Control.extend({
    onAdd: map => {
        var div = L.DomUtil.create('div', 'leaflet-control-layers control-padding');
        div.id = 'laneinfo';
        div.onclick = div.onpointerdown = div.onmousedown = div.ondblclick = L.DomEvent.stopPropagation;
        div.style.display = 'none';
        return div;
    }
});

//new L.Control.LaneInfo({ position: 'topright' }).addTo(map);

layerControl.addTo(map)

//----------------------------------------------------

var lanes = [];

var overpassUrl = 'https://overpass.kumi.systems/api/interpreter?data='
var overpassQuery = '[out:json][timeout:25];(way["highway"~"^motorway|trunk|primary|secondary|tertiary|unclassified|residential|service|living_street|track|road"]({{bbox}}););out body;>;out meta qt;(nwr[building]({{bbox}}););out center;'

var nominatimUrl = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=10'
var placeOsmId, placeOsmType

// ------------- functions -------------------

function analyze(url) {
    $('.control-button').prop('disabled', true);
    $.ajax(url).then(parseContent).then(render)
        .then(()=>$('.control-button').prop('disabled', false))
        .catch(()=>$('.control-button').prop('disabled', false))
}

function analyzeBbox() {
    var bounds = map.getBounds();
    var bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].join(',');
    
    var url = overpassUrl + encodeURIComponent(overpassQuery.replace(/{{bbox}}/g, bbox))
    analyze(url)
}

function parseContent(content) {
    var ways = []
    var nodes = {}
    var buildings = []
    for (var element of content.elements) {
        if (element.type === 'way' && element.tags && element.tags.highway)
            ways.push(element.nodes)
        else if (element.tags && element.tags.building) {
            if (element.center)
                buildings.push(element.center)
            else if (element.type === 'node')
                buildings.push({ lat: element.lat, lon: element.lon })
        } else if (element.type === 'node')
            nodes[element.id] = { lat: element.lat, lon: element.lon }
    }
    
    var lines = []
    for (var wayNodes of ways) {
        lines.push(turf.lineString(wayNodes.map(x=>[nodes[x].lon, nodes[x].lat])))
    }

    paths = []
    for(var building of buildings){
        var min = Infinity
        var path = null
        var point = turf.point([building.lon, building.lat])
        for(var line of lines){
            var intersect = turf.nearestPointOnLine(line, point)
            var distance = turf.distance(point, intersect, {units: 'miles'})
            if(distance < min) {
                min = distance
                path = [point.geometry.coordinates.slice().reverse(), 
                    intersect.geometry.coordinates.slice().reverse()]
            }
        }
        paths.push(path)
    }

    return paths
}

function render(dublicates){
    for(var duplicate of dublicates)
        lanes.push(L.polyline(duplicate,
            {
                color: 'red',
                weight: 2,
            })
            .addTo(map))
}

function setLocationCookie() {
    var center = map.getCenter();
    var date = new Date(new Date().getTime() + 10 * 365 * 24 * 60 * 60 * 1000);
    document.cookie = 'location=' + map.getZoom() + '/' + center.lat + '/' + center.lng + '; expires=' + date;
}

function setViewFromCookie() {
    var location = document.cookie.split('; ').find((e, i, a) => e.startsWith('location='));
    if (location == undefined)
        return false;
    location = location.split('=')[1].split('/');

    map.setView([location[1], location[2]], location[0]);
    return true;
}

function setMinDistance() {

}

function redraw() {
    for (var lane in lanes)
        lanes[lane].setStyle({ color: getColorByDate(lanes[lane].options.conditions) });
}

function mapMoveEnd() {
    setLocationCookie()
}

map.on('moveend', mapMoveEnd);
//map.on('click', closeLaneInfo);
