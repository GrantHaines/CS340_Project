/**
 * Node.js Web Application Template
 * 
 * The code below serves as a starting point for anyone wanting to build a
 * website using Node.js, Express, Handlebars, and MySQL. You can also use
 * Forever to run your service as a background process.
 */
const express = require('express');
const exphbs = require('express-handlebars');

const session = require('express-session');

const mysql = require('mysql');
const path = require('path');
const bodyParser = require("body-parser");

const async = require("async");

const app = express();

// Configure handlebars
const hbs = exphbs.create({
  defaultLayout: 'main',
  extname: '.hbs'
});

//Configure sessions
const options = {
  store: this.store, // Default is memoryStore, which is for dev only. Setup redis or memcached for prod
  secret: 'secret', // Required, used to sign session id cookie
  saveUninitialized: true, // Forces a session that is "uninitialized" to be saved to the store
  resave: false, //Forces the session to be saved back to the session store
  rolling: true //Force a session identifier cookie to be set on every response
};

const middleware = session(options);

// Configure the views
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(path.basename(__dirname), 'views'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(middleware);

// Setup static content serving
app.use(express.static(path.join(path.basename(__dirname), 'public')));

/**
 * Create a database connection. This is our middleware function that will
 * initialize a new connection to our MySQL database on every request.
 */
const config = require('./config');

function connectDb(req, res, next) {
  console.log('Connecting to the database');
  let connection = mysql.createConnection(config);
  connection.connect();
  req.db = connection;
  console.log('Database connected');
  next();
}

/*
Function to get session variables for response.
*/

function getResponse(req) {
  var response;

  if (req.session.username) {
    var response = {username: req.session.username, firstName: req.session.firstName, lastName: req.session.lastName};
  }
  else if (req.session.suppliername) {
    var response = {suppliername: req.session.suppliername};
  }
  console.log(response);
  return response;
}

/*
Function to remove session user variables
*/

function deleteSession(req) {
  delete req.session.username;
  delete req.session.firstName;
  delete req.session.lastName;
  delete req.session.suppliername;
}

/**
 * This is the handler for our main page. The middleware pipeline includes
 * our custom `connectDb()` function that creates our database connection and
 * exposes it as `req.db`.
 */
app.get('/', connectDb, function(req, res, next) {
  console.log('---Got request for the home page---');

  //info('Rendering all the products');
  req.db.query('SELECT P.productID, P.productName, P.description, P.supplierName, P.category, C.price FROM Products P, Catalog C WHERE P.productID = C.productID ORDER BY C.numberOfEntries DESC LIMIT 3', function(
    err,
    products
  ) {
    if (err) return next(err);
    var response = getResponse(req);
    res.render('home', Object.assign({products},response));
    close(req);
  });
});

app.get('/browse', connectDb, function(req, res) {
  console.log('---Got request for the browse page---');

  req.db.query('SELECT P.productID, P.productName, P.description, P.supplierName, P.category, C.price FROM Products P, Catalog C WHERE P.productID = C.productID', function(
    err,
    products
  ) {
    if (err) return next(err);
    var response = getResponse(req);
    res.render('browse', Object.assign({products}, response));
    close(req);
  });
});

app.get('/specificProduct/:id', connectDb, function(req, res, next) {
  let id = req.params.id
  req.db.query('SELECT P.productName, P.description, P.supplierName, P.category FROM Products P WHERE productID = ?', [id], function(err, productDetails) {
    if (err) return next(err);
    if (productDetails.length === 0) {
      info(`Product with id ${id} not found`);
    } else {
      var response = getResponse(req);
      res.render('specificProduct', Object.assign({productDetails}, response));
    }
    close(req);
  });
});

//Handler for customer page
app.get('/customer', connectDb, function(req, res) {
  console.log('---Got request for the customer page---');

  if (req.session.username) {
    var query = 'SELECT Orders.orderID, totalCost, datePurchased FROM Orders WHERE accountName = ? ORDER BY datePurchased';
    req.db.query(query, [req.session.username], function(err, order) {
      if (err) {
        console.log('ERROR: DB connection failed');
        throw err;
      }
      //The following uses the async library to make sure all of the items in the orders are collected before finishing the whole query.
      var orderInner = [];
      var innerQuery = 'SELECT P.productName, C.price, I.itemsOrdered FROM ItemsinOrder I INNER JOIN Catalog C ON I.catalogID = C.catalogID INNER JOIN Products P ON C.productID = P.productID WHERE I.orderID = ?';
      async.forEachOf(order, function(value, key, callback) {
        req.db.query(innerQuery, [value.orderID], function(err, orderItems) {
          if (err) throw err;
          orderInner[key] = orderItems;
          callback();
        })
      }, function(err) {
        for (var i = 0; i < order.length; i++) {
          order[i].datePurchased = order[i].datePurchased.toLocaleDateString("en-US", {year: "numeric", month: "long", day: "numeric"});
          order[i].totalCost = order[i].totalCost.toFixed(2);
          order[i].orderItems = orderInner[i];
        }
        var response = getResponse(req);
        //console.log(Object.assign({order}, response));
        res.render('customer', Object.assign({order}, response));
        close(req);
      });
    })
  }
  else {
    var response = getResponse(req);
    res.render('customer', response);
  }
});

//Handler for supplier page
app.get('/supplier', connectDb, function(req, res) {
  console.log('---Got request for the supplier page---');

  var response = getResponse(req);
  res.render('supplier', response);

  close(req);
});

//Handler for login page
app.get('/login', connectDb, function(req, res) {
  console.log('---Got request for the login page---');

  console.log('current user: ', req.session.username);
  console.log('current supplier: ', req.session.suppliername);

  var response = getResponse(req);
  res.render('login', response);

  close(req);
});

//Handler for signup page
app.get('/signup', connectDb, function(req, res) {
  console.log('---Got request for the signup page---');

  var response = getResponse(req);
  res.render('signup', response);

  close(req);
});

app.get('/signup-customer', connectDb, function(req, res) {
  console.log('---Got request for the signup-customer page---');

  var response = getResponse(req);
  res.render('signup-customer', response);

  close(req);
});

app.get('/signup-supplier', connectDb, function(req, res) {
  console.log('---Got request for the signup-supplier page---');

  var response = getResponse(req);
  res.render('signup-supplier', response);

  close(req);
});

//Handler for login POST submission
app.post('/login', connectDb, function(req, res) {
  console.log('---Got request for login action---');
  //Log in as user
  if (req.body.username) {
    req.db.query('SELECT accountName, password, firstName, lastName FROM Customer WHERE accountName = ?', [req.body.username], function(err, data) {
        if (err) {
          console.log('ERROR: DB connection failed');
          throw err;
        }

        if(data.length == 0 || data[0].password != req.body.password)
        res.render('login', {'message': 'Username not found/Password incorrect'});
        else {
          console.log('Login successful');
          //Delete previous session
          deleteSession(req);

          req.session.username = data[0].accountName;
          req.session.firstName = data[0].firstName;
          req.session.lastName = data[0].lastName;

          var response = getResponse(req);

          console.log(req.session.username + ' logged in');
          res.render('login-action', response);
        }
        close(req);
    })
  }
  //Log in as company
  else if (req.body.companyname) {
    req.db.query('SELECT supplierName, password FROM Suppliers WHERE supplierName = ?', [req.body.companyname], function(err, data) {
      if (err) {
        console.log('ERROR: DB connection failed');
        throw err;
      }

      if(data.length == 0 || data[0].password != req.body.password)
        res.render('login', {'message': 'Company name not found/Password incorrect'});
      else {
        console.log('Login successful');
        //Delete previous session
        deleteSession(req);

        req.session.suppliername = data[0].supplierName;

        var response = getResponse(req);

        console.log(req.session.username + ' logged in');
        res.render('login-action', response);
      }
      close(req);
    })
  }
});

//Handler for signup POST submission
app.post('/signup-customer', connectDb, function(req, res) {
  console.log('---Got request for signup-customer action---');

  console.log(req.body);

  //Find if username is in use
  console.log('Search for ' + req.body.username + ' in the user DB');
  var selectQuery = 'SELECT accountName FROM Customer WHERE accountName = ?';
  req.db.query(selectQuery, [req.body.username], function(err, data) {
    if (err) {
      console.log('ERROR: DB connection failed');
      throw err;
    }

    //If so add to DB
    if (data.length == 0) {
      console.log('Adding user to DB');
      var insertQuery = 'INSERT INTO Customer (accountName, password, firstName, lastName) VALUES (?, ?, ? ,?)';
      req.db.query(insertQuery, [req.body.username, req.body.password, req.body.firstname, req.body.lastname], function(err, result) {
        if (err) {
          console.log('ERROR: DB connection failed');
          throw err;
        }
        //Delete previous session
        deleteSession(req);
        //Add user to new new session
        req.session.username = req.body.username;
        req.session.firstName = req.body.firstname;
        req.session.lastName = req.body.lastname;
        //Send session variables as response
        var response = getResponse(req);

        res.render('signup-action', response);
      })
      close(req);
    }
    else {
      res.render('signup-customer', {'message': 'Account name already in use - Please try a different name'})
    }
  })
});

app.post('/signup-supplier', connectDb, function(req, res) {
  console.log('---Got request for signup-supplier action---');

  var selectQuery = 'SELECT supplierName FROM Suppliers WHERE supplierName = ?';
  req.db.query(selectQuery, [req.body.companyname], function(err, data) {
    if (err) {
      console.log('ERROR: DB connection failed');
      throw err;
    }

    //If so add to DB
    if (data.length == 0) {
      console.log('Adding company to DB');
      var insertQuery = 'INSERT INTO Suppliers (supplierName, password) VALUES (?, ?)';
      req.db.query(insertQuery, [req.body.companyname, req.body.password], function(err, result) {
        if (err) {
          console.log('ERROR: DB connection failed');
          throw err;
        }
        //Delete previous session
        deleteSession(req);
        //Add user to new new session
        req.session.suppliername = req.body.companyname;
        //Send session variables as response
        var response = getResponse(req);

        res.render('signup-action', response);
      })
      close(req);
    }
    else {
      res.render('signup-customer', {'message': 'Account name already in use - Please try a different name'});
      close(req);
    }
  })
});

//Handler for logout
app.get('/logout',(req,res) => {
  req.session.destroy((err) => {
      if(err) {
          return console.log(err);
      }
      res.redirect('/');
  });
});

/**
 * Handle all of the resources we need to clean up. In this case, we just need 
 * to close the database connection.
 * 
 * @param {Express.Request} req the request object passed to our middleware
 */
function close(req) {
  if (req.db) {
    req.db.end();
    req.db = undefined;
    console.log('Database connection closed');
  }
}
/**
 * Capture the port configuration for the server. We use the PORT environment
 * variable's value, but if it is not set, we will default to port 3945.
 */

const port = process.env.PORT || 57869;

/**
 * Start the server.
 */
app.listen(port, function() {
  console.log('== Server is listening on port', port);
});
