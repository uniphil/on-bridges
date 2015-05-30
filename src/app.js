var request = require('then-request');
var Reflux = require('reflux');
var React = require('react/addons');
var ReactSlider = require('react-slider');
var {Map, TileLayer, Circle, Popup} = require('react-leaflet');


function sentenceCase(str) {
  return str.slice(0, 1) + str.slice(1).toLowerCase();
}


function toStatusId(status) {
  if (status === 'Open to traffic') {
    return 'open';
  } else if (status === 'Posted for load') {
    return 'posted-load';
  } else if (status === 'Pedestrians only') {
    return 'pedestrians-only';
  } else {
    console.warn('unknown status', status);
    return 'unknown';
  }
}


var categoryColourMap = {  // colorbrewer!
  'Beam/Girder' : '#66c2a5',
  'Slab'        : '#fc8d62',
  'Frame'       : '#8da0cb',
  'Temporary Modular': '#e78ac3',
  'Truss'       : '#a6d854',
  'Arch'        : '#ffd92f',
  'Moveable Bridge': '#e5c494',
  'Other'       : '#b3b3b3',
};
var categories = Object.keys(categoryColourMap);  // for consistent ordering


var dataActions = Reflux.createActions({
  load: {asyncResult: true},
  parse: {asyncResult: true},
});

var notificationActions = Reflux.createActions({
  queue: {},
  pop: {},
});

var bridgeActions = Reflux.createActions({
  showDetail: {},
});

var filterActions = Reflux.createActions({
  setYears: {},
});

dataActions.load.listen(() =>
  request('GET', 'bridge-conditions-cleaned.json')
    .then((response) => {
      try {
        dataActions.load.completed(response.getBody());
      } catch (err) {
        dataActions.load.failed(err);
      }
    })
    .catch(dataActions.load.failed));

dataActions.load.failed.listen(() => notificationActions.queue(
  'Loading data failed',
  'This could be our fault or it could be your internet connection. ' +
  'It might just work if you reload the page.'));

dataActions.load.completed.listen(dataActions.parse);

dataActions.parse.listen((body) => {
  try {
    dataActions.parse.completed(JSON.parse(body));
  } catch (err) {
    dataActions.parse.failed(err);
  }
});

dataActions.parse.failed.listen(() => notificationActions.queue(
  'Reading data failed',
  'This could be an issue at our end or the data may have been corrupted ' +
  'while your browser was loading it. Reloading the page might clear up ' +
  'this issue.'));


var DataMixin = {
  setData(newData) {
    this.data = newData;
    this.emit();
  },
  get() {
    return this.data;
  },
  emit() {
    this.trigger(this.get());
  },
  getInitialState() {
    return this.get();
  },
};


var bridges = Reflux.createStore({
  mixins: [DataMixin],
  init() {
    this.data = [];
    this.listenTo(dataActions.parse.completed, this.setData);
  },
});


var filteredBridges = Reflux.createStore({
  mixins: [DataMixin],
  init() {
    this.state = {
      bridges: [],
      years: [1900, 2015],
    };
    this.listenTo(bridges, this.setBridges, this.setBridges);
    this.listenTo(filterActions.setYears, this.setYears, this.setYears);
  },
  setBridges(bridges) {
    this.state.bridges = bridges;
    this.emit();
  },
  setYears(years) {
    this.state.years = years;
    this.emit();
  },
  get() {
    return this.state.bridges.filter((bridge) =>
      bridge.YEAR_BUILT >= this.state.years[0] &&
      bridge.YEAR_BUILT <= this.state.years[1]);
  },
});


var bridgeStats = Reflux.createStore({
  mixins: [DataMixin],
  init() {
    this.data = {};
    this.listenTo(filteredBridges, this.computeStats, this.computeStats);
  },
  computeStats(bridges) {
    var categoryCounts = bridges.reduce((counts, bridge) => {
      if (counts[bridge.SUBCATEGORY_1] === undefined) {
        counts[bridge.SUBCATEGORY_1] = 0;
      }
      counts[bridge.SUBCATEGORY_1] += 1;
      return counts;
    }, {});
    this.setData({
      categoryCounts,
      total: bridges.length,
    });
  },
});


var detail = Reflux.createStore({
  mixins: [DataMixin],
  init() {
    this.data = null;
    this.listenTo(bridgeActions.showDetail, this.setData);
  },
});


