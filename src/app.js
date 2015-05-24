var request = require('then-request');
var Reflux = require('reflux');
var React = require('react');
var {Map, TileLayer, Circle, Popup} = require('react-leaflet');


var dataActions = Reflux.createActions({
  load: {asyncResult: true},
  parse: {asyncResult: true},
});

var notificationActions = Reflux.createActions({
  queue: {},
  pop: {},
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
              fillOpacity={0.4}>
              <Popup>
                <div>
                  <header>
                    <h1>{bridge.STRUCTURE}</h1>
                  </header>
                  <div className="body">
                    <ul>
                      <li>id: {bridge.ID}</li>
                      <li>{bridge.OPERATION_STATUS}</li>
                      <li>{bridge.OWNER}</li>
                      <li>{bridge.SUBCATEGORY_1}, {bridge.TYPE_1}, {bridge.MATERIAL_1}</li>
                      <li>Built {bridge.YEAR_BUILT}</li>
                      <li>Last inspected {bridge.LAST_INSPECTION_DATE || 'never'}</li>
                      <li>Major rehab: {bridge.LAST_MAJOR_REHAB || 'never'}</li>
                      <li>Minor rehab: {bridge.LAST_MINOR_REHAB || 'never'}</li>
                      <li>Length: {bridge.DECK_LENGTH} ({bridge.NUMBER_OF_SPANS} spans)</li>
                    </ul>
                  </div>
                </div>
              </Popup>
            </Circle>
          )}
      </Map>
    );
  },
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
  ],
  componentWillMount() {
    dataActions.load();
  },
  render() {
    return (
      <div className="annoying-react-wrap">
        <BridgeMap bridges={this.state.bridges} />
        {this.state.notification &&
          <Notification {...this.state.notification}/>}
      </div>
    );
  },
});


React.render(<App/>, document.querySelector('#map-app'));
