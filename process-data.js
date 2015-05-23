var fs = require('fs');
var Ok = require('results').Ok;
var Err = require('results').Err;
var Some = require('results').Some;
var None = require('results').None;
var babyParse = require('babyparse');


function read(filename) {
  try {
    return Ok(fs.readFileSync(filename, 'utf-8'));
  } catch (err) {
    return Err(err);
  }
}


/**
 * discard the first three rows
 */
function fixHeader(contents) {
  var fixed;
  try {
    fixed = contents.split('\n').slice(3).join('\n');
    return Ok(fixed);
  } catch (err) {
    return Err(err);
  }
}


/**
 * babyparse chokes on trailing newline. help it out...
 */
function trimTrailingNewline(contents) {
  try {
    if (contents.slice(-1) !== '\n') {
      return Err('Last character was not a newline')
    }
    return Ok(contents.slice(0, -1));
  } catch (err) {
    return Err(err);
  }
}


function parseCSV(contents) {
  var config = {
    header: true,
  };
  var result = babyParse.parse(contents, config);
  if (result.errors.length > 0) {
    return Err(result.errors);
  } else {
    return Ok(result.data);
  }
}


/**
 * replace whitespace in keys with underscores
 */
function fixKeys(rows) {
  var fixed,
      fixedKey;
  return Ok(rows.map((row) => {
    fixed = {};
    Object.keys(row).forEach((k) => {
      fixedKey = k.trim().replace(/\s/g, '_').replace('#', 'NUMBER');
      fixed[fixedKey] = row[k];
    });
    return fixed;
  }));
}


function convertTypes(conversions) {
  return function(rows) {
    var converted;
    try {
      return Ok(rows.map((row) => {
        converted = {};
        Object.keys(row).forEach((k) => {
          if (conversions[k] === undefined) {
            converted[k] = row[k]
          } else {
            converted[k] = conversions[k](row[k]);
          }
        });
        return converted;
      }));
    } catch (err) {
      return Err(err);
    }
  }
}


function nestBCI(rows) {
  var years = /\d{4}/;
  var result = rows.map((row) => {
    var fixed = {BCI: {}};
    Object.keys(row).forEach((k) => {
      if (years.test(k)) {
        fixed.BCI[k] = row[k];
      } else if (k === 'CURRENT_BCI') {
        fixed.BCI.CURRENT = row[k];
      } else {
        fixed[k] = row[k];
      }
    });
    return fixed;
  });
  return Ok(result);
}


function toJSON(stuff) {
  var result = JSON.stringify(stuff, null, 2);
  if (result === undefined) {
    return Err('Could not convert to JSON:', stuff);
  }
  return Ok(result);
}


function writeFile(fname) {
  return function(contents) {
    try {
      fs.writeFileSync(fname, contents);
      return Ok(contents);
    } catch (err) {
      return Err(err);
    }
  }
}


// debug helper
function print(what) {
  console.log(what.slice(0, 3));
  return Ok();
}

// debug hlper
function logErr(err) {
  console.error('error', err);
}

// debug helper
function writePipe(name) {
  return function(contents) {
    try {
      fs.writeFileSync(name, contents);
      return Ok(contents);
    } catch (err) {
      return Err(err);
    }
  }
}



var typeConversions = (() => {
  var maybeFloat = (s) => s ? parseFloat(s) : null,
      trim = (s) => s.trim();
  return {
    '2000'        : maybeFloat,
    '2001'        : maybeFloat,
    '2002'        : maybeFloat,
    '2003'        : maybeFloat,
    '2004'        : maybeFloat,
    '2005'        : maybeFloat,
    '2006'        : maybeFloat,
    '2007'        : maybeFloat,
    '2008'        : maybeFloat,
    '2009'        : maybeFloat,
    '2010'        : maybeFloat,
    '2011'        : maybeFloat,
    '2012'        : maybeFloat,
    '2013'        : maybeFloat,
    CURRENT_BCI   : parseFloat,
    ID            : trim,
    LATITUDE      : parseFloat,
    LONGITUDE     : parseFloat,
    YEAR_BUILT    : parseInt,
    LAST_MAJOR_REHAB: parseInt,
    LAST_MINOR_REHAB: parseInt,
    NUMBER_OF_SPANS: parseInt,
    DECK_LENGTH   : parseFloat,
    WIDTH_TOTAL   : parseFloat,
  }
})();


read('2536_bridge_conditions.csv')
  .andThen(fixHeader)
  .andThen(trimTrailingNewline)
  .andThen(parseCSV)
  .andThen(fixKeys)
  .andThen(convertTypes(typeConversions))
  .andThen(nestBCI)
  .andThen(toJSON)
  .andThen(writeFile('bridge-conditions-cleaned.json'))
  .orElse(print);