var notifications = Reflux.createStore({
  mixins: [DataMixin],
  init() {
    this.data = [];
    this.listenTo(notificationActions.queue, this.queue);
    this.listenTo(notificationActions.pop, this.pop);
  },
  queue(title, message) {
    var newQueue = this.data.slice();
    newQueue.unshift({title: title, message: message});
    this.setData(newQueue);
  },
  pop() {
    var newQueue = this.data.slice();
    newQueue.pop();
    this.setData(newQueue);
  },
  get() {
    return this.data[this.data.length - 1];  // last or undefined
  },
});


var BridgeMap = React.createClass({
  mixins: [React.addons.PureRenderMixin],
  getInitialState() {
    return {
      dots: 'big',
    };
  },
  componentWillMount() {
    this._showing = null;
  },
  onZoom(e) {
    var z = e.target.getZoom(),
        shouldBe;
    if (z < 9) {
      shouldBe = 'big';
    } else if (z < 12) {
      shouldBe = 'med';
    } else if (z < 14) {
      shouldBe = 'small';
    } else {
      shouldBe = 'real';
    }
    if (shouldBe !== this.state.dots) {
      this.setState({dots: shouldBe});
    }
  },
  getPath(bridgeId) {
    return this.refs[bridgeId].getLeafletElement()._path;
  },
  getShowDetail(bridge) {
    var self = this;
    return function(e) {
      bridgeActions.showDetail(bridge);
      if (self._showing !== null) {
        self.getPath(self._showing).classList.remove('detail');
      }
      self._showing = bridge.ID;
      self.getPath(self._showing).classList.add('detail');
    }
  },
  render() {
    var attribution = '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '| &copy; <a href="http://cartodb.com/attributions">CartoDB</a> ' +
      '| <a href="http://www.ontario.ca/government/open-government-licence-ontario">Open Government Licence</a> &ndash; Ontario';
    return (
      <Map
        center={[49.2867873, -84.7493416]}
        zoom={5}
        zoomControl={false}
        onLeafletZoomend={this.onZoom}>
        <TileLayer
          url="http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          attribution={attribution}
        />
        {this.props.bridges
          .filter((bridge) =>
            bridge.LATITUDE !== null && bridge.LONGITUDE !== null)
          .map((bridge) => {
            var sizeBump = this.state.dots === 'big' ?
                  1000 : this.state.dots === 'med' ?
                  300 : this.state.dots === 'small' ?
                  75 : 0,
                radius = (bridge.DECK_LENGTH || 50) + sizeBump;
            return <Circle
              key={bridge.ID}
              ref={bridge.ID}
              center={[bridge.LATITUDE, bridge.LONGITUDE]}
              radius={radius}
              color="tomato"
              opacity={0}
              weight={16}
              fillColor={categoryColourMap[bridge.SUBCATEGORY_1]}
              fillOpacity={0.6}
              onMouseOver={this.getShowDetail(bridge)}
            />
          })}
      </Map>
    );
  },
});


var Timeline = React.createClass({
  render() {
    var width = (this.props.range[1] - this.props.range[0]) * this.props.scale,
        labelSpace = 100,
        valueSpace = 55;
    var timelineStyle = {
      width: labelSpace + width,
      position: 'relative',
      marginRight: valueSpace,
    };
    var bgStyle = {
      boxSizing: 'border-box',
      position: 'absolute',
      left: labelSpace,
      width: width,
      height: '100%',
      border: '1px dotted #666',
      borderWidth: '0 1px',
      background: 'hsla(0, 0%, 0%, 0.2)',
    };
    var children = React.Children.map(this.props.children, (child) =>
      React.cloneElement(child, {
        scale: this.props.scale,
        range: this.props.range,
        labelSpace: labelSpace}));
    return (
      <div className="timeline" style={timelineStyle}>
        <div className="timeline-bg" style={bgStyle}></div>
        {children}
      </div>
    );
  },
});


var Event = React.createClass({
  render() {
    var eventPosition = {
      position: 'absolute',
      left: this.props.labelSpace +
        (this.props.value - 0.5 - this.props.range[0]) * this.props.scale,
      width: 1,
      height: '100%',
      background: 'blueviolet',
    };
    var valuePosition = {
      position: 'absolute',
      left: this.props.labelSpace + 6 +
        (this.props.range[1] - this.props.range[0]) * this.props.scale,
    };
    return (
      <div style={{position: 'relative'}}>
        {this.props.children}
        {this.props.value &&
          <span className="event" style={eventPosition}></span>}
        <span className="value" style={valuePosition}>
          {this.props.value}
        </span>
      </div>
    );
  },
});


