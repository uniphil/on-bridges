var React = require('react');


var Blah = React.createClass({
  render: function() {
    return (
      <h1>hello</h1>
    );
  }
});


React.render(<Blah/>, document.querySelector('#map-app'));
