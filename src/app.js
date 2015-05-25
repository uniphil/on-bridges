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
  render() {
    var attribution = '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '| &copy; <a href="http://cartodb.com/attributions">CartoDB</a> ' +
      '| <a href="http://www.ontario.ca/government/open-government-licence-ontario">Open Government Licence</a> &ndash; Ontario';
    return (
      <Map center={[49.2867873, -84.7493416]} zoom={5}>
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
              center={[bridge.LATITUDE, bridge.LONGITUDE]}
              radius={bridge.DECK_LENGTH || 50}
              color="tomato"
              opacity={0.2}
              weight={10}
              fillColor="tomato"
              fillOpacity={0.4}
              onMouseOver={() => bridgeActions.showDetail(bridge)}
            />
          )}
      </Map>
    );
  },
});


var BridgeDetail = React.createClass({
  render() {
    var name = this.props.STRUCTURE ? sentenceCase(this.props.STRUCTURE) : null,
        status = this.props.OPERATION_STATUS,
        statusId = toStatusId(status);
    return (
      <div className="bridge-detail">
        <div className="detail basic">
          <p className="id">{this.props.ID}</p>
          <h1>{name}</h1>
          <p className={'status ' + statusId}>{status || 'unknown status'}</p>
          <p className="span">
            {this.props.DECK_LENGTH}m ({this.props.NUMBER_OF_SPANS} spans)
          </p>
        </div>
        <div className="detail type">
          <p className="specific-type">{this.props.TYPE_1}</p>
          <h1>{this.props.SUBCATEGORY_1}</h1>
          <p className="material">{this.props.MATERIAL_1}</p>
        </div>
        <div className="detail time">
          <dl>
            <dt>Built</dt>
            <dd>{this.props.YEAR_BUILT || 'unknown'}</dd>
            <dt>Last Major Rehab</dt>
            <dd>{this.props.LAST_MAJOR_REHAB || 'never'}</dd>
            <dt>Last Minor Rehab</dt>
            <dd>{this.props.LAST_MINOR_REHAB || 'never'}</dd>
            <dt>Last Inspection Date</dt>
            <dd>{this.props.LAST_INSPECTION_DATE || 'never'}</dd>
          </dl>
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