var YearFilter = React.createClass({
  getInitialState() {
    return {
      low: 1906,
      high: 2014,
    };
  },
  changeYear(to) {
    filterActions.setYears(to);
    this.setState({
      low: to[0],
      high: to[1],
    });
  },
  render() {
    return (
      <ReactSlider
        min={1900}
        max={2020}
        minDistance={1}
        withBars={true}
        pearling={true}
        defaultValue={[this.state.low, this.state.high]}
        onChange={this.changeYear}>
          <span className="low">{this.state.low}</span>
          <span className="high">{this.state.high}</span>
      </ReactSlider>
    );
  },
});


var CategoriesChart = React.createClass({
  render() {
    return (
      <ul className="unlist category-chart">
        {categories.map((cat) =>
          <li key={cat} style={{width: this.props.categoryCounts[cat] / this.props.total * 100 + '%'}}>
            <span className="bg" style={{backgroundColor: categoryColourMap[cat]}}></span>
            {this.props.categoryCounts[cat]}
          </li>
        )}
      </ul>
    );
  },
});


var Legend = React.createClass({
  render() {
    return (
      <ul className="unlist legend">
        {categories.map((k) =>
          <li key={k} style={{color: categoryColourMap[k]}}>{k}</li>
        )}
      </ul>
    );
  }
});


var BridgeDetail = React.createClass({
  render() {
    if (!this.props.ID) {
      return (
        <div className="bridge-detail hints">
          <p className="hint">Roll over markers to see details</p>
          <p className="hint">Scroll to zoom in</p>
        </div>
      );
    }

    var name = this.props.STRUCTURE ? sentenceCase(this.props.STRUCTURE) : null,
        status = this.props.OPERATION_STATUS,
        statusId = toStatusId(status),
        inspectionYear = this.props.LAST_INSPECTION_DATE ?
          parseInt(this.props.LAST_INSPECTION_DATE.split('/').pop()) :
          null;

    return (
      <div className="bridge-detail">
        <div className="detail basic">
          <h1>{name}</h1>
          <p>
            <span className="id">{this.props.ID} </span>
            <span className={'status ' + statusId}>{status || 'unknown status'}</span>
          </p>
          <p className="span">
            {this.props.DECK_LENGTH}m ({this.props.NUMBER_OF_SPANS} spans)
          </p>
        </div>
        <div className="detail type">
          <h1 style={{color: categoryColourMap[this.props.SUBCATEGORY_1]}}>
            {this.props.SUBCATEGORY_1}
          </h1>
          <p className="specific-type">{this.props.TYPE_1}</p>
          <p className="material">{this.props.MATERIAL_1}</p>
        </div>
        <div className="detail time">
          <h1>Timeline</h1>
          <Timeline range={[1900, 2014]} scale={0.75}>
            <Event value={this.props.YEAR_BUILT} empty="unknown">
              Built
            </Event>
            <Event value={this.props.LAST_MAJOR_REHAB} empty="never">
              Major rehab
            </Event>
            <Event value={inspectionYear} empty="never">
              Inspected
            </Event>
          </Timeline>
        </div>
      </div>
    );
  }
});


var Notification = React.createClass({
  componentDidMount() {
    window.addEventListener('keyup', this.dismissEsc);
  },
  componentWillUnmount() {
    window.removeEventListener('keyup', this.dismissEsc)
  },
  dismiss() {
    notificationActions.pop();
  },
  dismissEsc(e) {
    if (e.keyCode === 27) {
      this.dismiss();
    }
  },
  stopClickPropagation(e) {
    e.stopPropagation();
  },
  render() {
    return (
      <div className="notification overlay" onClick={this.dismiss}>
        <div className="content-wrap" onClick={this.stopClickPropagation}>
          <header>
            <h1>{this.props.title}</h1>
            <button onClick={this.dismiss} title="Close notification">&times;</button>
          </header>
          <div className="body">
            <p>{this.props.message}</p>
            <button className="ok" onClick={this.dismiss} title="Close notification">Dismiss</button>
          </div>
        </div>
      </div>
    );
  },
});


var App = React.createClass({
  mixins: [
    Reflux.connect(notifications, 'notification'),
    Reflux.connect(filteredBridges, 'bridges'),
    Reflux.connect(detail, 'detail'),
    Reflux.connect(bridgeStats, 'stats'),
  ],
  componentWillMount() {
    dataActions.load();
  },
  render() {
    return (
      <div className="annoying-react-wrap">
        <BridgeMap bridges={this.state.bridges} />
        <div className="aggregates">
          <YearFilter />
          <CategoriesChart {...this.state.stats} />
          <Legend />
        </div>
        <BridgeDetail {...this.state.detail} />
        {this.state.notification &&
          <Notification {...this.state.notification} />}
      </div>
    );
  },
});


React.render(<App/>, document.querySelector('#map-app'));
