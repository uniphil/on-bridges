var React = require('react');
var {Map, TileLayer} = require('react-leaflet');


var App = React.createClass({
  render() {
    var attribution = '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '| &copy; <a href="http://cartodb.com/attributions">CartoDB</a> ' +
      '| <a href="http://www.ontario.ca/government/open-government-licence-ontario">Open Government Licence</a> &ndash; Ontario';
    return (
      <Map center={[49.2867873, -84.7493416]} zoom={6}>
        <TileLayer
          url="http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          attribution={attribution}
        />
      </Map>
    );
  }
});


React.render(<App/>, document.querySelector('#map-app'));
