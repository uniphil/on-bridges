var request = require('then-request');
var Reflux = require('reflux');
var React = require('react/addons');
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


categoryColourMap = {  // colorbrewer!
  'Beam/Girder' : '#8dd3c7',
  'Slab'        : '#ffffb3',
  'Frame'       : '#bebada',
  'Truss'       : '#fb8072',
  'Arch'        : '#80b1d3',
  'Moveable Bridge': '#fdb462',
  'Other'       : '#b3de69',
  'Temporary Modular': '#fccde5',
};


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


var bridges = Reflux.createStore({
  init() {
    this.data = [];
    this.listenTo(dataActions.parse.completed, this.setData);
  },
  setData(newData) {
    this.data = newData;
    this.emit();
  },
  emit() {
    this.trigger(this.data);
  },
  getInitialState() {
    return this.data;
  },
});


var detail = Reflux.createStore({
  init() {
    this.data = null;
    this.listenTo(bridgeActions.showDetail, this.setData);
  },
  setData(detail) {
    this.data = detail;
    this.emit();
  },
  emit() {
    this.trigger(this.data);
  },
  getInitialState() {
    return this.data;
  },
});


var notifications = Reflux.createStore({
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
  setData(newData) {
    this.data = newData;
    this.emit();
  },
  get() {
    return this.data[this.data.length - 1];  // last or undefined
  },
  emit() {
    this.trigger(this.get());
  },
  getInitialState() {
    return this.get();
  },
});


var BridgeMap = React.createClass({
  mixins: [React.addons.PureRenderMixin],
  componentWillMount() {
    this._showing = null;
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
      <Map center={[49.2867873, -84.7493416]} zoom={5} zoomControl={false}>
        <TileLayer
          url="http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
          attribution={attribution}
        />
        {this.props.bridges
          .filter((bridge) =>
            bridge.LATITUDE !== null && bridge.LONGITUDE !== null)
          .map((bridge) =>
            <Circle
              key={bridge.ID}
              ref={bridge.ID}
              center={[bridge.LATITUDE, bridge.LONGITUDE]}
              radius={bridge.DECK_LENGTH || 50}
              color="tomato"
              opacity={0}
              weight={16}
              fillColor={categoryColourMap[bridge.SUBCATEGORY_1]}
              fillOpacity={0.4}
              onMouseOver={this.getShowDetail(bridge)}
            />
          )}
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
    Reflux.connect(bridges, 'bridges'),
    Reflux.connect(detail, 'detail'),
  ],
  componentWillMount() {
    dataActions.load();
  },
  render() {
    return (
      <div className="annoying-react-wrap">
        <BridgeMap bridges={this.state.bridges} />
        <BridgeDetail {...this.state.detail} />
        {this.state.notification &&
          <Notification {...this.state.notification} />}
      </div>
    );
  },
});


React.render(<App/>, document.querySelector('#map-app'));
